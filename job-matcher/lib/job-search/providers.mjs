import { PipelineError } from "./errors.mjs";
import { compact, normalizeUrl, withTimeout } from "./utils.mjs";
import { ProxyAgent } from "undici";

function createProxyDispatcher(proxyUrl) {
  if (!proxyUrl) return undefined;
  try {
    return new ProxyAgent(String(proxyUrl));
  } catch {
    throw new PipelineError("SEARCH_PROXY_INVALID", "JOB_SEARCH_PROXY_URL 不是有效的代理地址。", 500);
  }
}

function responseText(response) {
  if (response.output_text) return response.output_text;
  return (response.output || []).flatMap(item => item.content || []).filter(item => item.type === "output_text").map(item => item.text).join("\n");
}

function citationUrls(response) {
  return compact((response.output || []).flatMap(item => item.content || []).flatMap(item => item.annotations || []).map(annotation => annotation.url || annotation.url_citation?.url).map(normalizeUrl));
}

function parseJsonArray(text) {
  const clean = String(text || "").replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  const start = clean.indexOf("[");
  const end = clean.lastIndexOf("]");
  if (start < 0 || end < start) return [];
  try {
    const value = JSON.parse(clean.slice(start, end + 1));
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

async function readProviderJson(response, provider) {
  const contentType = response.headers?.get?.("content-type") || "";
  const body = await response.text();
  try {
    return body ? JSON.parse(body) : {};
  } catch {
    const bodyType = /^\s*</.test(body) ? "html" : "non_json";
    throw new PipelineError(
      "SEARCH_PROVIDER_INVALID_RESPONSE",
      `${provider} 返回了 ${bodyType === "html" ? "HTML 页面" : "非 JSON 内容"}，该接口可能不支持 Responses API 或 web_search。`,
      502,
      { provider, status: response.status, content_type: contentType, body_type: bodyType }
    );
  }
}

export class OpenAIWebSearchProvider {
  constructor({ apiKey = process.env.OPENAI_API_KEY, model = process.env.OPENAI_SEARCH_MODEL || "gpt-5-mini", baseUrl = process.env.OPENAI_BASE_URL || "https://api.openai.com/v1", proxyUrl = process.env.JOB_SEARCH_PROXY_URL, maxOutputTokens = Number(process.env.OPENAI_SEARCH_MAX_OUTPUT_TOKENS || 1800), fetchImpl = fetch, timeoutMs = 45000 } = {}) {
    this.name = "openai_web_search";
    this.apiKey = apiKey;
    this.model = model;
    this.baseUrl = String(baseUrl).replace(/\/$/, "");
    this.fetchImpl = fetchImpl;
    this.dispatcher = createProxyDispatcher(proxyUrl);
    this.maxOutputTokens = maxOutputTokens;
    this.timeoutMs = timeoutMs;
  }

  async search(query, { limit = 10, direction = null } = {}) {
    if (!this.apiKey) throw new PipelineError("SEARCH_PROVIDER_NOT_CONFIGURED", "缺少 OPENAI_API_KEY。", 503);
    const instruction = `在公开网页中搜索中国大陆真实工作机会。查询：${query}\n职业方向：${direction || "未指定"}\n返回最多${limit}条。只返回JSON数组，每项字段为 title、url、snippet、company、location、source_type。不要编造URL；优先企业官网、原始招聘页和项目发布页。搜索摘要只用于发现，不作为事实证据。`;
    const payload = {
      model: this.model,
      reasoning: { effort: "low" },
      max_output_tokens: this.maxOutputTokens,
      tools: [{ type: "web_search", search_context_size: "low" }],
      input: instruction
    };
    let response;
    try {
      response = await withTimeout(this.timeoutMs, signal => this.fetchImpl(`${this.baseUrl}/responses`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${this.apiKey}` },
        body: JSON.stringify(payload),
        signal,
        ...(this.dispatcher ? { dispatcher: this.dispatcher } : {})
      }));
    } catch (error) {
      const reason = error?.cause?.code || error?.name || "FETCH_FAILED";
      throw new PipelineError("SEARCH_PROVIDER_NETWORK_ERROR", `无法连接 OpenAI Search（${reason}）。`, 502, { provider: this.name, reason });
    }
    if (!response.ok) {
      let upstream = {};
      try { upstream = await readProviderJson(response, this.name); } catch (error) {
        if (error.code === "SEARCH_PROVIDER_INVALID_RESPONSE") throw error;
      }
      const reason = upstream?.error?.code || upstream?.error?.type || `HTTP_${response.status}`;
      throw new PipelineError("SEARCH_PROVIDER_ERROR", `OpenAI Web Search 返回 ${response.status}（${reason}）。`, 502, { provider: this.name, status: response.status, reason });
    }
    const data = await readProviderJson(response, this.name);
    const parsed = parseJsonArray(responseText(data));
    const citations = citationUrls(data);
    const results = parsed.map(item => ({
      title: item.title || "",
      url: normalizeUrl(item.url),
      snippet: item.snippet || "",
      company: item.company || null,
      location: item.location || null,
      source_type: item.source_type || "web_search_result",
      provider: this.name
    })).filter(item => item.url);
    for (const url of citations) if (!results.some(item => item.url === url)) results.push({ title: "", url, snippet: "", company: null, location: null, source_type: "web_search_citation", provider: this.name });
    return results.slice(0, limit);
  }
}

export class GoogleCustomSearchProvider {
  constructor({ apiKey = process.env.GOOGLE_CSE_API_KEY, searchEngineId = process.env.GOOGLE_CSE_ID, proxyUrl = process.env.JOB_SEARCH_PROXY_URL, fetchImpl = fetch, timeoutMs = 15000 } = {}) {
    this.name = "google_custom_search";
    this.apiKey = apiKey;
    this.searchEngineId = searchEngineId;
    this.fetchImpl = fetchImpl;
    this.dispatcher = createProxyDispatcher(proxyUrl);
    this.timeoutMs = timeoutMs;
  }

  async search(query, { limit = 10 } = {}) {
    if (!this.apiKey || !this.searchEngineId) throw new PipelineError("SEARCH_PROVIDER_NOT_CONFIGURED", "缺少 GOOGLE_CSE_API_KEY 或 GOOGLE_CSE_ID。", 503);
    const url = new URL("https://www.googleapis.com/customsearch/v1");
    url.searchParams.set("key", this.apiKey);
    url.searchParams.set("cx", this.searchEngineId);
    url.searchParams.set("q", query);
    url.searchParams.set("num", String(Math.min(limit, 10)));
    url.searchParams.set("hl", "zh-CN");
    let response;
    try {
      response = await withTimeout(this.timeoutMs, signal => this.fetchImpl(url, { signal, ...(this.dispatcher ? { dispatcher: this.dispatcher } : {}) }));
    } catch (error) {
      const reason = error?.cause?.code || error?.name || "FETCH_FAILED";
      throw new PipelineError("SEARCH_PROVIDER_NETWORK_ERROR", `无法连接 Google Custom Search（${reason}）。`, 502, { provider: this.name, reason });
    }
    if (!response.ok) throw new PipelineError("SEARCH_PROVIDER_ERROR", `Google Custom Search 返回 ${response.status}。`, 502, { provider: this.name, status: response.status });
    const data = await response.json();
    return (data.items || []).map(item => ({
      title: item.title || "",
      url: normalizeUrl(item.link),
      snippet: item.snippet || "",
      company: null,
      location: null,
      source_type: "web_search_result",
      provider: this.name
    })).filter(item => item.url).slice(0, limit);
  }
}

export class FixtureSearchProvider {
  constructor(resultsByQuery = {}) {
    this.name = "fixture";
    this.resultsByQuery = resultsByQuery;
  }

  async search(query, { limit = 10 } = {}) {
    const direct = this.resultsByQuery[query];
    const fallback = this.resultsByQuery.default || [];
    return (direct || fallback).slice(0, limit).map(item => ({ ...item, provider: this.name }));
  }
}

const sharedSearchCache = new Map();

export class CachedSearchProvider {
  constructor(provider, { ttlHours = Number(process.env.JOB_SEARCH_CACHE_HOURS || 24), cache = sharedSearchCache } = {}) {
    this.provider = provider;
    this.name = `${provider.name}_cached`;
    this.ttlMs = Math.max(0, ttlHours) * 60 * 60 * 1000;
    this.cache = cache;
  }

  async search(query, options = {}) {
    const key = JSON.stringify([this.provider.name, query, options.limit || 10, options.direction || null]);
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.createdAt < this.ttlMs) return structuredClone(cached.results);
    const results = await this.provider.search(query, options);
    if (this.ttlMs > 0) this.cache.set(key, { createdAt: Date.now(), results: structuredClone(results) });
    return results;
  }
}

export class FailoverSearchProvider {
  constructor(providers) {
    this.providers = providers;
    this.name = providers.map(provider => provider.name).join("_then_");
  }

  async search(query, options = {}) {
    const errors = [];
    for (const provider of this.providers) {
      try {
        return await provider.search(query, options);
      } catch (error) {
        errors.push({ provider: provider.name, code: error.code || "SEARCH_FAILED", message: error.message });
      }
    }
    throw new PipelineError("SEARCH_PROVIDER_UNAVAILABLE", "所有已配置的搜索提供商均不可用。", 502, { attempts: errors });
  }
}

export function createSearchProvider(env = process.env, fetchImpl = fetch) {
  const preferred = String(env.JOB_SEARCH_PROVIDER || "openai").toLowerCase();
  const providers = [];
  const openai = env.OPENAI_API_KEY ? new OpenAIWebSearchProvider({ apiKey: env.OPENAI_API_KEY, model: env.OPENAI_SEARCH_MODEL, baseUrl: env.OPENAI_BASE_URL, proxyUrl: env.JOB_SEARCH_PROXY_URL, maxOutputTokens: Number(env.OPENAI_SEARCH_MAX_OUTPUT_TOKENS || 1800), fetchImpl }) : null;
  const google = env.GOOGLE_CSE_API_KEY && env.GOOGLE_CSE_ID ? new GoogleCustomSearchProvider({ apiKey: env.GOOGLE_CSE_API_KEY, searchEngineId: env.GOOGLE_CSE_ID, proxyUrl: env.JOB_SEARCH_PROXY_URL, fetchImpl }) : null;
  if (preferred === "google") providers.push(google, openai);
  else providers.push(openai, google);
  const configured = providers.filter(Boolean).map(provider => new CachedSearchProvider(provider, { ttlHours: Number(env.JOB_SEARCH_CACHE_HOURS || 24) }));
  if (!configured.length) throw new PipelineError("SEARCH_PROVIDER_NOT_CONFIGURED", "未配置可用的搜索提供商。请设置 OPENAI_API_KEY，或同时设置 GOOGLE_CSE_API_KEY 与 GOOGLE_CSE_ID。", 503);
  return configured.length === 1 ? configured[0] : new FailoverSearchProvider(configured);
}
