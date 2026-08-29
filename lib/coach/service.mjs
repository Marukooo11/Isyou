import { randomUUID } from "node:crypto";

export class CoachError extends Error {
  constructor(code, message, status = 500, retryable = false) {
    super(message);
    this.name = "CoachError";
    this.code = code;
    this.status = status;
    this.retryable = retryable;
  }
}

const clone = value => structuredClone(value);
const isoDate = value => new Date(value).toISOString().slice(0, 10);

export class MemoryCoachStore {
  constructor() {
    this.sessions = new Map();
    this.turns = new Map();
  }

  create(state) {
    this.sessions.set(state.session_id, clone(state));
  }

  get(sessionId) {
    const state = this.sessions.get(sessionId);
    if (!state) throw new CoachError("SESSION_NOT_FOUND", "Coach 会话不存在或已过期。", 404);
    return clone(state);
  }

  save(state) {
    this.sessions.set(state.session_id, clone(state));
  }

  replay(sessionId, requestId) {
    const response = this.turns.get(`${sessionId}:${requestId}`);
    return response ? clone(response) : null;
  }

  commit(state, requestId, response) {
    this.save(state);
    this.turns.set(`${state.session_id}:${requestId}`, clone(response));
  }
}

export class CoachService {
  constructor({ store = new MemoryCoachStore(), now = () => new Date() } = {}) {
    this.store = store;
    this.now = now;
  }

  createSession(payload = {}) {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      throw new CoachError("INVALID_REQUEST", "请求体必须是 JSON 对象。", 400);
    }
    const now = this.now();
    const state = {
      session_id: `coach-${randomUUID()}`,
      state_version: 1,
      phase: "onboarding",
      domain: payload.domain || "career",
      client_user_id: payload.client_user_id || null,
      career_context: payload.career_context || {},
      preferences: payload.preferences || {},
      gap_map: [],
      stage_plan: [],
      current_stage_id: null,
      current_day: 1,
      current_task: null,
      previous_session: null,
      evidence_log: [],
      paused_from_phase: null,
      response_before_pause: null,
      last_learning_date: null,
      day_completed: false,
      created_at: now.toISOString(),
      updated_at: now.toISOString(),
      last_response: null
    };
    const response = this.onboarding(state);
    state.last_response = response;
    this.store.create(state);
    return response;
  }

  getSession(sessionId) {
    const state = this.store.get(sessionId);
    const today = isoDate(this.now());
    if (state.phase === "submission_review" && state.day_completed && state.last_learning_date && state.last_learning_date < today) {
      state.phase = "daily_review";
      state.current_day += 1;
      state.day_completed = false;
      state.state_version += 1;
      state.updated_at = this.now().toISOString();
      state.last_response = this.dailyReview(state);
      this.store.save(state);
    }
    return this.withMeta(state, state.last_response || this.onboarding(state));
  }

  handleTurn(sessionId, payload = {}) {
    const requestId = payload.request_id;
    const expectedVersion = payload.expected_state_version;
    const event = payload.event;
    if (!requestId || typeof requestId !== "string") throw new CoachError("INVALID_REQUEST", "缺少有效的 request_id。", 400);
    if (!Number.isInteger(expectedVersion)) throw new CoachError("INVALID_REQUEST", "缺少有效的 expected_state_version。", 400);
    if (!event || typeof event !== "object" || Array.isArray(event)) throw new CoachError("INVALID_REQUEST", "缺少有效的 event。", 400);
    const replay = this.store.replay(sessionId, requestId);
    if (replay) return replay;
    const state = this.store.get(sessionId);
    if (state.state_version !== expectedVersion) throw new CoachError("STATE_CONFLICT", "会话状态已更新，请重新加载。", 409, true);

    const validEvents = new Set(["message", "answer_question", "confirm_gap_map", "request_gap_change", "confirm_plan", "request_plan_change", "submit_result", "report_blocker", "request_help", "pause", "resume"]);
    if (!validEvents.has(event.type)) throw new CoachError("INVALID_REQUEST", `不支持的事件类型：${String(event.type)}`, 400);

    let response;
    if (event.type === "pause") {
      if (state.phase !== "paused") {
        state.response_before_pause = state.last_response;
        state.paused_from_phase = state.phase;
        state.phase = "paused";
      }
      response = this.response(state, "进度已经保存。准备好后从这里继续，不需要重新开始。", [{ id: "pause-notice", type: "notice", data: { tone: "neutral", text: "当前进度已保存。" } }], [{ id: "resume", label: "继续", event_type: "resume" }]);
    } else if (state.phase === "paused" && event.type === "resume") {
      state.phase = state.paused_from_phase || "onboarding";
      state.paused_from_phase = null;
      response = state.response_before_pause || this.onboarding(state);
      state.response_before_pause = null;
    } else if (state.phase === "onboarding") {
      if (!["message", "answer_question"].includes(event.type)) throw new CoachError("INVALID_REQUEST", "首次对话需要先回答 Coach 的起点问题。", 400);
      state.phase = "gap_analysis";
      state.gap_map = this.buildGapMap(state);
      response = this.response(state, "我先把目前能确认的内容和还不知道的部分分开。这里不是对你能力的判决，你可以修改。", [
        { id: "gap-map", type: "gap_map", data: { items: state.gap_map } },
        { id: "gap-boundary", type: "notice", data: { tone: "neutral", text: "没有证据的能力会标记为“待确认”，不会写成“不会”。" } }
      ], [
        { id: "confirm-gap", label: "这个分析基本准确", event_type: "confirm_gap_map" },
        { id: "change-gap", label: "我想修改", event_type: "request_gap_change" }
      ]);
    } else if (state.phase === "gap_analysis") {
      if (event.type === "confirm_gap_map") {
        state.phase = "plan_review";
        state.stage_plan = this.buildPlan();
        state.current_stage_id = state.stage_plan[0].id;
        response = this.response(state, "基于当前 Gap，我建议先确认起点，再补最关键能力，最后留下可展示的证据。计划可以随 Review 调整。", [{ id: "stage-plan", type: "stage_plan", data: { stages: state.stage_plan } }], [
          { id: "confirm-plan", label: "按这个计划开始", event_type: "confirm_plan" },
          { id: "change-plan", label: "我想调整计划", event_type: "request_plan_change" }
        ]);
      } else if (["request_gap_change", "message"].includes(event.type)) {
        response = this.response(state, "可以。请告诉我哪一条不像你，或者补充一个能支持你判断的具体经历。", [{ id: "gap-question", type: "question", data: { prompt: "你想修改哪一条？为什么？", allow_text: true } }], [{ id: "confirm-gap", label: "修改后确认", event_type: "confirm_gap_map" }]);
      } else throw new CoachError("INVALID_REQUEST", "请先确认或修改 Gap Map。", 400);
    } else if (state.phase === "plan_review") {
      if (event.type === "confirm_plan") {
        state.phase = "daily_learning";
        state.current_task = this.buildTask(state, "first");
        response = this.dailyTask(state, "今天不从零做大作品，只做一个低压力的起点定位。");
      } else if (["request_plan_change", "message"].includes(event.type)) {
        response = this.response(state, "计划可以改。你更想调整的是目标、顺序、每天投入时间，还是任务难度？", [{ id: "plan-question", type: "question", data: { prompt: "请选择或直接说明想调整的部分。", options: ["目标", "顺序", "每天时间", "难度"], allow_text: true } }], [{ id: "confirm-plan", label: "调整后开始", event_type: "confirm_plan" }]);
      } else throw new CoachError("INVALID_REQUEST", "请先确认或修改阶段计划。", 400);
    } else if (state.phase === "daily_learning") {
      if (["report_blocker", "request_help"].includes(event.type)) {
        state.current_task = this.buildTask(state, "reduce");
        response = this.dailyTask(state, "这个卡点不代表你做不到。我们先把任务缩小，只保留定位起点所需的最少证据。");
      } else if (event.type === "submit_result") {
        const record = {
          id: `evidence-${randomUUID()}`,
          day: state.current_day,
          summary: String(event.message || "用户提交了当天任务结果。").trim(),
          attachments: Array.isArray(event.evidence) ? event.evidence : [],
          completion_status: event.action_id === "task-partial" ? "partial" : "completed",
          status: "pending_review",
          created_at: this.now().toISOString()
        };
        state.evidence_log.push(record);
        state.previous_session = { day: state.current_day, task: state.current_task, result: record };
        state.last_learning_date = isoDate(this.now());
        state.day_completed = true;
        state.phase = "submission_review";
        response = this.response(state, "我已经记下今天的结果。它现在是一条待复核证据；下次 Review 后再决定它能支持什么能力判断。", [
          { id: "feedback", type: "feedback", data: { result: "received", strength: "你完成了一个可以继续讨论的具体产物或说明。", boundary: "仅凭一次提交还不能直接证明已经掌握。" } },
          { id: "evidence-update", type: "evidence_update", data: record }
        ], []);
      } else throw new CoachError("INVALID_REQUEST", "当前课程支持提交结果、报告卡点或请求帮助。", 400);
    } else if (state.phase === "daily_review") {
      if (!["message", "answer_question"].includes(event.type)) throw new CoachError("INVALID_REQUEST", "请先完成前一天的 Review。", 400);
      const text = String(event.message || "");
      const mode = event.action_id === "review_blocked" || /没|卡/.test(text) ? "reduce" : event.action_id === "review_partial" || /部分/.test(text) ? "continue" : "advance";
      if (state.evidence_log.length) state.evidence_log.at(-1).status = "reviewed";
      state.phase = "daily_learning";
      state.current_task = this.buildTask(state, mode);
      response = this.dailyTask(state, mode === "reduce" ? "昨天的主要问题是任务摩擦。今天先降低难度，不增加新的学习负担。" : mode === "continue" ? "昨天已经产生了一部分证据。今天从断点继续，不重新做整节内容。" : "昨天的起点任务已经完成。今天提高一点点难度，用新任务验证能否迁移。");
    } else {
      response = this.response(state, "今天的结果已经保存。下次进入时，我会先和你复盘，再决定后续内容。", [{ id: "day-complete-notice", type: "notice", data: { tone: "supportive", text: "今天到这里即可，不需要提前完成明天的内容。" } }], []);
    }

    state.state_version += 1;
    state.updated_at = this.now().toISOString();
    response = this.withMeta(state, response);
    state.last_response = response;
    this.store.commit(state, requestId, response);
    return response;
  }

  onboarding(state) {
    return this.response(state, `我们先不急着开始固定课程。我会围绕“${this.target(state)}”确认你的目标、已有证据和还不知道的部分，再一起决定从哪里开始。`, [{ id: "onboarding-question", type: "question", data: { prompt: "如果这次 Coach 只能先帮你解决一件事，你最希望是什么？", options: ["确认自己是否适合", "找到能力差距", "开始第一项练习", "我还不确定"], allow_text: true } }], [{ id: "answer-start", label: "提交回答", event_type: "answer_question" }]);
  }

  dailyReview(state) {
    return this.response(state, "开始今天的内容前，我们先复盘上次。重点不是打卡，而是判断任务是否合适、产生了什么证据。", [{ id: `review-day-${state.current_day - 1}`, type: "review", data: { previous_day: state.current_day - 1, previous_task: state.previous_session?.task || null, prompt: "上次完成到哪里？最大的困难是什么？" } }], [
      { id: "review-complete", label: "顺利完成", event_type: "answer_question", action_id: "review_complete" },
      { id: "review-partial", label: "只完成一部分", event_type: "answer_question", action_id: "review_partial" },
      { id: "review-blocked", label: "基本没开始 / 卡住", event_type: "answer_question", action_id: "review_blocked" }
    ]);
  }

  dailyTask(state, message) {
    return this.response(state, message, [{ id: `task-day-${state.current_day}`, type: "daily_task", data: state.current_task }], [
      { id: "task-done", label: "我完成了", event_type: "submit_result" },
      { id: "task-partial", label: "我只完成了一部分", event_type: "submit_result" },
      { id: "task-blocked", label: "我卡住了", event_type: "report_blocker" },
      { id: "task-help", label: "我需要帮助", event_type: "request_help" }
    ]);
  }

  buildGapMap(state) {
    const requirement = state.career_context?.target_requirements?.[0];
    return [
      { id: "gap-starting-level", type: "unknown", title: "当前能力起点仍待确认", status: "unknown", priority: "high", reason: "已有经历能说明接触过相关方向，但不足以判断目前能够独立完成到什么程度。", next_validation: "用一份已有作品、练习或具体经历定位起点。" },
      { id: "gap-evidence", type: "evidence", title: requirement?.text || "缺少可复核的能力证据", status: requirement ? "confirmed" : "unknown", priority: "high", reason: requirement?.text || "当前还没有足够的目标要求来源。", next_validation: "先寻找已有材料，不要求从零完成高压力作品。" }
    ];
  }

  buildPlan() {
    return [
      { id: "stage-start", title: "确认当前起点", reason: "先知道已经会什么，避免重复学习或难度过高。", status: "active", completion_criteria: ["形成至少一条经过 Review 的能力证据"] },
      { id: "stage-practice", title: "补足最关键能力", reason: "起点确认后再选择真正影响目标的优先 Gap。", status: "planned", completion_criteria: ["在一个新任务中完成迁移验证"] },
      { id: "stage-evidence", title: "形成可展示证据", reason: "让能力能够被自己和外部机会理解。", status: "planned", completion_criteria: ["形成可说明过程、结果和个人贡献的产物"] }
    ];
  }

  buildTask(state, mode) {
    const target = this.target(state);
    const available = Math.max(5, Number(state.preferences?.available_minutes || 30));
    if (mode === "reduce") return { title: "只找一条与目标相关的旧记录", reason: "当前先降低启动摩擦，不要求完整作品。", steps: ["查看相册、聊天记录、课程记录或旧文件名", "找到一条就停下", "用一句话说明它与目标的关系"], completion_criteria: ["找到或描述一条相关记录；若仍没有，说明搜索过哪些地方"], estimated_minutes: Math.min(10, available), target };
    if (mode === "continue") return { title: "从上次断点补齐一条说明", reason: "保留已经完成的部分，只补足判断起点所需的信息。", steps: ["打开上次的结果", "补充使用过的工具或自己的具体做法", "指出一个最想获得反馈的问题"], completion_criteria: ["在上次结果上新增一条可复核说明"], estimated_minutes: Math.min(15, available), target };
    if (mode === "advance") return { title: "用一个小变化验证能否迁移", reason: "完成旧证据定位后，通过新变化判断能力是否稳定。", steps: ["选择上次材料中的一个小部分", "做一个明确且可比较的调整", "记录调整前后差异"], completion_criteria: ["提交调整结果，并说明为什么这样改"], estimated_minutes: Math.min(20, available), target };
    return { title: "选择一份最能代表当前起点的已有材料", reason: "先定位起点，再决定真正需要学习什么。", steps: ["从旧作品、练习、课程记录或具体经历中选一份", "写下使用过的工具和投入时间", "标记满意与不确定的部分"], completion_criteria: ["提供一份材料或具体描述", "说明使用工具或做法", "指出一个希望获得反馈的问题"], estimated_minutes: Math.min(30, available), target };
  }

  response(state, coachMessage, blocks, actions) {
    return this.withMeta(state, { coach_message: coachMessage, ui_blocks: blocks, quick_actions: actions });
  }

  withMeta(state, response) {
    const labels = { onboarding: "首次对话", gap_analysis: "确认 Gap Map", plan_review: "确认阶段计划", daily_learning: "当天课程", submission_review: "等待下次 Review", daily_review: "上次复盘", paused: "已暂停" };
    return {
      ...clone(response),
      session_id: state.session_id,
      state_version: state.state_version,
      phase: state.phase,
      state_summary: { target_title: this.target(state), current_stage: state.current_stage_id, current_day: state.current_day, progress_label: labels[state.phase] || state.phase },
      updated_at: state.updated_at
    };
  }

  target(state) {
    return state.career_context?.selected_direction?.title || "当前职业方向";
  }
}
