import { createHash } from "node:crypto";

export const compact = values => [...new Set((values || []).filter(Boolean).map(value => String(value).trim()).filter(Boolean))];

export function textValue(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === "object" && "value" in value) return value.value;
  return value;
}

export function asArray(value) {
  const resolved = textValue(value);
  if (resolved === null || resolved === undefined || resolved === "unknown") return [];
  return Array.isArray(resolved) ? resolved : [resolved];
}

export function normalizeUrl(raw) {
  try {
    const url = new URL(raw);
    url.hash = "";
    ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "spm", "from", "ref"].forEach(key => url.searchParams.delete(key));
    url.hostname = url.hostname.toLowerCase();
    return url.toString().replace(/\/$/, "");
  } catch {
    return null;
  }
}

export function hashText(value) {
  return createHash("sha256").update(String(value || "")).digest("hex").slice(0, 24);
}

export function safeScalar(value, fallback = "未知") {
  if (value === null || value === undefined || value === "" || value === "unknown") return fallback;
  return String(value).replace(/[\r\n]+/g, " ").trim();
}

export function escapeYaml(value) {
  return JSON.stringify(safeScalar(value, "unknown"));
}

export function withTimeout(timeoutMs, fn) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return Promise.resolve(fn(controller.signal)).finally(() => clearTimeout(timer));
}

export function stripHtml(html) {
  return String(html || "")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/<\/p>|<\/li>|<\/div>|<\/h[1-6]>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function pickFirst(...values) {
  return values.flat().find(value => value !== null && value !== undefined && value !== "" && value !== "unknown") ?? null;
}
