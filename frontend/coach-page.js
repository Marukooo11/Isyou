(function () {
  "use strict";

  const ui = {
    shell: document.querySelector("#book-shell"), timeline: document.querySelector("#timeline"),
    connection: document.querySelector("#connection-label"), target: document.querySelector("#target-title"),
    subtitle: document.querySelector("#notebook-subtitle"), pageCount: document.querySelector("#page-count"),
    pageNote: document.querySelector("#page-note"), day: document.querySelector("#day-label"),
    drawerDay: document.querySelector("#drawer-day"), phase: document.querySelector("#phase-label"),
    today: document.querySelector("#today-content"), knowledge: document.querySelector("#knowledge-content"),
    outputs: document.querySelector("#outputs-content"), composer: document.querySelector("#composer"),
    input: document.querySelector("#message-input"), send: document.querySelector("#send-button"),
    hint: document.querySelector("#composer-hint"), pause: document.querySelector("#pause-button"),
    reset: document.querySelector("#reset-button"), back: document.querySelector("#back-button"),
    quiet: document.querySelector("#quiet-button"), toggle: document.querySelector("#coach-toggle"),
    close: document.querySelector("#close-drawer"), tab: document.querySelector("#drawer-tab"),
  };

  const KEYS = {
    history: "isyou_coach_notebook_history_v1", context: "isyou_career_context",
    signature: "isyou_coach_context_signature_v2", api: "isyou_coach_product_session_v2",
    demo: "isyou_coach_fallback_state_v2", quiet: "isyou_quiet_mode_v1",
  };
  const DAY = 86400000;
  let gateway, currentResponse, history = [], selectedAnswer = "", busy = false;

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = String(text);
    return node;
  }

  function defaultContext() {
    return {
      selected_direction: { id: "data-annotation", title: "数据标注专员", source_refs: ["frontend-demo"] },
      target_requirements: [{ id: "clear-process", text: "能够按明确规范独立完成标注，并在固定会议中进行简短同步。", source_ref: "frontend-demo" }],
      user_profile: {
        facts: ["偏好规则稳定的任务", "低感官负荷时更容易专注", "更适合独立完成边界清楚的工作"],
        evidence: [], constraints: ["持续人声会影响专注", "临时需求变更会增加启动困难"],
        open_questions: ["短视频会议中的表达负担是否可接受"],
      }, source_meta: "来自岗位匹配结果",
    };
  }

  function careerContext() {
    const fallback = defaultContext();
    try {
      const saved = JSON.parse(sessionStorage.getItem(KEYS.context) || "null");
      if (!saved || !saved.selected_direction) return fallback;
      return Object.assign({}, fallback, saved, {
        selected_direction: Object.assign({}, fallback.selected_direction, saved.selected_direction),
        user_profile: Object.assign({}, fallback.user_profile, saved.user_profile || {}),
      });
    } catch (_error) { return fallback; }
  }

  function startPayload() {
    return { client_user_id: "hackathon-demo-user", domain: "career", career_context: careerContext(), preferences: { language: "zh-CN", available_minutes: 20, communication_style: "clear_and_supportive" } };
  }

  function contextSignature(value) {
    const context = value.career_context || {}, selected = context.selected_direction || {};
    return JSON.stringify({ id: selected.id || "", title: selected.title || "", requirements: (context.target_requirements || []).map(item => item.text || "") });
  }

  function dateString(value) {
    const date = value || new Date();
    return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-");
  }
  function addDay(value) { return dateString(new Date(new Date(value + "T12:00:00").getTime() + DAY)); }
  function uid() { return (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : "demo-" + Date.now(); }

  class DemoCoach {
    constructor() { this.state = null; }
    async health() { return { status: "demo" }; }
    async start(value) {
      const context = value.career_context || {};
      this.state = {
        sessionId: "demo-" + uid(), version: 1, phase: "onboarding", day: 1,
        target: (context.selected_direction || {}).title || "当前职业方向", context,
        gaps: [], plan: [], task: null, outputs: [], latestReview: null,
        pausedFrom: null, lastBeforePause: null,
      };
      return this.save(this.onboarding());
    }
    async restore() {
      try {
        const saved = JSON.parse(localStorage.getItem(KEYS.demo) || "null");
        if (!saved || !saved.state || !saved.response) return null;
        this.state = saved.state; return saved.response;
      } catch (_error) { this.clear(); return null; }
    }
    clear() { this.state = null; localStorage.removeItem(KEYS.demo); }
    save(response) { localStorage.setItem(KEYS.demo, JSON.stringify({ state: this.state, response })); return response; }
    summary() {
      const labels = { onboarding: "确认起点", gap_analysis: "确认下一步", plan_review: "安排学习路线", daily_learning: "今天的练习", submission_review: "Coach 已完成 Review", paused: "已暂停" };
      return { target_title: this.state.target, current_stage: this.state.phase === "daily_learning" ? "stage-start" : null, current_day: this.state.day, progress_label: labels[this.state.phase] || this.state.phase };
    }
    workspace() {
      const facts = ((this.state.context.user_profile || {}).facts || []).map((fact, index) => ({
        id: "fact-" + (index + 1), text: typeof fact === "string" ? fact : (fact.text || fact.value || "已记录信息"),
        source_ref: typeof fact === "object" ? fact.source_ref : null,
      }));
      return {
        notebook_pages: 1 + (this.state.gaps.length ? 1 : 0) + (this.state.plan.length ? 1 : 0) + this.state.outputs.length + Math.max(0, this.state.day - 1),
        known_items: facts, open_gaps: this.state.gaps, outputs: this.state.outputs,
        stage_plan: this.state.plan, current_task: this.state.task, latest_review: this.state.latestReview,
      };
    }
    respond(message, blocks, actions) {
      return { session_id: this.state.sessionId, state_version: this.state.version, phase: this.state.phase, coach_message: message, ui_blocks: blocks, quick_actions: actions, state_summary: this.summary(), workspace: this.workspace(), updated_at: new Date().toISOString() };
    }
    onboarding() {
      return this.respond(
        "我们先不急着开始固定课程。我会围绕“" + this.state.target + "”确认你的目标、已有证据和还不知道的部分，再一起决定从哪里开始。",
        [{ id: "onboarding-question", type: "question", data: { prompt: "如果这次 Coach 只能先帮你解决一件事，你最希望是什么？", options: ["确认自己是否适合", "找到能力差距", "开始第一项练习", "我还不确定"], allow_text: true } }],
        [{ id: "answer-start", label: "提交回答", event_type: "answer_question" }]
      );
    }
    gapMap() {
      const requirement = ((this.state.context.target_requirements || [])[0] || {}).text || "目标要求仍待补充。";
      this.state.gaps = [
        { id: "gap-start", title: "当前能力起点仍待确认", status: "unknown", reason: "已有经历能说明接触过相关方向，但不足以判断目前能够独立完成到什么程度。", next_validation: "用一份已有作品、练习或具体经历定位起点。" },
        { id: "gap-evidence", title: "缺少可复核的能力证据", status: "confirmed", reason: requirement, next_validation: "先寻找已有材料，不要求从零完成高压力作品。" },
      ];
      return this.respond(
        "我先把目前能确认的内容和还不知道的部分分开。这里不是对你能力的判决，你可以修改。",
        [{ id: "gap-map", type: "gap_map", data: { items: this.state.gaps } }, { id: "gap-boundary", type: "notice", data: { text: "没有证据的能力会写成“待确认”，不会写成“不会”。" } }],
        [{ id: "confirm-gap", label: "这个分析基本准确", event_type: "confirm_gap_map" }, { id: "change-gap", label: "我想修改", event_type: "request_gap_change" }]
      );
    }
    plan() {
      this.state.plan = [
        { id: "stage-start", title: "确认当前起点", reason: "先知道已经会什么，避免重复学习或难度过高。", status: "active" },
        { id: "stage-practice", title: "补足最关键能力", reason: "起点确认后才选择真正影响目标的下一步。", status: "planned" },
        { id: "stage-evidence", title: "形成可展示证据", reason: "让能力能够被自己和外部机会理解。", status: "planned" },
      ];
      return this.respond(
        "基于当前信息，我建议先确认起点，再补最关键能力，最后留下可展示的证据。",
        [{ id: "stage-plan", type: "stage_plan", data: { stages: this.state.plan } }],
        [{ id: "confirm-plan", label: "按这个计划开始", event_type: "confirm_plan" }, { id: "change-plan", label: "我想调整计划", event_type: "request_plan_change" }]
      );
    }
    taskFor(mode) {
      const tasks = {
        first: ["今天不从零做大作品，只做一个低压力的起点定位。", "选择一份最能代表当前起点的已有材料", "先定位起点，再决定真正需要学习什么。", ["从旧作品、练习、课程记录或具体经历中选一份", "写下使用过的工具和投入时间", "标记满意与不确定的部分"], ["提供一份材料或具体描述", "说明使用工具或做法", "指出一个希望获得反馈的问题"], 20],
        reduce: ["这个卡点不代表你做不到。我们先把任务缩小。", "只找一条与目标相关的旧记录", "当前先降低启动摩擦，不要求完整作品。", ["查看相册、聊天记录、课程记录或旧文件名", "找到一条就停下", "用一句话说明它与目标的关系"], ["找到或描述一条相关记录；若仍没有，说明搜索过哪些地方"], 10],
        continue: ["我已完成上次 Review。今天从已有结果继续，不要求重做。", "从上次断点补齐一条说明", "只补足判断起点所需的信息。", ["打开上次结果", "补充使用过的工具或具体做法", "指出一个最想获得反馈的问题"], ["在上次结果上新增一条可复核说明"], 15],
        advance: ["我已完成上次 Review。今天提高一点点难度，验证能否迁移。", "用一个小变化验证能否迁移", "通过新变化判断能力是否稳定。", ["选择上次材料中的一个小部分", "做一个明确且可比较的调整", "记录调整前后差异"], ["提交调整结果，并说明为什么这样改"], 20],
      };
      const value = tasks[mode] || tasks.first;
      this.state.task = { title: value[1], reason: value[2], steps: value[3], completion_criteria: value[4], estimated_minutes: value[5], target: this.state.target };
      return this.respond(
        value[0], [{ id: "task-day-" + this.state.day, type: "daily_task", data: this.state.task }],
        [{ id: "task-submit", label: "提交给 Coach Review", event_type: "submit_result" }, { id: "task-blocked", label: "我卡住了", event_type: "report_blocker" }, { id: "task-help", label: "我需要帮助", event_type: "request_help" }]
      );
    }
    review(summary) {
      const blocked = ["没找到", "没有找到", "卡住", "无法", "没完成"].some(word => summary.includes(word));
      const short = summary.trim().length < 12;
      return {
        reviewed_by: "coach", previous_day: this.state.day, previous_task: this.state.task,
        outcome: blocked ? "needs_support" : (short ? "needs_detail" : "ready_to_transfer"),
        observation: blocked ? "这次提交记录了真实卡点，仍然是有效的学习证据。" : (short ? "已经有一条结果记录，但做法和判断依据还不够具体。" : "这次提交包含了可以继续核验的具体结果或过程说明。"),
        boundary: "这是一条过程证据；单次提交不等于已经稳定掌握。",
        next_adjustment: blocked ? "下一次把任务缩小到一条记录。" : (short ? "下一次只补充工具、做法或一个反馈问题。" : "下一次加入一个小变化，验证能否迁移。"),
        next_mode: blocked ? "reduce" : (short ? "continue" : "advance"),
      };
    }
    async turn(event) {
      const phase = this.state.phase; let response;
      if (event.type === "pause" && phase !== "paused") {
        this.state.pausedFrom = phase; this.state.lastBeforePause = JSON.parse(JSON.stringify(this.state.lastResponse || {})); this.state.phase = "paused";
        response = this.respond("进度已经保存。准备好后从这里继续。", [{ id: "pause", type: "notice", data: { text: "当前进度已保存。" } }], [{ id: "resume", label: "继续", event_type: "resume" }]);
      } else if (phase === "paused" && event.type === "resume") {
        this.state.phase = this.state.pausedFrom || "onboarding";
        const previous = this.state.lastBeforePause;
        response = previous && previous.coach_message ? this.respond("欢迎回来，我们从刚才停下的位置继续。", previous.ui_blocks || [], previous.quick_actions || []) : this.onboarding();
      } else if (phase === "onboarding") { this.state.phase = "gap_analysis"; response = this.gapMap(); }
      else if (phase === "gap_analysis" && event.type === "confirm_gap_map") { this.state.phase = "plan_review"; response = this.plan(); }
      else if (phase === "gap_analysis") { response = this.respond("可以。请告诉我哪一条不像你，或者补充一段具体经历。", [{ id: "gap-question", type: "question", data: { prompt: "你想修改哪一条？为什么？" } }], [{ id: "confirm-gap", label: "修改后确认", event_type: "confirm_gap_map" }]); }
      else if (phase === "plan_review" && event.type === "confirm_plan") { this.state.phase = "daily_learning"; response = this.taskFor("first"); }
      else if (phase === "plan_review") { response = this.respond("计划可以改。你更想调整目标、顺序、每天时间，还是难度？", [{ id: "plan-question", type: "question", data: { prompt: "请选择或直接说明。", options: ["目标", "顺序", "每天时间", "难度"] } }], [{ id: "confirm-plan", label: "调整后开始", event_type: "confirm_plan" }]); }
      else if (phase === "daily_learning" && (event.type === "report_blocker" || event.type === "request_help")) { response = this.taskFor("reduce"); }
      else if (phase === "daily_learning" && event.type === "submit_result") {
        const summary = (event.message || "用户提交了当天结果。").trim(); this.state.latestReview = this.review(summary);
        const output = { id: "evidence-" + uid(), day: this.state.day, summary, completion_status: "submitted", status: "reviewed", review: this.state.latestReview };
        this.state.outputs.push(output); this.state.phase = "submission_review";
        response = this.respond("我已经完成这次 Review，并把判断边界和下一步调整记进你的本子。你不需要再给自己打分。", [{ id: "review-day-" + this.state.day, type: "review", data: this.state.latestReview }, { id: "evidence", type: "evidence_update", data: output }], []);
      } else { response = this.state.lastResponse || this.onboarding(); }
      this.state.version += 1; response.state_version = this.state.version; response.phase = this.state.phase; response.state_summary = this.summary(); response.workspace = this.workspace(); this.state.lastResponse = response; return this.save(response);
    }
    async advanceDay() {
      if (!this.state || this.state.phase !== "submission_review") return this.restore();
      this.state.day += 1; this.state.phase = "daily_learning"; this.state.version += 1;
      const response = this.taskFor((this.state.latestReview || {}).next_mode || "continue");
      response.ui_blocks.unshift({ id: "review-day-" + (this.state.day - 1), type: "review", data: this.state.latestReview });
      response.state_version = this.state.version; response.state_summary = this.summary(); response.workspace = this.workspace(); this.state.lastResponse = response; return this.save(response);
    }
  }

  class Gateway {
    constructor() {
      const params = new URLSearchParams(window.location.search);
      this.requested = params.get("mode") || "auto"; this.demoDate = dateString();
      this.api = new window.IsyouCoach.CoachClient({ baseUrl: params.get("api") || undefined, storageKey: KEYS.api, demoDate: this.demoDate });
      this.demo = new DemoCoach(); this.active = null; this.mode = null;
    }
    async connect() {
      if (this.requested === "demo") { this.active = this.demo; this.mode = "demo"; return; }
      try {
        await Promise.race([this.api.health(), new Promise((_resolve, reject) => setTimeout(() => reject(new Error("Coach API 连接超时")), 1600))]);
        this.active = this.api; this.mode = "api";
      } catch (error) { if (this.requested === "api") throw error; this.active = this.demo; this.mode = "demo"; }
    }
    async startOrRestore(value) { return (await this.active.restore()) || this.active.start(value); }
    turn(event) { return this.active.turn(event); }
    async advanceDay() { if (this.mode === "demo") return this.demo.advanceDay(); this.demoDate = addDay(this.demoDate); this.api.demoDate = this.demoDate; return this.api.restore(); }
    clear() { this.api.clear(); this.demo.clear(); }
  }

  function statusText(status) {
    return ({ unknown: "待确认", confirmed: "下一步", planned: "待开始", active: "进行中", reviewed: "Coach 已复核", submitted: "已提交", ready_to_transfer: "可继续验证", needs_detail: "需补说明", needs_support: "需降低难度" })[status] || status || "待确认";
  }
  function loadHistory(sessionId) { try { const saved = JSON.parse(localStorage.getItem(KEYS.history) || "null"); return saved && saved.sessionId === sessionId ? saved.items || [] : []; } catch (_error) { return []; } }
  function saveHistory() { if (currentResponse) localStorage.setItem(KEYS.history, JSON.stringify({ sessionId: currentResponse.session_id, items: history.slice(-30) })); }
  function appendResponse(response) { const key = response.session_id + ":" + response.state_version + ":" + response.phase; if (!history.some(item => item.kind === "coach" && item.key === key)) history.push({ kind: "coach", key, response }); }
  function appendUser(text) { if (text) history.push({ kind: "user", text }); }
  function setNote(text, error) { ui.pageNote.textContent = text; ui.pageNote.style.borderColor = error ? "var(--red)" : "var(--orange)"; ui.pageNote.style.color = error ? "var(--red)" : "var(--orange)"; }
  function setHint(text, error) { ui.hint.textContent = text; ui.hint.classList.toggle("is-error", Boolean(error)); }
  function empty(title, copy) { const node = el("div", "empty-note"); node.append(el("strong", "", title), document.createTextNode("　" + copy)); return node; }
  function chip(text, tone) { return el("span", "status-chip" + (tone ? " is-" + tone : ""), text); }

  function renderToday(response) {
    const workspace = response.workspace || {}, phase = response.phase;
    ui.today.innerHTML = ""; ui.today.classList.remove("skeleton-stack"); ui.today.setAttribute("aria-busy", "false");
    if (phase === "daily_learning" && workspace.current_task) {
      const task = workspace.current_task, sheet = el("article", "task-sheet"), main = el("div"), side = el("aside", "criteria-card");
      main.append(el("div", "task-meta", "CURRENT PAGE · " + (task.estimated_minutes || 20) + " MIN"), el("h3", "", task.title), el("p", "", task.reason));
      const steps = el("ol", "task-list"); (task.steps || []).forEach(step => steps.appendChild(el("li", "", step))); main.appendChild(steps);
      side.appendChild(el("h4", "", "做到这里就可以")); const list = el("ul"); (task.completion_criteria || []).forEach(item => list.appendChild(el("li", "", item))); side.appendChild(list); sheet.append(main, side); ui.today.appendChild(sheet); return;
    }
    if (phase === "plan_review" && (workspace.stage_plan || []).length) {
      const list = el("div", "stage-list"); workspace.stage_plan.forEach((stage, index) => {
        const row = el("div", "stage-row"); row.appendChild(el("span", "stage-row__number", String(index + 1).padStart(2, "0")));
        const copy = el("div"); copy.append(el("strong", "", stage.title), el("div", "", stage.reason)); row.append(copy, chip(statusText(stage.status), stage.status === "active" ? "green" : "")); list.appendChild(row);
      }); ui.today.appendChild(list); return;
    }
    if (phase === "gap_analysis" && (workspace.open_gaps || []).length) {
      const grid = el("div", "knowledge-grid"); workspace.open_gaps.forEach(item => { const card = el("article", "knowledge-card is-gap"); card.append(el("p", "", item.title), el("small", "", "下一步：" + (item.next_validation || "继续确认"))); grid.appendChild(card); }); ui.today.appendChild(grid); return;
    }
    if (phase === "submission_review") {
      ui.today.appendChild(empty("今天已记好", "Coach 已完成 Review；结果和下一步调整在“已有产出”里。"));
      const row = el("div", "next-day-action"); row.appendChild(el("p", "", "现场 Demo 可直接模拟下一次打开，Coach 会自动带入 Review 并生成新任务。")); const button = el("button", "primary-action", "模拟第二天进入"); button.type = "button"; button.addEventListener("click", advanceDay); row.appendChild(button); ui.today.appendChild(row); return;
    }
    if (phase === "paused") { ui.today.appendChild(empty("本子合上了", "进度已经保存，点击右侧 Coach 的“继续”即可回来。")); return; }
    ui.today.appendChild(empty("先从真实情况开始", "打开右侧 Coach，回答一个结构化问题；Gap 和课程计划会同步写在这里。"));
  }

  function renderKnowledge(workspace) {
    ui.knowledge.innerHTML = ""; const facts = workspace.known_items || [], gaps = workspace.open_gaps || [], grid = el("div", "knowledge-grid");
    facts.forEach(item => { const card = el("article", "knowledge-card"); card.append(el("p", "", item.text), el("small", "", item.source_ref ? "来源：" + item.source_ref : "来源：你的前置信息")); grid.appendChild(card); });
    gaps.forEach(item => { const card = el("article", "knowledge-card is-gap"); card.append(el("p", "", item.title), el("small", "", statusText(item.status) + " · " + (item.reason || "等待更多证据"))); grid.appendChild(card); });
    ui.knowledge.appendChild(grid.children.length ? grid : empty("还没有写下结论", "Coach 只会记录有来源或明确标记为待确认的内容。"));
  }

  function reviewNode(review) {
    const box = el("div", "coach-review"); box.appendChild(el("strong", "", "Coach Review · " + statusText(review.outcome)));
    box.append(el("p", "", review.observation || "已收到这次结果。"), el("p", "", "判断边界：" + (review.boundary || "还需要继续验证。")), el("p", "", "下一步：" + (review.next_adjustment || "根据结果继续调整。"))); return box;
  }
  function renderOutputs(workspace) {
    ui.outputs.innerHTML = ""; const outputs = workspace.outputs || [];
    if (!outputs.length) { ui.outputs.appendChild(empty("还没有产出", "完成今天的任务后，提交内容和 Coach Review 会一起留在这里。")); return; }
    const list = el("div", "output-list"); outputs.slice().reverse().forEach(item => {
      const card = el("article", "output-card"); card.appendChild(el("div", "output-card__day", "DAY " + (item.day || 1)));
      const copy = el("div"); copy.append(el("p", "", item.summary || "已提交一条结果"), chip(statusText(item.status), "green")); if (item.review) copy.appendChild(reviewNode(item.review)); card.appendChild(copy); list.appendChild(card);
    }); ui.outputs.appendChild(list);
  }

  function renderDrawerBlock(block) {
    if (block.type === "question") {
      const box = el("div", "drawer-block"); box.append(el("div", "block-label", "ONE QUESTION"), el("p", "", block.data.prompt));
      const list = el("div", "option-list"); (block.data.options || []).forEach(option => {
        const button = el("button", "option-button" + (selectedAnswer === option ? " is-selected" : ""), option); button.type = "button";
        button.addEventListener("click", () => { selectedAnswer = option; ui.input.value = option; setHint("已选中，也可以继续补充。", false); renderTimeline(); }); list.appendChild(button);
      }); if (list.children.length) box.appendChild(list); return box;
    }
    if (block.type === "review") return reviewNode(block.data || {});
    if (block.type === "notice") { const box = el("div", "drawer-block"); box.appendChild(el("p", "", block.data.text)); return box; }
    const box = el("div", "drawer-block"), labels = { gap_map: "Gap 已写入左侧", stage_plan: "计划已写入左侧", daily_task: "今天的任务已写入左侧", evidence_update: "产出已存入左侧" };
    const button = el("button", "drawer-link", labels[block.type] || "内容已更新至左侧"); button.type = "button"; button.addEventListener("click", () => document.querySelector(block.type === "evidence_update" ? "#outputs-section" : "#today-section").scrollIntoView()); box.appendChild(button); return box;
  }

  function needsText(action) { return action.event_type === "submit_result" || (action.event_type === "answer_question" && action.id === "answer-start"); }
  function renderTimeline() {
    ui.timeline.innerHTML = "";
    history.forEach((item, index) => {
      if (item.kind === "user") { ui.timeline.appendChild(el("div", "user-message", item.text)); return; }
      const latest = !history.slice(index + 1).some(later => later.kind === "coach"), response = item.response, turn = el("section", "turn");
      turn.append(el("div", "turn__stamp", "COACH · DAY " + ((response.state_summary || {}).current_day || 1)), el("div", "coach-message", response.coach_message));
      if (latest) {
        (response.ui_blocks || []).forEach(block => turn.appendChild(renderDrawerBlock(block)));
        if ((response.quick_actions || []).length) {
          const actions = el("div", "actions"); response.quick_actions.forEach(action => { const button = el("button", "quick-action", action.label); button.type = "button"; button.disabled = busy; button.addEventListener("click", () => handleAction(action)); actions.appendChild(button); }); turn.appendChild(actions);
        }
      }
      ui.timeline.appendChild(turn);
    }); ui.timeline.setAttribute("aria-busy", String(busy));
  }

  function update(response) {
    const summary = response.state_summary || {}, workspace = response.workspace || {};
    ui.target.textContent = summary.target_title || "当前职业方向"; ui.subtitle.textContent = "围绕真实目标记录已有知识、下一步和每次产出。";
    ui.pageCount.textContent = workspace.notebook_pages || 1; ui.day.textContent = "DAY " + (summary.current_day || 1); ui.drawerDay.textContent = "Day " + (summary.current_day || 1); ui.phase.textContent = summary.progress_label || "进行中"; ui.pause.textContent = response.phase === "paused" ? "继续" : "暂停";
    const locked = response.phase === "submission_review" || response.phase === "paused"; ui.input.disabled = locked || busy; ui.send.disabled = locked || busy;
    const prompts = { onboarding: "选择一个回答，或写下你最想先解决的事", gap_analysis: "若不准确，写下具体经历", plan_review: "写下想调整的目标、顺序、时间或难度", daily_learning: "描述你实际做了什么；Review 由 Coach 完成", submission_review: "Coach 已完成今天的 Review", paused: "点击继续后回到刚才的位置" }; ui.input.placeholder = prompts[response.phase] || "写下一句具体情况";
    renderToday(response); renderKnowledge(workspace); renderOutputs(workspace); renderTimeline();
  }

  function setBusy(value) {
    busy = value;
    document.querySelectorAll("button").forEach(button => { if (!button.matches("#back-button, #quiet-button, #close-drawer, #drawer-tab, #coach-toggle")) button.disabled = value; });
    if (currentResponse) update(currentResponse);
  }
  function readable(error) {
    if (error && error.code === "AUTH_REQUIRED") return "请先注册或登录，再进入 Coach。";
    if (error && error.code === "STATE_CONFLICT") return "会话刚刚更新，正在重新加载。";
    return (error && error.message) || "Coach 暂时没有响应，请稍后重试。";
  }
  async function handleAction(action) {
    if (busy) return; const message = ui.input.value.trim() || selectedAnswer;
    if (needsText(action) && !message) { setHint(action.event_type === "submit_result" ? "先用一句话描述实际产出，再交给 Coach Review。" : "请先选择或写下回答。", true); ui.input.focus(); return; }
    const event = { type: action.event_type, action_id: action.action_id || action.id, message, evidence: action.event_type === "submit_result" ? [{ type: "note", value: message }] : [] };
    setBusy(true);
    try {
      const response = await gateway.turn(event); appendUser(message || action.label); currentResponse = response; appendResponse(response); selectedAnswer = ""; ui.input.value = "";
      setHint(response.phase === "submission_review" ? "Coach 已完成 Review，结果已写入左侧。" : "进度已保存。", false);
      setNote(response.phase === "submission_review" ? "Review 已由 Coach 完成，不需要你再给自己打分。" : "本页已根据最新对话更新。", false); saveHistory(); update(response);
    } catch (error) {
      if (error && error.code === "STATE_CONFLICT") { const restored = await gateway.active.restore(); if (restored) { currentResponse = restored; appendResponse(restored); update(restored); } }
      setHint(readable(error), true); setNote(readable(error), true);
    } finally { setBusy(false); requestAnimationFrame(() => { ui.timeline.scrollTop = ui.timeline.scrollHeight; }); }
  }
  async function send() {
    if (!currentResponse) return; if (!ui.input.value.trim()) { setHint("先写下一句话，或者选择上面的回答。", true); return; }
    let type = "message"; if (currentResponse.phase === "onboarding") type = "answer_question"; if (currentResponse.phase === "daily_learning") type = "submit_result";
    await handleAction({ id: "composer-send", label: "发送", event_type: type });
  }
  async function advanceDay() {
    if (busy) return; setBusy(true);
    try {
      const before = currentResponse.phase, response = await gateway.advanceDay();
      if (!response || response.phase === before) { setNote("真实 API 需允许 Demo 日期后才能模拟第二天；现场可使用 ?mode=demo。", true); return; }
      currentResponse = response; appendResponse(response); saveHistory(); setNote("Coach 已带入上次 Review，并生成了今天的新内容。", false); update(response);
    } catch (error) { setNote(readable(error), true); } finally { setBusy(false); }
  }
  async function togglePause() { if (currentResponse && !busy) await handleAction({ id: currentResponse.phase === "paused" ? "resume" : "pause", label: "", event_type: currentResponse.phase === "paused" ? "resume" : "pause" }); }
  function setDrawer(open) { ui.shell.classList.toggle("drawer-closed", !open); ui.toggle.textContent = open ? "收起 Coach" : "打开 Coach"; ui.toggle.setAttribute("aria-expanded", String(open)); ui.tab.setAttribute("aria-expanded", String(open)); }
  function setQuiet(on) { document.body.classList.toggle("quiet-mode", on); ui.quiet.setAttribute("aria-pressed", String(on)); ui.quiet.textContent = on ? "退出安静模式" : "安静模式"; localStorage.setItem(KEYS.quiet, String(on)); }

  async function initialize() {
    gateway = new Gateway(); setQuiet(localStorage.getItem(KEYS.quiet) === "true");
    try {
      await gateway.connect(); ui.connection.textContent = gateway.mode === "api" ? "Coach API 已连接" : "现场 Demo";
      const value = startPayload(), nextSignature = contextSignature(value), previous = localStorage.getItem(KEYS.signature);
      if (previous && previous !== nextSignature) { gateway.clear(); localStorage.removeItem(KEYS.history); }
      localStorage.setItem(KEYS.signature, nextSignature);
      const response = await gateway.startOrRestore(value); currentResponse = response; history = loadHistory(response.session_id); appendResponse(response); saveHistory(); update(response);
      setNote(gateway.mode === "api" ? "已恢复你的本子和 Coach 进度。" : "当前使用可完整点击的现场 Demo；链路与真实 API 保持一致。", false);
      requestAnimationFrame(() => { ui.timeline.scrollTop = ui.timeline.scrollHeight; });
    } catch (error) {
      ui.timeline.innerHTML = ""; const panel = el("div", "drawer-block"); panel.appendChild(el("p", "", readable(error)));
      const retry = el("button", "primary-action", "重新连接"); retry.type = "button"; retry.addEventListener("click", () => location.reload()); panel.appendChild(retry); ui.timeline.appendChild(panel);
      setNote(error && error.code === "AUTH_REQUIRED" ? "登录后会回到这本成长手帐。" : "Coach 暂时无法连接；移除网址中的 mode=api 可自动使用 Demo。", true);
      if (error && error.code === "AUTH_REQUIRED") {
        const login = el("button", "secondary-action", "注册或登录"); login.type = "button";
        login.addEventListener("click", () => { window.location.href = "./auth.html?next=coach.html"; }); panel.appendChild(login);
      }
    }
  }

  ui.composer.addEventListener("submit", event => { event.preventDefault(); send(); });
  ui.input.addEventListener("keydown", event => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); send(); } });
  ui.pause.addEventListener("click", togglePause); ui.back.addEventListener("click", () => { window.location.href = "./index.html"; });
  ui.reset.addEventListener("click", () => { if (!window.confirm("重新开始会清除当前 Coach 会话和本页记录。确定继续吗？")) return; gateway.clear(); localStorage.removeItem(KEYS.history); window.location.reload(); });
  ui.quiet.addEventListener("click", () => setQuiet(!document.body.classList.contains("quiet-mode")));
  ui.toggle.addEventListener("click", () => setDrawer(ui.shell.classList.contains("drawer-closed"))); ui.close.addEventListener("click", () => setDrawer(false)); ui.tab.addEventListener("click", () => setDrawer(true));
  initialize();
})();
