import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createIsyouServer } from "../server.mjs";

async function withServer(env, callback) {
  const server = createIsyouServer({ env });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const { port } = server.address();
  try {
    await callback(`http://127.0.0.1:${port}`);
  } finally {
    server.close();
    await once(server, "close");
  }
}

test("统一服务提供前端、健康检查并隐藏环境文件", async () => {
  await withServer({ API_RATE_LIMIT_MAX: "20", API_RATE_LIMIT_WINDOW_MS: "60000" }, async baseUrl => {
    const home = await fetch(`${baseUrl}/`);
    assert.equal(home.status, 200);
    const homeHtml = await home.text();
    assert.match(homeHtml, /Isyou/);
    assert.ok(homeHtml.indexOf("assessment.js") < homeHtml.indexOf("support.js"));
    assert.equal(home.headers.get("x-content-type-options"), "nosniff");

    const assessment = await fetch(`${baseUrl}/assessment.js`);
    assert.equal(assessment.status, 200);
    assert.match(assessment.headers.get("content-type"), /^text\/javascript/);
    assert.match(await assessment.text(), /window\.IsyouAssessment/);

    const health = await fetch(`${baseUrl}/health`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: "ok", service: "isyou-complete", search_provider_configured: false });

    const secret = await fetch(`${baseUrl}/.env.local`);
    assert.equal(secret.status, 403);
  });
});

test("API 拒绝无效 JSON，并在没有搜索提供商时明确返回 503", async () => {
  const sample = JSON.parse(await readFile(resolve(import.meta.dirname, "../output1.sample.json"), "utf8"));
  await withServer({ API_RATE_LIMIT_MAX: "20", API_RATE_LIMIT_WINDOW_MS: "60000" }, async baseUrl => {
    const invalid = await fetch(`${baseUrl}/api/job-search/candidates`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{"
    });
    assert.equal(invalid.status, 400);
    assert.equal((await invalid.json()).error.code, "INVALID_JSON");

    const missingProvider = await fetch(`${baseUrl}/api/job-search/candidates`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ profile: sample, market: "CN", language: "zh-CN" })
    });
    assert.equal(missingProvider.status, 503);
    assert.equal((await missingProvider.json()).error.code, "SEARCH_PROVIDER_NOT_CONFIGURED");
  });
});

test("公开 API 启用最小速率限制", async () => {
  await withServer({ API_RATE_LIMIT_MAX: "1", API_RATE_LIMIT_WINDOW_MS: "60000" }, async baseUrl => {
    const first = await fetch(`${baseUrl}/api/job-search/candidates`);
    assert.equal(first.status, 405);
    const second = await fetch(`${baseUrl}/api/job-search/candidates`);
    assert.equal(second.status, 429);
    assert.equal((await second.json()).error.code, "RATE_LIMITED");
  });
});

test("统一服务提供可携带岗位上下文的 Coach 全链路接口", async () => {
  await withServer({ API_RATE_LIMIT_MAX: "20", API_RATE_LIMIT_WINDOW_MS: "60000" }, async baseUrl => {
    const health = await fetch(`${baseUrl}/api/v1/health`);
    assert.equal(health.status, 200);
    assert.equal((await health.json()).service, "isyou-coach");

    const created = await fetch(`${baseUrl}/api/v1/coach/sessions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        domain: "career",
        career_context: {
          selected_direction: { id: "job-1", title: "内容运营" },
          target_requirements: [{ id: "gap-1", text: "缺少可展示的内容策划证据" }],
          user_profile: { facts: ["偏好边界清楚的任务"], constraints: ["临时变更会增加启动困难"] }
        }
      })
    });
    assert.equal(created.status, 201);
    const session = await created.json();
    assert.equal(session.phase, "onboarding");
    assert.equal(session.state_summary.target_title, "内容运营");

    const turn = await fetch(`${baseUrl}/api/v1/coach/sessions/${session.session_id}/turns`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        request_id: "server-flow-1",
        expected_state_version: session.state_version,
        event: { type: "answer_question", message: "先找到能力差距" }
      })
    });
    assert.equal(turn.status, 200);
    const gap = await turn.json();
    assert.equal(gap.phase, "gap_analysis");
    assert.match(JSON.stringify(gap.ui_blocks), /缺少可展示的内容策划证据/);

    const restored = await fetch(`${baseUrl}/api/v1/coach/sessions/${session.session_id}`);
    assert.equal(restored.status, 200);
    assert.equal((await restored.json()).state_version, gap.state_version);
  });
});
