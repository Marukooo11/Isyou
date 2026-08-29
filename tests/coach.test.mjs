import test from "node:test";
import assert from "node:assert/strict";
import { CoachError, CoachService, MemoryCoachStore } from "../lib/coach/service.mjs";

function turn(requestId, response, type, extra = {}) {
  return {
    request_id: requestId,
    expected_state_version: response.state_version,
    event: { type, ...extra }
  };
}

function context() {
  return {
    client_user_id: "demo-user",
    domain: "career",
    career_context: {
      selected_direction: { id: "quality", title: "质检记录员" },
      target_requirements: [{ id: "noise", text: "需要适应现场机器声" }],
      user_profile: { facts: ["偏好明确规则"], evidence: [], constraints: ["持续噪声影响专注"] }
    },
    preferences: { available_minutes: 20 }
  };
}

test("Coach 从岗位上下文生成 Gap Map、计划和每日任务", () => {
  let now = new Date("2026-08-28T09:00:00Z");
  const service = new CoachService({ store: new MemoryCoachStore(), now: () => now });
  let response = service.createSession(context());
  const sessionId = response.session_id;
  assert.equal(response.phase, "onboarding");
  assert.equal(response.state_summary.target_title, "质检记录员");

  response = service.handleTurn(sessionId, turn("r1", response, "answer_question", { message: "先找到差距" }));
  assert.equal(response.phase, "gap_analysis");
  assert.match(response.ui_blocks[0].data.items[1].title, /机器声/);

  response = service.handleTurn(sessionId, turn("r2", response, "confirm_gap_map"));
  assert.equal(response.phase, "plan_review");

  response = service.handleTurn(sessionId, turn("r3", response, "confirm_plan"));
  assert.equal(response.phase, "daily_learning");
  assert.equal(response.ui_blocks[0].type, "daily_task");

  response = service.handleTurn(sessionId, turn("r4", response, "submit_result", { message: "找到一份旧记录" }));
  assert.equal(response.phase, "submission_review");

  now = new Date("2026-08-29T09:00:00Z");
  response = service.getSession(sessionId);
  assert.equal(response.phase, "daily_review");
  assert.equal(response.state_summary.current_day, 2);
});

test("Coach turn 幂等并拒绝过期 state_version", () => {
  const service = new CoachService({ store: new MemoryCoachStore(), now: () => new Date("2026-08-28T09:00:00Z") });
  const created = service.createSession(context());
  const payload = turn("same-request", created, "answer_question");
  const first = service.handleTurn(created.session_id, payload);
  assert.deepEqual(service.handleTurn(created.session_id, payload), first);
  assert.throws(
    () => service.handleTurn(created.session_id, { ...turn("stale", created, "confirm_gap_map"), expected_state_version: 1 }),
    error => error instanceof CoachError && error.code === "STATE_CONFLICT"
  );
});

test("Coach 暂停后恢复到原阶段与原任务", () => {
  const service = new CoachService({ store: new MemoryCoachStore(), now: () => new Date("2026-08-28T09:00:00Z") });
  let response = service.createSession(context());
  const sessionId = response.session_id;
  response = service.handleTurn(sessionId, turn("pause-1", response, "answer_question", { message: "先开始练习" }));
  response = service.handleTurn(sessionId, turn("pause-2", response, "confirm_gap_map"));
  response = service.handleTurn(sessionId, turn("pause-3", response, "confirm_plan"));
  const originalTask = response.ui_blocks[0].data.title;

  response = service.handleTurn(sessionId, turn("pause-4", response, "pause"));
  assert.equal(response.phase, "paused");
  response = service.handleTurn(sessionId, turn("pause-5", response, "resume"));
  assert.equal(response.phase, "daily_learning");
  assert.equal(response.ui_blocks[0].data.title, originalTask);
});
