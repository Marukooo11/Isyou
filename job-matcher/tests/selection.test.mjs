import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { generateSelectedJob, searchJobCandidates } from "../lib/job-search/selection-pipeline.mjs";

const sample = JSON.parse(await readFile(new URL("../output1.sample.json", import.meta.url), "utf8"));

test("快速候选阶段只调用一次搜索并返回5个岗位名称", async () => {
  let calls = 0;
  const provider = { name: "fixture", async search() {
    calls += 1;
    return Array.from({ length: 5 }, (_, index) => ({ title: `真实岗位${index + 1}`, company: `公司${index + 1}`, url: `https://jobs.example.com/candidate-${index + 1}` }));
  } };
  const result = await searchJobCandidates({ profile: sample }, { provider });
  assert.equal(calls, 1);
  assert.equal(result.candidate_count, 5);
  assert.equal(result.candidates[0].discovery_status, "search_result_unverified");
});

test("用户选定后只生成一份 jd_selected.md", async () => {
  const verifyResult = async result => ({
    opportunity_id: "OPP-SELECTED", title: result.title, company: result.company, url: result.url, opportunity_type: "employment",
    verification_status: "verified", retrieved_at: "2026-08-28T00:00:00Z", location: "上海", work_mode: null, employment_type: "全职",
    compensation: null, status: "active", published_at: null, tasks: ["制作数据报表"], required: ["本科"], preferred: [], tools: ["SQL"],
    education_experience: ["本科"], schedule_location_collaboration: [], conditions: [], extraction_notes: [], content_hash: "selected", source_type: "structured_job_page", source_credibility: 0.9
  });
  const result = await generateSelectedJob({ profile: sample, candidate: { candidate_id: "CANDIDATE-001", title: "数据分析师", company: "示例公司", source_url: "https://jobs.example.com/selected" } }, { verifyResult });
  assert.equal(result.file.filename, "jd_selected.md");
  assert.match(result.file.content, /# 数据分析师/);
  assert.equal(result.selected_job.schema_version, "output2.jd.v1.0");
  assert.equal(result.selected_job.opportunity_id, "OPP-SELECTED");
  assert.equal(result.selected_job.title, "数据分析师");
  assert.deepEqual(result.selected_job.required, ["本科"]);
});
