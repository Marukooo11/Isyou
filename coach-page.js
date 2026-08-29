(function () {
  "use strict";

  const ui = {
    timeline: document.querySelector("#timeline"),
    connection: document.querySelector("#connection-label"),
    targetTitle: document.querySelector("#target-title"),
    targetMeta: document.querySelector("#target-meta"),
    summaryTitle: document.querySelector("#summary-title"),
    summaryMeta: document.querySelector("#summary-meta"),
    sidebarDay: document.querySelector("#sidebar-day"),
    sidebarProgress: document.querySelector("#sidebar-progress"),
    journey: document.querySelector("#journey"),
    composer: document.querySelector("#composer"),
    input: document.querySelector("#message-input"),
    send: document.querySelector("#send-button"),
    hint: document.querySelector("#composer-hint"),
    pause: document.querySelector("#pause-button"),
    reset: document.querySelector("#reset-button"),
    back: document.querySelector("#back-button"),
    toast: document.querySelector("#toast"),
  };

  const HISTORY_KEY = "isyou_coach_ui_history_v2";
  const CONTEXT_KEY = "isyou_career_context";
  const CONTEXT_SIGNATURE_KEY = "isyou_coach_context_signature_v1";
  const API_SESSION_KEY = "isyou_coach_product_session_v1";
  const DEMO_STATE_KEY = "isyou_coach_fallback_state_v1";
  const DAY_MILLISECONDS = 24 * 60 * 60 * 1000;

  let gateway = null;
  let currentResponse = null;
  let history = [];
  let selectedAnswer = "";
  let isBusy = false;
  let toastTimer = null;

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = String(text);
    return node;
  }

  function readCareerContext() {
    const fallback = {
      selected_direction: {
        id: "data-annotation",
        title: "数据标注专员",
        source_refs: ["frontend-demo"],
      },
      target_requirements: [
        {
          id: "clear-process",
          text: "能够按明确规范独立完成标注，并在固定会议中进行简短同步。",
          source_ref: "frontend-demo",
        },
      ],
      user_profile: {
        facts: ["偏好规则稳定的任务", "低感官负荷时更容易专注", "更适合独立完成边界清楚的工作"],
        evidence: [],
        constraints: ["持续人声会影响专注", "临时需求变更会增加启动困难"],
        open_questions: ["短视频会议中的表达负担是否可接受"],
      },
      source_meta: "来自岗位匹配结果",
    };
    try {
      const saved = JSON.parse(sessionStorage.getItem(CONTEXT_KEY) || "null");
      if (!saved || !saved.selected_direction) return fallback;
      return Object.assign({}, fallback, saved, {
        selected_direction: Object.assign({}, fallback.selected_direction, saved.selected_direction),
        user_profile: Object.assign({}, fallback.user_profile, saved.user_profile || {}),
      });
    } catch (_error) {
      return fallback;
    }
  }

  function startPayload() {
    return {
      client_user_id: "hackathon-demo-user",
      domain: "career",
      career_context: readCareerContext(),
      preferences: {
        language: "zh-CN",
        available_minutes: 20,
        communication_style: "clear_and_supportive",
      },
    };
  }

  function contextSignature(payload) {
    const context = payload.career_context || {};
    const selected = context.selected_direction || {};
    return JSON.stringify({
      id: selected.id || "",
      title: selected.title || "",
      requirements: (context.target_requirements || []).map(function (item) { return item.text || ""; }),
    });
  }

  function todayString(date) {
    const value = date || new Date();
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, "0");
    const day = String(value.getDate()).padStart(2, "0");
    return year + "-" + month + "-" + day;
  }

  function addDay(dateString) {
    const date = new Date(dateString + "T12:00:00");
    return todayString(new Date(date.getTime() + DAY_MILLISECONDS));
  }

  function createId() {
    if (window.crypto && typeof window.crypto.randomUUID === "function") {
      return window.crypto.randomUUID();
    }
    return "demo-" + Date.now() + "-" + Math.random().toString(16).slice(2);
  }

  class DemoCoachAdapter {
    constructor() {
      this.mode = "demo";
      this.state = null;
    }

    async health() {
      return { status: "demo" };
    }

    async start(payload) {
      const context = payload.career_context || {};
      this.state = {
        sessionId: "demo-" + createId(),
        stateVersion: 1,
        phase: "onboarding",
        day: 1,
        target: (context.selected_direction || {}).title || "当前职业方向",
        context: context,
        pausedFrom: null,
        lastBeforePause: null,
      };
      return this.save(this.onboarding());
    }

    async restore() {
      try {
        const saved = JSON.parse(localStorage.getItem(DEMO_STATE_KEY) || "null");
        if (!saved || !saved.state || !saved.response) return null;
        this.state = saved.state;
        return saved.response;
      } catch (_error) {
        this.clear();
        return null;
      }
    }

    async turn(event) {
      if (!this.state) throw new Error("Demo Coach 尚未创建会话");
      const phase = this.state.phase;
      let response;

      if (event.type === "pause" && phase !== "paused") {
        this.state.pausedFrom = phase;
        const saved = JSON.parse(localStorage.getItem(DEMO_STATE_KEY) || "null");
        this.state.lastBeforePause = saved && saved.response ? saved.response : null;
        this.state.phase = "paused";
        response = this.respond(
          "进度已经保存。准备好后从这里继续，不需要重新开始。",
          [{ id: "pause-notice", type: "notice", data: { tone: "neutral", text: "当前进度已保存。" } }],
          [{ id: "resume", label: "继续", event_type: "resume" }]
        );
      } else if (phase === "paused" && event.type === "resume") {
        this.state.phase = this.state.pausedFrom || "onboarding";
        this.state.pausedFrom = null;
        const previous = this.state.lastBeforePause;
        response = previous
          ? this.respond("欢迎回来，我们从刚才停下的位置继续。", previous.ui_blocks || [], previous.quick_actions || [])
          : this.onboarding();
      } else if (phase === "onboarding") {
        this.state.phase = "gap_analysis";
        response = this.gapMap();
      } else if (phase === "gap_analysis") {
        if (event.type === "confirm_gap_map") {
          this.state.phase = "plan_review";
          response = this.plan();
        } else {
          response = this.respond(
            "可以。请告诉我哪一条不像你，或者补充一个能支持你判断的具体经历。",
            [{ id: "gap-question", type: "question", data: { prompt: "你想修改哪一条？为什么？", allow_text: true } }],
            [{ id: "confirm-gap", label: "修改后确认", event_type: "confirm_gap_map" }]
          );
        }
      } else if (phase === "plan_review") {
        if (event.type === "confirm_plan") {
          this.state.phase = "daily_learning";
          response = this.dailyTask("first");
        } else {
          response = this.respond(
            "计划可以改。你更想调整的是目标、顺序、每天投入时间，还是任务难度？",
            [{ id: "plan-question", type: "question", data: { prompt: "请选择或直接说明想调整的部分。", options: ["目标", "顺序", "每天时间", "难度"], allow_text: true } }],
            [{ id: "confirm-plan", label: "调整后开始", event_type: "confirm_plan" }]
          );
        }
      } else if (phase === "daily_learning") {
        if (event.type === "report_blocker" || event.type === "request_help") {
          response = this.dailyTask("reduce");
        } else if (event.type === "submit_result") {
          this.state.phase = "submission_review";
          const summary = event.message || "用户提交了当天任务结果。";
          response = this.respond(
            "我已经记下今天的结果。它现在是一条待复核证据，明天 Review 后再决定它能支持什么能力判断。",
            [
              { id: "feedback", type: "feedback", data: { result: "received", strength: "你完成了一个可以继续讨论的具体产物或说明。", boundary: "仅凭一次提交还不能直接证明已经掌握。" } },
              { id: "evidence-update", type: "evidence_update", data: { day: this.state.day, summary: summary, completion_status: event.action_id === "task-partial" ? "partial" : "completed", status: "pending_review" } },
            ],
            []
          );
        } else {
          response = this.dailyTask("first");
        }
      } else if (phase === "daily_review") {
        this.state.phase = "daily_learning";
        if (event.action_id === "review_blocked") response = this.dailyTask("reduce");
        else if (event.action_id === "review_partial") response = this.dailyTask("continue");
        else response = this.dailyTask("advance");
      } else if (phase === "submission_review") {
        response = this.respond(
          "今天的结果已经保存。下一次进入时，我会先和你复盘，再决定后续内容。",
          [{ id: "day-complete-notice", type: "notice", data: { tone: "supportive", text: "今天到这里即可，不需要提前完成明天的内容。" } }],
          []
        );
      } else {
        response = this.onboarding();
      }

      this.state.stateVersion += 1;
      response.state_version = this.state.stateVersion;
      response.phase = this.state.phase;
      response.state_summary = this.summary();
      return this.save(response);
    }

    async advanceDay() {
      if (!this.state || this.state.phase !== "submission_review") return this.restore();
      this.state.day += 1;
      this.state.phase = "daily_review";
      this.state.stateVersion += 1;
      return this.save(this.respond(
        "开始今天的内容前，我们先复盘昨天。重点不是打卡，而是判断任务是否合适、产生了什么证据。",
        [{ id: "review-day-1", type: "review", data: { previous_day: this.state.day - 1, previous_task: { title: "选择一份最能代表当前起点的已有材料" }, prompt: "昨天完成到哪里？最大的困难是什么？" } }],
        [
          { id: "review-complete", label: "顺利完成", event_type: "answer_question", action_id: "review_complete" },
          { id: "review-partial", label: "只完成一部分", event_type: "answer_question", action_id: "review_partial" },
          { id: "review-blocked", label: "基本没开始或卡住", event_type: "answer_question", action_id: "review_blocked" },
        ]
      ));
    }

    clear() {
      this.state = null;
      localStorage.removeItem(DEMO_STATE_KEY);
    }

    save(response) {
      localStorage.setItem(DEMO_STATE_KEY, JSON.stringify({ state: this.state, response: response }));
      return response;
    }

    summary() {
      const labels = {
        onboarding: "首次对话",
        gap_analysis: "确认 Gap Map",
        plan_review: "确认阶段计划",
        daily_learning: "当天课程",
        submission_review: "等待次日 Review",
        daily_review: "前一天复盘",
        paused: "已暂停",
      };
      return {
        target_title: this.state.target,
        current_stage: this.state.phase === "daily_learning" ? "stage-start" : null,
        current_day: this.state.day,
        progress_label: labels[this.state.phase] || this.state.phase,
      };
    }

    respond(message, blocks, actions) {
      return {
        session_id: this.state.sessionId,
        state_version: this.state.stateVersion,
        phase: this.state.phase,
        coach_message: message,
        ui_blocks: blocks,
        quick_actions: actions,
        state_summary: this.summary(),
        updated_at: new Date().toISOString(),
      };
    }

    onboarding() {
      return this.respond(
        "我们先不急着开始固定课程。我会围绕“" + this.state.target + "”确认你的目标、已有证据和还不知道的部分，再一起决定从哪里开始。",
        [{ id: "onboarding-question", type: "question", data: { prompt: "如果这次 Coach 只能先帮你解决一件事，你最希望是什么？", options: ["确认自己是否适合", "找到能力差距", "开始第一项练习", "我还不确定"], allow_text: true } }],
        [{ id: "answer-start", label: "提交回答", event_type: "answer_question" }]
      );
    }

    gapMap() {
      const requirement = ((this.state.context.target_requirements || [])[0] || {}).text || "目标岗位的能力要求仍待补充。";
      return this.respond(
        "我先把目前能确认的内容和还不知道的部分分开。这里不是对你能力的判决，你可以修改。",
        [
          { id: "gap-map", type: "gap_map", data: { items: [
            { id: "gap-start", title: "当前能力起点仍待确认", status: "unknown", priority: "high", reason: "已有经历能说明接触过相关方向，但不足以判断目前能够独立完成到什么程度。", next_validation: "用一份已有作品、练习或具体经历定位起点。" },
            { id: "gap-evidence", title: "缺少可复核的能力证据", status: "confirmed", priority: "high", reason: requirement, next_validation: "先寻找已有材料，不要求从零完成高压力作品。" },
          ] } },
          { id: "gap-boundary", type: "notice", data: { tone: "neutral", text: "没有证据的能力会标记为“待确认”，不会写成“不会”。" } },
        ],
        [
          { id: "confirm-gap", label: "这个分析基本准确", event_type: "confirm_gap_map" },
          { id: "change-gap", label: "我想修改", event_type: "request_gap_change" },
        ]
      );
    }

    plan() {
      return this.respond(
        "基于当前 Gap，我建议先确认起点，再补最关键能力，最后留下可展示的证据。计划可以随 Review 调整。",
        [{ id: "stage-plan", type: "stage_plan", data: { stages: [
          { id: "stage-start", title: "确认当前起点", reason: "先知道已经会什么，避免重复学习或难度过高。", status: "active", completion_criteria: ["形成至少一条经过 Review 的能力证据"] },
          { id: "stage-practice", title: "补足最关键能力", reason: "起点确认后才选择真正影响目标的优先 Gap。", status: "planned", completion_criteria: ["在一个新任务中完成迁移验证"] },
          { id: "stage-evidence", title: "形成可展示证据", reason: "让能力能够被自己和外部机会理解。", status: "planned", completion_criteria: ["形成可说明过程、结果和个人贡献的产物"] },
        ] } }],
        [
          { id: "confirm-plan", label: "按这个计划开始", event_type: "confirm_plan" },
          { id: "change-plan", label: "我想调整计划", event_type: "request_plan_change" },
        ]
      );
    }

    dailyTask(mode) {
      const tasks = {
        first: {
          intro: "今天不从零做大作品，只做一个低压力的起点定位。",
          title: "选择一份最能代表当前起点的已有材料",
          reason: "先定位起点，再决定真正需要学习什么。",
          steps: ["从旧作品、练习、课程记录或具体经历中选一份", "写下使用过的工具和投入时间", "标记满意与不确定的部分"],
          completion_criteria: ["提供一份材料或具体描述", "说明使用工具或做法", "指出一个希望获得反馈的问题"],
          estimated_minutes: 20,
        },
        reduce: {
          intro: "这个卡点不代表你做不到。我们先把任务缩小，只保留定位起点所需的最少证据。",
          title: "只找一条与目标相关的旧记录",
          reason: "当前先降低启动摩擦，不要求完整作品。",
          steps: ["查看相册、聊天记录、课程记录或旧文件名", "找到一条就停下", "用一句话说明它与目标的关系"],
          completion_criteria: ["找到或描述一条相关记录，若仍没有，说明搜索过哪些地方"],
          estimated_minutes: 10,
        },
        continue: {
          intro: "昨天已经产生了一部分证据。今天从断点继续，不重新做整节内容。",
          title: "从昨天的断点补齐一条说明",
          reason: "保留已经完成的部分，只补足判断起点所需的信息。",
          steps: ["打开昨天的结果", "补充使用过的工具或自己的具体做法", "指出一个最想获得反馈的问题"],
          completion_criteria: ["在昨天结果上新增一条可复核说明"],
          estimated_minutes: 15,
        },
        advance: {
          intro: "昨天的起点任务已经完成。今天提高一点点难度，用新任务验证能否迁移。",
          title: "用一个小变化验证能否迁移",
          reason: "完成旧证据定位后，需要通过新变化判断能力是否稳定。",
          steps: ["选择昨天材料中的一个小部分", "做一个明确且可比较的调整", "记录调整前后差异"],
          completion_criteria: ["提交调整结果，并说明为什么这样改"],
          estimated_minutes: 20,
        },
      };
      const task = tasks[mode] || tasks.first;
      return this.respond(
        task.intro,
        [{ id: "task-day-" + this.state.day, type: "daily_task", data: Object.assign({ target: this.state.target }, task) }],
        [
          { id: "task-done", label: "我完成了", event_type: "submit_result" },
          { id: "task-partial", label: "我只完成了一部分", event_type: "submit_result" },
          { id: "task-blocked", label: "我卡住了", event_type: "report_blocker" },
          { id: "task-help", label: "我需要帮助", event_type: "request_help" },
        ]
      );
    }
  }

  class CoachGateway {
    constructor() {
      const params = new URLSearchParams(window.location.search);
      this.requestedMode = params.get("mode") || "auto";
      this.apiBase = params.get("api") || window.ISYOU_COACH_API || "";
      this.demoDate = todayString();
      this.api = new window.IsyouCoach.CoachClient({
        baseUrl: this.apiBase,
        storageKey: API_SESSION_KEY,
        demoDate: this.demoDate,
      });
      this.demo = new DemoCoachAdapter();
      this.active = null;
      this.mode = null;
    }

    async connect() {
      if (this.requestedMode === "demo") {
        this.active = this.demo;
        this.mode = "demo";
        return;
      }
      try {
        await Promise.race([
          this.api.health(),
          new Promise(function (_resolve, reject) {
            setTimeout(function () { reject(new Error("Coach API 连接超时")); }, 1600);
          }),
        ]);
        this.active = this.api;
        this.mode = "api";
      } catch (error) {
        if (this.requestedMode === "api") throw error;
        this.active = this.demo;
        this.mode = "demo";
      }
    }

    async startOrRestore(payload) {
      const restored = await this.active.restore();
      return restored || this.active.start(payload);
    }

    async turn(event) {
      return this.active.turn(event);
    }

    async advanceDay() {
      if (this.mode === "demo") return this.demo.advanceDay();
      this.demoDate = addDay(this.demoDate);
      this.api.demoDate = this.demoDate;
      return this.api.restore();
    }

    clear() {
      this.api.clear();
      this.demo.clear();
    }
  }

  function loadHistory(sessionId) {
    try {
      const saved = JSON.parse(localStorage.getItem(HISTORY_KEY) || "null");
      if (saved && saved.sessionId === sessionId && Array.isArray(saved.items)) return saved.items;
    } catch (_error) {
      return [];
    }
    return [];
  }

  function saveHistory() {
    if (!currentResponse) return;
    const trimmed = history.slice(-36);
    localStorage.setItem(HISTORY_KEY, JSON.stringify({ sessionId: currentResponse.session_id, items: trimmed }));
  }

  function responseKey(response) {
    return response.session_id + ":" + response.state_version + ":" + response.phase;
  }

  function appendResponse(response) {
    const key = responseKey(response);
    const exists = history.some(function (item) { return item.kind === "coach" && item.key === key; });
    if (!exists) history.push({ kind: "coach", key: key, response: response });
  }

  function appendUser(text) {
    if (!text) return;
    history.push({ kind: "user", text: text, createdAt: new Date().toISOString() });
  }

  function statusText(status) {
    return {
      unknown: "待确认",
      confirmed: "已确认",
      planned: "待开始",
      active: "进行中",
      pending_review: "待复盘",
      reviewed: "已复盘",
      partial: "部分完成",
      completed: "已完成",
    }[status] || status || "待确认";
  }

  function renderQuestion(block, interactive) {
    const body = element("div", "ui-block__body question");
    body.appendChild(element("div", "block-label", "Coach 想先确认"));
    body.appendChild(element("p", "question__prompt", block.data.prompt || "请补充你的情况。"));
    const options = block.data.options || [];
    if (options.length) {
      const list = element("div", "option-list");
      options.forEach(function (option) {
        const button = element("button", "option-button", option);
        button.type = "button";
        button.disabled = !interactive || isBusy;
        if (selectedAnswer === option) button.classList.add("is-selected");
        if (interactive) {
          button.addEventListener("click", function () {
            selectedAnswer = option;
            ui.input.value = option;
            ui.hint.classList.remove("is-error");
            ui.hint.textContent = "已选中。你可以直接提交，也可以继续补充。";
            renderTimeline();
          });
        }
        list.appendChild(button);
      });
      body.appendChild(list);
    }
    return body;
  }

  function renderGapMap(block) {
    const body = element("div", "ui-block__body");
    body.appendChild(element("div", "block-label", "当前 Gap Map"));
    const list = element("div", "gap-list");
    (block.data.items || []).forEach(function (item) {
      const card = element("article", "gap-item");
      card.appendChild(element("div", "gap-item__title", item.title));
      card.appendChild(element("div", "gap-item__status", statusText(item.status)));
      card.appendChild(element("p", "gap-item__reason", item.reason));
      card.appendChild(element("p", "gap-item__next", "下一步验证：" + (item.next_validation || "继续补充证据")));
      list.appendChild(card);
    });
    body.appendChild(list);
    return body;
  }

  function renderStagePlan(block) {
    const body = element("div", "ui-block__body");
    body.appendChild(element("div", "block-label", "你的阶段计划"));
    const list = element("div", "plan-list");
    (block.data.stages || []).forEach(function (stage, index) {
      const row = element("div", "plan-stage" + (stage.status === "active" ? " is-active" : ""));
      row.appendChild(element("div", "plan-stage__number", index + 1));
      const copy = element("div");
      copy.appendChild(element("div", "plan-stage__title", stage.title));
      copy.appendChild(element("p", "plan-stage__reason", stage.reason));
      row.appendChild(copy);
      list.appendChild(row);
    });
    body.appendChild(list);
    return body;
  }

  function renderDailyTask(block, interactive) {
    const data = block.data || {};
    const body = element("div", "ui-block__body");
    body.appendChild(element("div", "task-meta", "Day " + ((currentResponse && currentResponse.state_summary.current_day) || 1) + "　约 " + (data.estimated_minutes || 20) + " 分钟"));
    body.appendChild(element("h3", "task-title", data.title));
    body.appendChild(element("p", "task-reason", data.reason));
    const grid = element("div", "task-grid");
    const steps = element("section", "task-section");
    steps.appendChild(element("h4", "", "怎么做"));
    const stepList = element("ol");
    (data.steps || []).forEach(function (step) { stepList.appendChild(element("li", "", step)); });
    steps.appendChild(stepList);
    const criteria = element("section", "task-section");
    criteria.appendChild(element("h4", "", "做到这里就可以"));
    const criteriaList = element("ul");
    (data.completion_criteria || []).forEach(function (item) { criteriaList.appendChild(element("li", "", item)); });
    criteria.appendChild(criteriaList);
    grid.appendChild(steps);
    grid.appendChild(criteria);
    body.appendChild(grid);
    if (interactive) {
      const fills = element("div", "quick-fill");
      ["我找到了一个旧作品", "我只找到一条文字记录", "我暂时没找到合适材料"].forEach(function (copy) {
        const button = element("button", "micro-action", copy);
        button.type = "button";
        button.addEventListener("click", function () {
          ui.input.value = copy;
          ui.input.focus();
          ui.hint.classList.remove("is-error");
          ui.hint.textContent = "已经帮你填入结果，可以补充细节后提交。";
        });
        fills.appendChild(button);
      });
      body.appendChild(fills);
    }
    return body;
  }

  function renderReview(block) {
    const data = block.data || {};
    const body = element("div", "ui-block__body review");
    body.appendChild(element("div", "block-label", "Day " + (data.previous_day || 1) + " Review"));
    const previous = element("div", "review-previous");
    previous.appendChild(element("strong", "", "昨天的任务"));
    previous.appendChild(document.createTextNode("　" + (((data.previous_task || {}).title) || "确认能力起点")));
    body.appendChild(previous);
    body.appendChild(element("p", "review__prompt", data.prompt || "昨天完成到哪里？最大的困难是什么？"));
    return body;
  }

  function renderFeedback(block) {
    const data = block.data || {};
    const body = element("div", "ui-block__body");
    body.appendChild(element("div", "block-label", "Coach 反馈"));
    const grid = element("div", "feedback-grid");
    const strength = element("div", "feedback-cell");
    strength.appendChild(element("strong", "", "已经产生的信号"));
    strength.appendChild(element("p", "", data.strength || "已收到你的结果。"));
    const boundary = element("div", "feedback-cell");
    boundary.appendChild(element("strong", "", "目前的判断边界"));
    boundary.appendChild(element("p", "", data.boundary || "还需要后续任务继续验证。"));
    grid.appendChild(strength);
    grid.appendChild(boundary);
    body.appendChild(grid);
    return body;
  }

  function renderEvidence(block) {
    const data = block.data || {};
    const body = element("div", "ui-block__body evidence");
    body.appendChild(element("p", "evidence__summary", data.summary || "已保存一条学习证据。"));
    body.appendChild(element("span", "evidence-state", statusText(data.status)));
    body.appendChild(element("div", "evidence__meta", "Day " + (data.day || 1) + "　" + statusText(data.completion_status)));
    return body;
  }

  function renderNotice(block) {
    const body = element("div", "ui-block__body");
    body.appendChild(element("div", "notice", block.data.text || "当前状态已经保存。"));
    return body;
  }

  function renderBlock(block, interactive) {
    const wrapper = element("article", "ui-block ui-block--" + block.type);
    const renderers = {
      question: function (value) { return renderQuestion(value, interactive); },
      gap_map: renderGapMap,
      stage_plan: renderStagePlan,
      daily_task: function (value) { return renderDailyTask(value, interactive); },
      review: renderReview,
      feedback: renderFeedback,
      evidence_update: renderEvidence,
      notice: renderNotice,
    };
    const renderer = renderers[block.type] || renderNotice;
    wrapper.appendChild(renderer(block));
    return wrapper;
  }

  function actionNeedsText(action) {
    if (action.event_type === "submit_result") return true;
    return action.event_type === "answer_question" && !action.action_id && action.id === "answer-start";
  }

  function renderActions(response) {
    const actions = element("div", "actions");
    (response.quick_actions || []).forEach(function (action) {
      const button = element("button", "quick-action", action.label);
      button.type = "button";
      button.disabled = isBusy;
      button.addEventListener("click", function () { handleAction(action); });
      actions.appendChild(button);
    });
    return actions;
  }

  function renderCoachTurn(item, isLatest) {
    const response = item.response;
    const turn = element("section", "turn" + (isLatest ? "" : " turn--history"));
    turn.dataset.responseKey = item.key;
    turn.appendChild(element("div", "turn__stamp", "Coach　Day " + response.state_summary.current_day));
    turn.appendChild(element("div", "coach-message", response.coach_message));
    const blocks = element("div", "blocks");
    (response.ui_blocks || []).forEach(function (block) {
      blocks.appendChild(renderBlock(block, isLatest));
    });
    if (blocks.children.length) turn.appendChild(blocks);
    if (isLatest && (response.quick_actions || []).length) turn.appendChild(renderActions(response));
    if (isLatest && response.phase === "submission_review") {
      const next = element("div", "next-day");
      next.appendChild(element("p", "", "Demo 演示可以直接进入下一学习日。真实使用时，用户下次打开会自动先做 Review。"));
      const button = element("button", "secondary-button", "进入第 2 天 Review");
      button.type = "button";
      button.disabled = isBusy;
      button.addEventListener("click", advanceDay);
      next.appendChild(button);
      turn.appendChild(next);
    }
    return turn;
  }

  function renderTimeline() {
    ui.timeline.innerHTML = "";
    if (!history.length) {
      const empty = element("div", "empty-panel");
      empty.appendChild(element("h2", "", "还没有对话"));
      empty.appendChild(element("p", "", "Coach 正在准备你的第一条问题。"));
      ui.timeline.appendChild(empty);
      return;
    }
    history.forEach(function (item, index) {
      if (item.kind === "user") {
        ui.timeline.appendChild(element("div", "user-message", item.text));
      } else {
        const isLatest = index === history.length - 1 || !history.slice(index + 1).some(function (later) { return later.kind === "coach"; });
        ui.timeline.appendChild(renderCoachTurn(item, isLatest));
      }
    });
    ui.timeline.setAttribute("aria-busy", String(isBusy));
  }

  function updateJourney(phase) {
    const order = ["discover", "gap", "plan", "learn"];
    const phaseStep = {
      onboarding: "discover",
      gap_analysis: "gap",
      plan_review: "plan",
      daily_learning: "learn",
      submission_review: "learn",
      daily_review: "learn",
      paused: "learn",
    }[phase] || "discover";
    const activeIndex = order.indexOf(phaseStep);
    ui.journey.querySelectorAll(".journey__item").forEach(function (node, index) {
      node.classList.toggle("is-active", index === activeIndex);
      node.classList.toggle("is-done", index < activeIndex);
    });
  }

  function updateChrome(response) {
    const summary = response.state_summary || {};
    ui.targetTitle.textContent = summary.target_title || "当前职业方向";
    ui.targetMeta.textContent = "围绕真实目标确认差距，计划会随每天的 Review 调整。";
    ui.summaryTitle.textContent = summary.progress_label || "成长 Coach";
    ui.summaryMeta.textContent = "Day " + (summary.current_day || 1) + "　进度已保存";
    ui.sidebarDay.textContent = "Day " + (summary.current_day || 1);
    ui.sidebarProgress.textContent = summary.progress_label || "进行中";
    ui.pause.textContent = response.phase === "paused" ? "继续" : "暂停";
    updateJourney(response.phase);

    const phasePrompts = {
      onboarding: "写下你最希望先解决的一件事",
      gap_analysis: "如果分析不准确，可以直接说明",
      plan_review: "你可以调整目标、顺序、时间或难度",
      daily_learning: "写下今天的结果或遇到的卡点",
      submission_review: "今天的内容已保存",
      daily_review: "也可以补充昨天最具体的困难",
      paused: "点击继续后回到刚才的位置",
    };
    ui.input.placeholder = phasePrompts[response.phase] || "回复 Coach";
    const locked = response.phase === "submission_review" || response.phase === "paused";
    ui.input.disabled = locked || isBusy;
    ui.send.disabled = locked || isBusy;
  }

  function setBusy(value) {
    isBusy = value;
    document.querySelectorAll("button").forEach(function (button) {
      if (button.id !== "back-button") button.disabled = value;
    });
    if (currentResponse) updateChrome(currentResponse);
    renderTimeline();
  }

  function setHint(message, isError) {
    ui.hint.textContent = message;
    ui.hint.classList.toggle("is-error", Boolean(isError));
  }

  function showToast(message) {
    clearTimeout(toastTimer);
    ui.toast.textContent = message;
    ui.toast.classList.remove("is-hidden");
    toastTimer = setTimeout(function () { ui.toast.classList.add("is-hidden"); }, 3200);
  }

  function readableError(error) {
    if (error && error.code === "STATE_CONFLICT") return "会话刚刚在别处更新，正在重新加载。";
    if (error && error.message) return error.message;
    return "Coach 暂时没有响应，请稍后重试。";
  }

  async function handleAction(action) {
    if (isBusy) return;
    const typed = ui.input.value.trim();
    const message = typed || selectedAnswer;
    if (actionNeedsText(action) && !message) {
      setHint(action.event_type === "submit_result" ? "先用一句话写下你完成了什么，再提交结果。" : "请先选一个回答，或写下自己的想法。", true);
      ui.input.focus();
      return;
    }
    const event = {
      type: action.event_type,
      action_id: action.action_id || action.id,
      message: message,
      evidence: action.event_type === "submit_result" ? [{ type: "note", value: message }] : [],
    };
    const userCopy = message || action.label;
    setBusy(true);
    try {
      const response = await gateway.turn(event);
      appendUser(userCopy);
      currentResponse = response;
      appendResponse(response);
      selectedAnswer = "";
      ui.input.value = "";
      setHint("进度已保存。Coach 会根据这一步继续调整。", false);
      saveHistory();
      updateChrome(response);
    } catch (error) {
      if (error && error.code === "STATE_CONFLICT") {
        const restored = await gateway.active.restore();
        if (restored) {
          currentResponse = restored;
          appendResponse(restored);
          saveHistory();
          updateChrome(restored);
        }
      }
      setHint(readableError(error), true);
    } finally {
      setBusy(false);
      requestAnimationFrame(function () { ui.timeline.scrollTop = ui.timeline.scrollHeight; });
    }
  }

  async function sendComposer() {
    const text = ui.input.value.trim();
    if (!text || !currentResponse) {
      setHint("先写下一句话，或者点击上面的选项。", true);
      return;
    }
    let type = "message";
    if (currentResponse.phase === "onboarding" || currentResponse.phase === "daily_review") type = "answer_question";
    if (currentResponse.phase === "daily_learning") type = "submit_result";
    await handleAction({ id: "composer-send", label: "发送", event_type: type });
  }

  async function advanceDay() {
    if (isBusy) return;
    setBusy(true);
    try {
      const before = currentResponse.phase;
      const response = await gateway.advanceDay();
      if (!response || response.phase === before) {
        showToast("真实 API 需要以 COACH_ALLOW_DEMO_DATE=1 启动，才能在现场跳到下一天。");
        return;
      }
      currentResponse = response;
      appendResponse(response);
      saveHistory();
      updateChrome(response);
      showToast("已进入下一学习日，先从昨天的 Review 开始。");
    } catch (error) {
      setHint(readableError(error), true);
    } finally {
      setBusy(false);
      requestAnimationFrame(function () { ui.timeline.scrollTop = ui.timeline.scrollHeight; });
    }
  }

  async function togglePause() {
    if (!currentResponse || isBusy) return;
    const type = currentResponse.phase === "paused" ? "resume" : "pause";
    await handleAction({ id: type, label: type === "pause" ? "暂停" : "继续", event_type: type });
  }

  async function initialize() {
    gateway = new CoachGateway();
    try {
      await gateway.connect();
      ui.connection.textContent = gateway.mode === "api" ? "Coach 已连接" : "离线 Demo 模式";
      const payload = startPayload();
      const signature = contextSignature(payload);
      const previousSignature = localStorage.getItem(CONTEXT_SIGNATURE_KEY);
      if (previousSignature && previousSignature !== signature) {
        gateway.clear();
        localStorage.removeItem(HISTORY_KEY);
      }
      localStorage.setItem(CONTEXT_SIGNATURE_KEY, signature);
      const response = await gateway.startOrRestore(payload);
      currentResponse = response;
      history = loadHistory(response.session_id);
      appendResponse(response);
      saveHistory();
      updateChrome(response);
      renderTimeline();
      ui.timeline.setAttribute("aria-busy", "false");
      requestAnimationFrame(function () { ui.timeline.scrollTop = ui.timeline.scrollHeight; });
      if (gateway.mode === "demo") {
        showToast("未检测到后端，已自动使用可完整点击的现场 Demo 模式。");
      }
    } catch (error) {
      ui.timeline.innerHTML = "";
      const panel = element("div", "error-panel");
      panel.appendChild(element("h2", "", "Coach 暂时无法连接"));
      panel.appendChild(element("p", "", readableError(error)));
      const retry = element("button", "primary-button", "重新连接");
      retry.type = "button";
      retry.addEventListener("click", function () { window.location.reload(); });
      panel.appendChild(retry);
      ui.timeline.appendChild(panel);
      setHint("可以刷新重试，或移除网址中的 mode=api 自动启用 Demo 兜底。", true);
    }
  }

  ui.composer.addEventListener("submit", function (event) {
    event.preventDefault();
    sendComposer();
  });
  ui.input.addEventListener("keydown", function (event) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      sendComposer();
    }
  });
  ui.pause.addEventListener("click", togglePause);
  ui.back.addEventListener("click", function () { window.location.href = "./index.html"; });
  ui.reset.addEventListener("click", function () {
    if (!window.confirm("重新规划会清除当前 Coach 会话和本页对话记录。确定继续吗？")) return;
    if (gateway) gateway.clear();
    localStorage.removeItem(HISTORY_KEY);
    window.location.reload();
  });

  initialize();
})();
