import { readFile } from "node:fs/promises";
import { Agent } from "undici";

const baseUrl = String(process.env.JOB_SEARCH_BASE_URL || "http://localhost:3000").replace(/\/$/, "");
const profile = JSON.parse(await readFile(new URL("../output1.sample.json", import.meta.url), "utf8"));
const dispatcher = new Agent({ headersTimeout: 900_000, bodyTimeout: 900_000 });
const response = await fetch(`${baseUrl}/api/job-search/run`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ profile, max_results_per_direction: 5, target_output_count: 5, market: "CN", language: "zh-CN" }),
  dispatcher
});
const result = await response.json();
if (!response.ok) {
  const error = result?.error || {};
  const failures = error.details?.failures || error.details?.attempts || [];
  const diagnostics = failures.map(item => `${item.code || "SEARCH_FAILED"}: ${item.message || item.reason || "unknown"}`).join(" | ");
  throw new Error(`${error.code || response.status}: ${error.message || "unknown error"}${diagnostics ? `; details=${diagnostics}` : ""}`);
}
const expected = ["jd_01.md", "jd_02.md", "jd_03.md", "jd_04.md", "jd_05.md"];
const actual = (result.files || []).map(file => file.filename);
if (result.output_count !== 5 || JSON.stringify(actual) !== JSON.stringify(expected)) {
  const errors = (result.audit?.search_log || []).filter(item => item.status === "error").map(item => `${item.error_code}: ${item.error_message || "unknown"}`);
  const rejected = (result.audit?.rejected || []).map(item => item.reason);
  throw new Error(`Live smoke incomplete: ${result.output_count}/5; files=${actual.join(",")}; warnings=${(result.warnings || []).join(" | ")}; search_errors=${[...new Set(errors)].join(" | ")}; rejected=${[...new Set(rejected)].join(" | ")}`);
}
for (const file of result.files) {
  if (!/^---[\s\S]+source_url:/m.test(file.content) || !/## 岗位职责或项目任务/.test(file.content)) throw new Error(`${file.filename} structure invalid`);
}
console.log(JSON.stringify({ status: result.status, output_count: result.output_count, files: actual, warnings: result.warnings }, null, 2));
