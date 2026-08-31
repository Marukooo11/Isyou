import { createSearchSafeProfile } from "./privacy.mjs";
import { compileMarketSearchVector } from "./compiler.mjs";
import { expandTaxonomy } from "./taxonomy.mjs";
import { createSearchProvider } from "./providers.mjs";
import { verifySearchResult } from "./verifier.mjs";
import { scoreOpportunity } from "./ranking.mjs";
import { renderOpportunityMarkdown } from "./markdown.mjs";
import { PipelineError } from "./errors.mjs";
import { normalizeUrl } from "./utils.mjs";

function uniqueCandidates(results, occupations, count) {
  const seenUrls = new Set();
  const seenLabels = new Set();
  const candidates = [];
  for (const [index, result] of results.entries()) {
    const url = normalizeUrl(result.url);
    const title = String(result.title || "").trim();
    if (!url || !title || seenUrls.has(url)) continue;
    const label = `${result.company || ""}|${title}`.toLowerCase();
    if (seenLabels.has(label)) continue;
    const direction = occupations[index % occupations.length];
    seenUrls.add(url);
    seenLabels.add(label);
    candidates.push({
      candidate_id: `CANDIDATE-${String(candidates.length + 1).padStart(3, "0")}`,
      title,
      company: result.company || null,
      location: result.location || null,
      snippet: result.snippet || "",
      source_url: url,
      source_type: result.source_type || "web_search_result",
      direction_id: direction.canonical_id,
      direction_title: direction.canonical_title_zh,
      discovery_status: "search_result_unverified"
    });
    if (candidates.length === count) break;
  }
  return candidates;
}

function fallbackCandidates(occupations, cities, count = 5) {
  const city = cities[0] || "全国";
  return occupations.slice(0, count).map((direction, index) => {
    const title = direction.market_titles?.[0] || direction.canonical_title_zh;
    const query = encodeURIComponent(`${title} ${city} 招聘`);
    return {
      candidate_id: `DEMO-CANDIDATE-${String(index + 1).padStart(3, "0")}`,
      title: `${title}（检索入口）`,
      company: "公开招聘检索",
      location: city,
      snippet: "实时搜索服务当前不可达。已保留你的画像匹配结果，并提供公开招聘检索入口用于现场演示。",
      source_url: `https://www.baidu.com/s?wd=${query}`,
      source_type: "demo_fallback_search_link",
      direction_id: direction.canonical_id,
      direction_title: direction.canonical_title_zh,
      discovery_status: "demo_fallback_unverified"
    };
  });
}

export async function searchJobCandidates(request, dependencies = {}) {
  const safeProfile = createSearchSafeProfile(request?.profile);
  const vector = compileMarketSearchVector(safeProfile);
  const occupations = expandTaxonomy(vector).filter(item => item.verified).slice(0, 5);
  if (!occupations.length) throw new PipelineError("NO_VERIFIED_OCCUPATIONS", "没有可核验的职业方向。", 422);
  const provider = dependencies.provider || createSearchProvider(dependencies.env || process.env, dependencies.fetchImpl || fetch);
  const cities = [...safeProfile.location.preferred_cities, ...safeProfile.location.acceptable_cities].filter(Boolean).slice(0, 2);
  const titles = occupations.flatMap(item => item.market_titles.slice(0, 2)).slice(0, 10);
  const query = `${titles.join(" / ")} ${cities.join(" ")} 当前招聘。返回5个不同公司的原始岗位详情页。`;
  let results;
  try {
    results = await provider.search(query, { limit: 5, direction: occupations.map(item => item.canonical_title_zh).join("、") });
  } catch (error) {
    if (error.code !== "SEARCH_PROVIDER_NETWORK_ERROR" && error.code !== "SEARCH_PROVIDER_UNAVAILABLE") throw error;
    const candidates = fallbackCandidates(occupations, cities, 5);
    return {
      status: "fallback",
      generated_at: new Date().toISOString(),
      candidate_count: candidates.length,
      candidates,
      warning: "实时搜索服务当前无法连接，已切换为演示检索入口。你的本地岗位匹配结果仍可继续展示。"
    };
  }
  const candidates = uniqueCandidates(results, occupations, 5);
  if (!candidates.length) throw new PipelineError("NO_CANDIDATES_FOUND", "实时搜索没有返回可用岗位候选。", 404);
  return {
    status: candidates.length === 5 ? "complete" : "partial",
    generated_at: new Date().toISOString(),
    candidate_count: candidates.length,
    candidates,
    warning: candidates.length < 5 ? `仅发现 ${candidates.length} 个不同的岗位候选。` : null
  };
}

export async function generateSelectedJob(request, dependencies = {}) {
  const candidate = request?.candidate;
  if (!candidate?.source_url) throw new PipelineError("INVALID_CANDIDATE", "缺少所选岗位的来源链接。", 422);
  const safeProfile = createSearchSafeProfile(request?.profile);
  const vector = compileMarketSearchVector(safeProfile);
  const occupations = expandTaxonomy(vector).filter(item => item.verified);
  const direction = occupations.find(item => item.canonical_id === candidate.direction_id) || occupations[0];
  if (!direction) throw new PipelineError("NO_VERIFIED_OCCUPATIONS", "没有可用于核验的职业方向。", 422);
  const verify = dependencies.verifyResult || verifySearchResult;
  const opportunity = await verify({
    url: candidate.source_url,
    title: candidate.title,
    company: candidate.company,
    location: candidate.location,
    source_type: candidate.source_type,
    direction
  }, { fetchImpl: dependencies.fetchImpl || fetch });
  if (opportunity.verification_status === "rejected") {
    throw new PipelineError("SELECTED_OPPORTUNITY_NOT_VERIFIED", "所选岗位的原始页面无法核验，请返回并选择其他岗位。", 422, { reason: opportunity.rejection_reason || opportunity.status });
  }
  const scored = scoreOpportunity(opportunity, direction, vector, safeProfile);
  if (scored.hard_conflict) throw new PipelineError("SELECTED_OPPORTUNITY_HARD_CONFLICT", "所选岗位与用户硬约束明确冲突，不能生成推荐 JD。", 422);
  return {
    status: "complete",
    generated_at: new Date().toISOString(),
    selected_candidate_id: candidate.candidate_id,
    file: {
      filename: "jd_selected.md",
      opportunity_id: scored.opportunity_id,
      content: renderOpportunityMarkdown(scored, 1)
    },
    verification_status: scored.verification_status
  };
}
