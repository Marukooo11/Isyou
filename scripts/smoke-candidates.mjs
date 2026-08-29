import { readFile } from "node:fs/promises";
import { Agent } from "undici";

const baseUrl = String(process.env.JOB_SEARCH_BASE_URL || "http://localhost:3000").replace(/\/$/, "");
const profile = JSON.parse(await readFile(new URL("../output1.sample.json", import.meta.url), "utf8"));
const startedAt = Date.now();
const response = await fetch(`${baseUrl}/api/job-search/candidates`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ profile, market: "CN", language: "zh-CN" }),
  dispatcher: new Agent({ headersTimeout: 120_000, bodyTimeout: 120_000 })
});
const result = await response.json();
if (!response.ok) throw new Error(`${result?.error?.code || response.status}: ${result?.error?.message || "unknown error"}`);
console.log(JSON.stringify({
  elapsed_seconds: Number(((Date.now() - startedAt) / 1000).toFixed(1)),
  candidate_count: result.candidate_count,
  candidates: result.candidates.map(item => ({ title: item.title, company: item.company, source_url: item.source_url }))
}, null, 2));
