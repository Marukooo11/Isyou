import { ProxyAgent } from "undici";
import dotenv from "dotenv";

dotenv.config({ path: new URL("../.env.local", import.meta.url), override: true });

const apiKey = process.env.OPENAI_API_KEY;
const baseUrl = String(process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "");
const model = process.env.OPENAI_SEARCH_MODEL;
const proxyUrl = process.env.JOB_SEARCH_PROXY_URL;

if (!apiKey) throw new Error("缺少 OPENAI_API_KEY");
if (!model) throw new Error("缺少 OPENAI_SEARCH_MODEL；必须填写活动‘可用资源’中的精确模型 ID");
const dispatcher = proxyUrl ? new ProxyAgent(proxyUrl) : undefined;

async function probe(name, payload) {
  let response;
  try {
    response = await fetch(`${baseUrl}/responses`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(60000),
      ...(dispatcher ? { dispatcher } : {})
    });
  } catch (error) {
    return { test: name, ok: false, network_error: error?.cause?.code || error.name };
  }
  const contentType = response.headers.get("content-type") || "";
  const text = await response.text();
  let body = {};
  try { body = text ? JSON.parse(text) : {}; } catch {}
  return {
    test: name,
    ok: response.ok,
    status: response.status,
    content_type: contentType,
    error_code: body?.error?.code || body?.error?.type || null,
    error_message: body?.error?.message || (/^\s*</.test(text) ? "服务商返回 HTML 页面" : null)
  };
}

const skipPlain = process.env.PROBE_SKIP_PLAIN === "1";
const plain = skipPlain ? { test: "responses_plain", ok: true, skipped: "已由前一次探测确认" } : await probe("responses_plain", { model, reasoning: { effort: "low" }, max_output_tokens: 64, input: "Reply with OK only." });
const webSearch = plain.ok
  ? await probe("responses_web_search", { model, reasoning: { effort: "low" }, max_output_tokens: 800, tools: [{ type: "web_search" }], input: "搜索一个公开网页并返回来源。" })
  : { test: "responses_web_search", ok: false, skipped: "普通 Responses 请求未通过" };

console.log(JSON.stringify({ base_url: baseUrl, model, plain, web_search: webSearch }, null, 2));
