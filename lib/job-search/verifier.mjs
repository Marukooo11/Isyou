import { lookup } from "node:dns/promises";
import { PipelineError } from "./errors.mjs";
import { compact, hashText, normalizeUrl, pickFirst, stripHtml, withTimeout } from "./utils.mjs";

const CLOSED_MARKERS = ["职位已关闭", "停止招聘", "已下线", "职位不存在", "岗位已过期", "job is no longer available", "position has been filled"];
const APPLY_MARKERS = ["立即申请", "申请职位", "投递简历", "我要应聘", "apply now", "submit application", "申请合作", "报名"];
const BLOCKED_MARKERS = ["验证码", "访问过于频繁", "请登录后查看", "安全验证", "captcha"];
const PRIVATE_V4 = /^(127\.|10\.|0\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/;

function publicAddress(address) {
  if (!address) return false;
  if (address.includes(":")) return address !== "::1" && !address.toLowerCase().startsWith("fc") && !address.toLowerCase().startsWith("fd") && !address.toLowerCase().startsWith("fe80");
  return !PRIVATE_V4.test(address);
}

async function assertPublicUrl(raw) {
  const normalized = normalizeUrl(raw);
  if (!normalized) throw new PipelineError("INVALID_SOURCE_URL", "搜索结果包含无效 URL。", 422);
  const url = new URL(normalized);
  if (!/^https?:$/.test(url.protocol)) throw new PipelineError("INVALID_SOURCE_URL", "只允许核验公开 HTTP(S) 页面。", 422);
  if (["localhost", "localhost.localdomain"].includes(url.hostname) || url.hostname.endsWith(".local")) throw new PipelineError("PRIVATE_SOURCE_URL", "拒绝访问本地或内网地址。", 422);
  const addresses = await lookup(url.hostname, { all: true });
  if (!addresses.length || addresses.some(item => !publicAddress(item.address))) throw new PipelineError("PRIVATE_SOURCE_URL", "拒绝访问解析到内网的地址。", 422);
  return normalized;
}

async function fetchPublicPage(rawUrl, { fetchImpl, timeoutMs, userAgent }) {
  let current = await assertPublicUrl(rawUrl);
  for (let redirects = 0; redirects <= 4; redirects += 1) {
    const response = await withTimeout(timeoutMs, signal => fetchImpl(current, {
      headers: { "user-agent": userAgent },
      redirect: "manual",
      signal
    }));
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) return { response, url: current };
      current = await assertPublicUrl(new URL(location, current).toString());
      continue;
    }
    return { response, url: current };
  }
  throw new PipelineError("TOO_MANY_REDIRECTS", "来源页面重定向次数过多。", 422);
}

function jsonLdBlocks(html) {
  const blocks = [];
  const pattern = /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match;
  while ((match = pattern.exec(html))) {
    try {
      const parsed = JSON.parse(match[1].trim());
      blocks.push(...(Array.isArray(parsed) ? parsed : parsed?.["@graph"] || [parsed]));
    } catch {}
  }
  return blocks;
}

function typeIncludes(value, expected) {
  return (Array.isArray(value) ? value : [value]).some(item => String(item || "").toLowerCase() === expected.toLowerCase());
}

function jobPosting(html) {
  return jsonLdBlocks(html).find(item => typeIncludes(item?.["@type"], "JobPosting")) || null;
}

function locationFromSchema(schema) {
  const locations = Array.isArray(schema?.jobLocation) ? schema.jobLocation : [schema?.jobLocation].filter(Boolean);
  return compact(locations.map(item => {
    const address = item?.address || item;
    return compact([address?.addressCountry, address?.addressRegion, address?.addressLocality]).join(" · ");
  })).join("；") || null;
}

function salaryFromSchema(schema) {
  const salary = schema?.baseSalary;
  if (!salary) return null;
  const value = salary.value || salary;
  const amount = value.minValue !== undefined || value.maxValue !== undefined ? `${value.minValue ?? "?"}-${value.maxValue ?? "?"}` : value.value;
  return compact([salary.currency, amount, value.unitText]).join(" ") || null;
}

function metaContent(html, key, attr = "property") {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const patterns = [
    new RegExp(`<meta[^>]+${attr}=["']${escaped}["'][^>]+content=["']([^"']+)["']`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+${attr}=["']${escaped}["']`, "i")
  ];
  return patterns.map(pattern => html.match(pattern)?.[1]).find(Boolean) || null;
}

function titleFromHtml(html) {
  return pickFirst(metaContent(html, "og:title"), html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.replace(/\s+/g, " ").trim());
}

function listSentences(text, patterns, limit = 12) {
  const lines = text.split(/\n|[。；;]/).map(line => line.replace(/^[\s\-•·\d.、）)]+/, "").trim()).filter(line => line.length >= 5 && line.length <= 240);
  const matched = lines.filter(line => patterns.some(pattern => pattern.test(line)));
  return compact(matched).slice(0, limit);
}

function inferOpportunityType(text) {
  if (/自由职业|自由撰稿|freelance|接单/i.test(text)) return "freelance";
  if (/外包|项目制|项目合作|contract/i.test(text)) return "project";
  return "employment";
}

function extractConditions(text, sourceUrl, retrievedAt) {
  const definitions = [
    ["remote_work", /远程|居家办公|remote/i, /必须坐班|仅限现场|驻场|onsite only/i],
    ["flexible_schedule", /弹性时间|灵活时间|时间灵活|flexible schedule/i, /固定夜班|轮班|倒班/i],
    ["travel", /无需出差|不出差/i, /频繁出差|长期出差/i],
    ["onsite", /现场办公|坐班|驻场|onsite/i, /全远程|fully remote/i],
    ["communication_load", /异步协作|文字沟通|文档协作/i, /频繁电话|高频客户沟通|大量会议/i]
  ];
  return definitions.map(([condition, positive, negative]) => {
    const negativeMatch = text.match(negative)?.[0];
    const positiveMatch = text.match(positive)?.[0];
    return {
      condition,
      status: negativeMatch ? "explicit_conflict" : positiveMatch ? "explicit_match" : "unknown_to_confirm",
      source_url: sourceUrl,
      evidence_text: negativeMatch || positiveMatch || "来源未明确说明",
      retrieved_at: retrievedAt
    };
  });
}

export function extractOpportunity({ html, url, searchResult = {}, retrievedAt = new Date().toISOString() }) {
  const schema = jobPosting(html);
  const plain = stripHtml(html).slice(0, 120000);
  const description = stripHtml(schema?.description || "");
  const evidenceText = description.length >= 20 ? description : plain;
  const title = pickFirst(schema?.title, titleFromHtml(html), searchResult.title);
  const company = pickFirst(schema?.hiringOrganization?.name, metaContent(html, "og:site_name"), searchResult.company);
  const closed = CLOSED_MARKERS.some(marker => evidenceText.toLowerCase().includes(marker.toLowerCase()));
  const blocked = BLOCKED_MARKERS.some(marker => evidenceText.toLowerCase().includes(marker.toLowerCase()));
  const hasApply = APPLY_MARKERS.some(marker => evidenceText.toLowerCase().includes(marker.toLowerCase())) || Boolean(schema?.url || schema?.directApply);
  const tasks = listSentences(evidenceText, [/负责|职责|工作内容|完成|制作|维护|开发|分析|设计|执行|交付|参与/]);
  const required = listSentences(evidenceText, [/必须|要求|任职资格|熟悉|熟练|具备|能够|以上学历|年以上|优先考虑/]);
  const preferred = required.filter(line => /优先|加分|preferred|nice to have/i.test(line));
  const tools = compact(evidenceText.match(/\b(?:Python|Java|C\+\+|C#|SQL|Excel|Blender|Maya|3ds Max|Photoshop|Figma|CAD|Git|Linux|Pandas|Tableau|Power BI)\b/gi));
  const status = closed ? "expired" : blocked ? "unknown" : "active";
  const verificationStatus = closed || !title || !company || (!schema && evidenceText.length < 120) ? "rejected" : hasApply && tasks.length ? "verified" : "partially_verified";
  return {
    opportunity_id: `OPP-${hashText(`${company}|${title}|${url}`)}`,
    title,
    company,
    url,
    source_type: schema ? "structured_job_page" : searchResult.source_type || "public_web_page",
    opportunity_type: inferOpportunityType(evidenceText),
    location: pickFirst(locationFromSchema(schema), searchResult.location),
    work_mode: /远程|remote/i.test(evidenceText) ? "远程或包含远程描述" : /混合|hybrid/i.test(evidenceText) ? "混合办公" : /驻场|现场|坐班|onsite/i.test(evidenceText) ? "现场或驻场" : null,
    employment_type: pickFirst(schema?.employmentType, inferOpportunityType(evidenceText)),
    compensation: salaryFromSchema(schema),
    published_at: pickFirst(schema?.datePosted),
    retrieved_at: retrievedAt,
    status,
    verification_status: verificationStatus,
    tasks,
    required: required.filter(item => !preferred.includes(item)),
    preferred,
    tools,
    education_experience: listSentences(evidenceText, [/学历|本科|硕士|博士|经验|年工作|应届|专业|资格|证书|执照/], 8),
    schedule_location_collaboration: listSentences(evidenceText, [/远程|现场|驻场|弹性|工时|上班|会议|沟通|协作|出差|地点|办公/], 10),
    conditions: extractConditions(evidenceText, url, retrievedAt),
    content_hash: hashText(evidenceText),
    page_text_length: evidenceText.length,
    source_credibility: schema ? 0.9 : hasApply ? 0.72 : 0.5,
    extraction_notes: compact([
      schema ? "页面包含 schema.org JobPosting 结构化数据" : "页面没有可识别的 JobPosting 结构化数据",
      !schema?.datePosted ? "发布时间未知" : null,
      blocked ? "页面存在登录或验证限制" : null
    ])
  };
}

export async function verifySearchResult(searchResult, { fetchImpl = fetch, timeoutMs = Number(process.env.JOB_SEARCH_TIMEOUT_MS || 12000), retrievedAt = new Date().toISOString() } = {}) {
  try {
    const { response, url } = await fetchPublicPage(searchResult.url, { fetchImpl, timeoutMs, userAgent: "QiguangJobVerifier/1.0 (+public-job-page-verification)" });
    const contentType = response.headers.get("content-type") || "";
    if (!response.ok || !contentType.includes("text/html")) return { ...searchResult, url, verification_status: "rejected", rejection_reason: `HTTP_${response.status || "UNSUPPORTED_CONTENT"}` };
    const html = await response.text();
    return extractOpportunity({ html, url, searchResult, retrievedAt });
  } catch (error) {
    return { ...searchResult, verification_status: "rejected", rejection_reason: error.code || error.name || "FETCH_FAILED" };
  }
}

export async function verifyConditionSource(searchResult, { fetchImpl = fetch, timeoutMs = Number(process.env.JOB_SEARCH_TIMEOUT_MS || 12000), retrievedAt = new Date().toISOString() } = {}) {
  try {
    const { response, url } = await fetchPublicPage(searchResult.url, { fetchImpl, timeoutMs, userAgent: "QiguangJobVerifier/1.0 (+public-work-condition-verification)" });
    if (!response.ok || !(response.headers.get("content-type") || "").includes("text/html")) return [];
    const text = stripHtml(await response.text()).slice(0, 120000);
    if (text.length < 100 || BLOCKED_MARKERS.some(marker => text.toLowerCase().includes(marker.toLowerCase()))) return [];
    return extractConditions(text, url, retrievedAt).filter(item => item.status !== "unknown_to_confirm");
  } catch {
    return [];
  }
}
