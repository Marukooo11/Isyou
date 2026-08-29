import { PipelineError } from "./errors.mjs";
import { createSearchSafeProfile } from "./privacy.mjs";
import { compileMarketSearchVector } from "./compiler.mjs";
import { expandTaxonomy } from "./taxonomy.mjs";
import { compileSearchPlan } from "./search-plan.mjs";
import { createSearchProvider } from "./providers.mjs";
import { verifyConditionSource, verifySearchResult } from "./verifier.mjs";
import { dedupeOpportunities, scoreOpportunity, selectDiverseOpportunities } from "./ranking.mjs";
import { buildMarkdownFiles } from "./markdown.mjs";
import { compact, normalizeUrl } from "./utils.mjs";

async function mapLimit(items, limit, mapper) {
  const results = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const index = next++;
      results[index] = await mapper(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

function uniqueResults(results) {
  const seen = new Set();
  return results.filter(item => {
    const url = normalizeUrl(item?.url);
    if (!url || seen.has(url)) return false;
    seen.add(url);
    item.url = url;
    return true;
  });
}

function mergeConditionEvidence(opportunity, evidence) {
  if (!evidence.length) return opportunity;
  const conditions = opportunity.conditions.map(condition => {
    if (condition.status !== "unknown_to_confirm") return condition;
    return evidence.find(item => item.condition === condition.condition) || condition;
  });
  return { ...opportunity, conditions };
}

async function discoverDirection(plan, provider, maxResults, searchLog) {
  const discoverySources = [];
  for (const entry of plan.discovery.slice(0, 1)) {
    try {
      const results = await provider.search(entry.query, { limit: 5, direction: plan.direction.canonical_title_zh });
      discoverySources.push(...results.map(result => result.url).filter(Boolean));
      searchLog.push({ ...entry, provider: provider.name, result_count: results.length, status: "ok" });
    } catch (error) {
      searchLog.push({ ...entry, provider: provider.name, result_count: 0, status: "error", error_code: error.code || "SEARCH_FAILED", error_message: error.message });
    }
  }
  const executedOpportunityQueries = plan.opportunities.slice(0, maxResults > 10 ? 4 : 2);
  const queryLimit = Math.max(3, Math.ceil(maxResults / Math.max(1, executedOpportunityQueries.length)));
  const queryResults = await mapLimit(executedOpportunityQueries, 2, async entry => {
    try {
      const results = await provider.search(entry.query, { limit: queryLimit, direction: plan.direction.canonical_title_zh });
      searchLog.push({ ...entry, provider: provider.name, result_count: results.length, status: "ok" });
      return results.map(result => ({ ...result, direction: plan.direction, discovery_query: entry.query, occupation_discovery_sources: compact(discoverySources) }));
    } catch (error) {
      searchLog.push({ ...entry, provider: provider.name, result_count: 0, status: "error", error_code: error.code || "SEARCH_FAILED", error_message: error.message });
      return [];
    }
  });
  return uniqueResults(queryResults.flat()).slice(0, maxResults);
}

async function verifyHiddenConditions(opportunity, plan, provider, fetchImpl, searchLog, conditionVerifier = verifyConditionSource) {
  const unknown = opportunity.conditions.filter(item => item.status === "unknown_to_confirm");
  if (!unknown.length) return opportunity;
  const queries = [`${opportunity.company || ""} ${opportunity.title || ""} 远程 弹性办公 加班 出差 驻场 团队沟通 会议 项目制`];
  const evidence = [];
  for (const query of queries) {
    try {
      const results = await provider.search(query, { limit: 3, direction: plan.direction.canonical_title_zh });
      searchLog.push({ stage: 3, purpose: "condition_verification", query, provider: provider.name, result_count: results.length, status: "ok" });
      const checked = await mapLimit(uniqueResults(results).slice(0, 2), 2, result => conditionVerifier(result, { fetchImpl }));
      evidence.push(...checked.flat());
    } catch (error) {
      searchLog.push({ stage: 3, purpose: "condition_verification", query, provider: provider.name, result_count: 0, status: "error", error_code: error.code || "SEARCH_FAILED", error_message: error.message });
    }
  }
  return mergeConditionEvidence(opportunity, evidence);
}

export async function runJobSearch(request, dependencies = {}) {
  const profile = request?.profile;
  const maxResults = Math.min(20, Math.max(3, Number(request?.max_results_per_direction || 10)));
  const requestedCount = Number(request?.target_output_count ?? 5);
  if (requestedCount !== 5) throw new PipelineError("INVALID_TARGET_OUTPUT_COUNT", "第一版固定输出5份 JD，target_output_count 必须为5。", 422);
  const targetCount = 5;
  if ((request?.market || "CN") !== "CN") throw new PipelineError("UNSUPPORTED_MARKET", "第一版只支持中国大陆市场 CN。", 422);
  const safeProfile = createSearchSafeProfile(profile);
  const vector = compileMarketSearchVector(safeProfile);
  const occupations = expandTaxonomy(vector);
  const fallbackOccupations = expandTaxonomy(vector, "fallback_direction_seeds");
  const verifiedOccupations = occupations.filter(item => item.verified);
  if (!verifiedOccupations.length) throw new PipelineError("NO_VERIFIED_OCCUPATIONS", "没有可由职业库或市场词表核验的职业名称。", 422);

  const plans = compileSearchPlan(vector, verifiedOccupations, safeProfile);
  const provider = dependencies.provider || createSearchProvider(dependencies.env || process.env, dependencies.fetchImpl || fetch);
  const fetchImpl = dependencies.fetchImpl || fetch;
  const verifyResult = dependencies.verifyResult || verifySearchResult;
  const verifyCondition = dependencies.verifyCondition || verifyConditionSource;
  const searchLog = [];
  const rejected = [];
  const scored = [];

  const processPlans = async batch => {
    await mapLimit(batch, 2, async plan => {
      const discoveries = await discoverDirection(plan, provider, maxResults, searchLog);
      const verified = await mapLimit(discoveries, 4, result => verifyResult(result, { fetchImpl }));
      for (const opportunity of verified) {
        if (opportunity.verification_status === "rejected") {
          rejected.push({ url: opportunity.url, reason: opportunity.rejection_reason || opportunity.status || "VERIFICATION_REJECTED", direction_id: plan.direction.canonical_id });
          continue;
        }
        scored.push(scoreOpportunity(opportunity, plan.direction, vector, safeProfile));
      }
    });
  };
  await processPlans(plans);
  if (searchLog.length && searchLog.every(item => item.status === "error")) {
    const failures = [...new Map(searchLog.map(item => [item.error_code, { code: item.error_code, message: item.error_message }])).values()];
    throw new PipelineError("SEARCH_PROVIDER_UNAVAILABLE", "实时搜索服务不可用，尚未执行岗位筛选。", 502, { provider: provider.name, failures });
  }
  const primaryEligible = dedupeOpportunities(scored).filter(item => !item.hard_conflict && ["verified", "partially_verified"].includes(item.verification_status) && item.direction_relevance > 0);
  if (primaryEligible.length < targetCount && fallbackOccupations.length) {
    const fallbackPlans = compileSearchPlan(vector, fallbackOccupations.filter(item => item.verified), safeProfile);
    plans.push(...fallbackPlans);
    await processPlans(fallbackPlans);
  }

  const initial = dedupeOpportunities(scored);
  const topForConditionCheck = initial.filter(item => !item.hard_conflict).slice(0, targetCount + 2);
  const augmented = [];
  for (const opportunity of topForConditionCheck) {
    const plan = plans.find(item => item.direction.canonical_id === opportunity.direction_id);
    const checked = await verifyHiddenConditions(opportunity, plan, provider, fetchImpl, searchLog, verifyCondition);
    augmented.push(scoreOpportunity(checked, plan.direction, vector, safeProfile));
  }
  const untouched = initial.filter(item => !topForConditionCheck.includes(item));
  const ranked = dedupeOpportunities([...augmented, ...untouched]).sort((a, b) => b.internal_score - a.internal_score);
  const selected = selectDiverseOpportunities(ranked, targetCount);
  const files = buildMarkdownFiles(selected);
  const warnings = compact([
    selected.length < targetCount ? `仅找到 ${selected.length} 个通过核验且无明确硬冲突的机会。` : null,
    rejected.length ? `${rejected.length} 个候选因页面不可核验、失效或字段不足被拒绝。` : null
  ]);

  return {
    status: selected.length === targetCount ? "complete" : "partial",
    code: selected.length === targetCount ? "OK" : "INSUFFICIENT_VERIFIED_OPPORTUNITIES",
    generated_at: new Date().toISOString(),
    target_output_count: targetCount,
    output_count: selected.length,
    files,
    warnings,
    audit: {
      search_provider: provider.name,
      market_search_vector: vector,
      occupations: verifiedOccupations,
      search_plan: plans,
      search_log: searchLog,
      rejected,
      selected: selected.map(item => ({ opportunity_id: item.opportunity_id, source_url: item.url, direction_id: item.direction_id }))
    }
  };
}
