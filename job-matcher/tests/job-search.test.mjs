import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createSearchSafeProfile } from "../lib/job-search/privacy.mjs";
import { compileMarketSearchVector } from "../lib/job-search/compiler.mjs";
import { expandTaxonomy } from "../lib/job-search/taxonomy.mjs";
import { compileSearchPlan } from "../lib/job-search/search-plan.mjs";
import { extractOpportunity } from "../lib/job-search/verifier.mjs";
import { buildMarkdownFiles } from "../lib/job-search/markdown.mjs";
import { runJobSearch } from "../lib/job-search/pipeline.mjs";
import { scoreOpportunity } from "../lib/job-search/ranking.mjs";

const sample = JSON.parse(await readFile(new URL("../output1.sample.json", import.meta.url), "utf8"));

test("授权裁剪不泄露人格、姓名或原始证据", () => {
  const profile = structuredClone(sample);
  profile.name = "不应外发";
  profile.big5_scores = { E: { raw: 99 } };
  const safe = createSearchSafeProfile(profile);
  const serialized = JSON.stringify(safe);
  assert.equal(serialized.includes("不应外发"), false);
  assert.equal(serialized.includes("big5"), false);
  assert.equal(safe.directions.length, 5);
});

test("未授权联网搜索会被拒绝", () => {
  const profile = structuredClone(sample);
  profile.consent.can_use_for_web_job_search = false;
  assert.throws(() => createSearchSafeProfile(profile), error => error.code === "WEB_SEARCH_NOT_AUTHORIZED");
});

test("市场语言编译不把抽象评价作为动作词", () => {
  const safe = createSearchSafeProfile(sample);
  safe.experience.tasks.push("专注", "有创造力");
  const vector = compileMarketSearchVector(safe);
  assert.equal(vector.actions.includes("专注"), false);
  assert.equal(vector.actions.includes("有创造力"), false);
  assert.ok(vector.verified_tools.includes("Microsoft Excel"));
});

test("修电风扇只产生排错动作，不产生家电维修职业", () => {
  const safe = createSearchSafeProfile(sample);
  safe.experience.tasks = ["连续三小时排查并修理电风扇"];
  const vector = compileMarketSearchVector(safe);
  assert.ok(vector.actions.includes("排查"));
  assert.ok(vector.actions.includes("验证"));
  assert.equal(vector.direction_seeds.some(item => /家电维修|电风扇维修/.test(item.canonical_title_zh)), false);
});

test("职业扩展和三层搜索计划具有来源", () => {
  const safe = createSearchSafeProfile(sample);
  const vector = compileMarketSearchVector(safe);
  const occupations = expandTaxonomy(vector);
  const plans = compileSearchPlan(vector, occupations, safe);
  assert.equal(occupations.length, 5);
  assert.ok(occupations.every(item => item.verified && item.source_refs.length));
  assert.ok(plans.every(item => item.discovery.length === 3 && item.opportunities.length >= 3 && item.verification_templates.length === 4));
});

test("JobPosting 页面被提取为可核验机会，缺失条件保持未知", () => {
  const html = `<!doctype html><html><head><title>数据分析师</title><script type="application/ld+json">${JSON.stringify({
    "@type": "JobPosting",
    title: "初级数据分析师",
    hiringOrganization: { name: "示例科技" },
    datePosted: "2026-08-20",
    employmentType: "FULL_TIME",
    jobLocation: { address: { addressCountry: "中国", addressRegion: "上海", addressLocality: "上海" } },
    description: "岗位职责：负责业务数据分析和经营报表制作。任职要求：本科及以上学历，熟练使用 SQL 和 Excel。优先掌握 Python。立即申请。"
  })}</script></head><body>立即申请</body></html>`;
  const opportunity = extractOpportunity({ html, url: "https://jobs.example.com/1" });
  assert.equal(opportunity.verification_status, "verified");
  assert.equal(opportunity.company, "示例科技");
  assert.ok(opportunity.tools.includes("SQL"));
  assert.ok(opportunity.conditions.some(item => item.status === "unknown_to_confirm"));
});

test("Markdown 文件命名固定且不包含差距和训练内容", () => {
  const base = {
    opportunity_id: "OPP-1", title: "测试岗位", company: "示例公司", url: "https://example.com/job", opportunity_type: "employment",
    verification_status: "verified", retrieved_at: "2026-08-28T00:00:00Z", location: "上海", work_mode: null, employment_type: "全职",
    compensation: null, status: "active", published_at: null, tasks: ["执行测试"], required: ["本科"], preferred: [], tools: [],
    education_experience: ["本科"], schedule_location_collaboration: [], conditions: [], extraction_notes: [], content_hash: "abc", source_type: "structured_job_page"
  };
  const files = buildMarkdownFiles(Array.from({ length: 5 }, (_, index) => ({ ...base, opportunity_id: `OPP-${index}` })));
  assert.deepEqual(files.map(file => file.filename), ["jd_01.md", "jd_02.md", "jd_03.md", "jd_04.md", "jd_05.md"]);
  assert.equal(files.some(file => /能力差距|训练目标|Coach 计划/.test(file.content)), false);
});

test("明确夜班冲突会触发 Must 排除，未知不会", () => {
  const safe = createSearchSafeProfile(sample);
  safe.constraints.push({ id: "night", label: "不能夜班", scope: "schedule", level: "hard", negotiability: "non_negotiable" });
  const vector = compileMarketSearchVector(safe);
  const direction = expandTaxonomy(vector)[0];
  const base = {
    opportunity_id: "OPP-night", title: direction.canonical_title_zh, company: "示例公司", url: "https://example.com/job", opportunity_type: "employment",
    verification_status: "verified", retrieved_at: "2026-08-28T00:00:00Z", location: "上海", tasks: direction.tasks, required: [], preferred: [], tools: [],
    education_experience: [], schedule_location_collaboration: [], extraction_notes: [], content_hash: "night", source_type: "structured_job_page", source_credibility: 0.9
  };
  const conflict = scoreOpportunity({ ...base, conditions: [{ condition: "flexible_schedule", status: "explicit_conflict", evidence_text: "固定夜班" }] }, direction, vector, safe);
  const unknown = scoreOpportunity({ ...base, conditions: [{ condition: "flexible_schedule", status: "unknown_to_confirm", evidence_text: "来源未明确说明" }] }, direction, vector, safe);
  assert.equal(conflict.hard_conflict, true);
  assert.equal(unknown.hard_conflict, false);
});

test("输出数量被固定为5", async () => {
  await assert.rejects(() => runJobSearch({ profile: sample, target_output_count: 3, market: "CN" }, { provider: { name: "unused", search: async () => [] } }), error => error.code === "INVALID_TARGET_OUTPUT_COUNT");
});

test("所有实时搜索失败时返回服务错误，不伪装成0个合格岗位", async () => {
  const provider = { name: "broken", search: async () => { throw Object.assign(new Error("network unavailable"), { code: "SEARCH_PROVIDER_NETWORK_ERROR" }); } };
  await assert.rejects(
    () => runJobSearch({ profile: sample, target_output_count: 5, market: "CN" }, { provider }),
    error => error.code === "SEARCH_PROVIDER_UNAVAILABLE" && error.status === 502
  );
});

test("完整流水线输出5份不同公司的 Markdown", async () => {
  let counter = 0;
  const provider = {
    name: "fixture",
    async search(query) {
      if (/远程|加班|团队沟通/.test(query)) return [];
      counter += 1;
      return Array.from({ length: 3 }, (_, index) => ({ title: query, url: `https://jobs.example.com/${counter}-${index}`, source_type: "fixture" }));
    }
  };
  const verifyResult = async result => {
    const id = result.url.split("/").pop();
    const directionTitle = result.direction?.canonical_title_zh || "数据分析师";
    return {
      opportunity_id: `OPP-${id}`, title: directionTitle, company: `公司-${id}`, url: result.url, source_type: "fixture", opportunity_type: "employment",
      location: "中国 · 上海", work_mode: null, employment_type: "全职", compensation: null, published_at: null, retrieved_at: "2026-08-28T00:00:00Z",
      status: "active", verification_status: "verified", tasks: [...(result.direction?.tasks || []), "完成岗位任务"], required: ["本科及以上"], preferred: [], tools: ["SQL"],
      education_experience: ["本科及以上"], schedule_location_collaboration: [], conditions: [
        { condition: "remote_work", status: "unknown_to_confirm", source_url: result.url, evidence_text: "未知", retrieved_at: "2026-08-28T00:00:00Z" },
        { condition: "flexible_schedule", status: "unknown_to_confirm", source_url: result.url, evidence_text: "未知", retrieved_at: "2026-08-28T00:00:00Z" },
        { condition: "travel", status: "unknown_to_confirm", source_url: result.url, evidence_text: "未知", retrieved_at: "2026-08-28T00:00:00Z" },
        { condition: "onsite", status: "unknown_to_confirm", source_url: result.url, evidence_text: "未知", retrieved_at: "2026-08-28T00:00:00Z" },
        { condition: "communication_load", status: "unknown_to_confirm", source_url: result.url, evidence_text: "未知", retrieved_at: "2026-08-28T00:00:00Z" }
      ], content_hash: `hash-${id}`, page_text_length: 500, source_credibility: 0.9, extraction_notes: []
    };
  };
  const result = await runJobSearch({ profile: sample, max_results_per_direction: 5, target_output_count: 5, market: "CN" }, {
    provider,
    verifyResult,
    verifyCondition: async () => []
  });
  assert.equal(result.status, "complete");
  assert.equal(result.files.length, 5);
  assert.deepEqual(result.files.map(file => file.filename), ["jd_01.md", "jd_02.md", "jd_03.md", "jd_04.md", "jd_05.md"]);
});
