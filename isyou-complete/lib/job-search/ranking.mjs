import { compact, hashText } from "./utils.mjs";

function includesAny(text, terms) {
  const haystack = String(text || "").toLowerCase();
  return compact(terms).some(term => haystack.includes(String(term).toLowerCase()));
}

function constraintCondition(label) {
  if (/远程|坐班|现场|驻场/.test(label)) return "remote_work";
  if (/夜班|轮班|弹性|工时|加班/.test(label)) return "flexible_schedule";
  if (/出差/.test(label)) return "travel";
  if (/沟通|电话|会议|客户/.test(label)) return "communication_load";
  return null;
}

function checkMustConstraints(opportunity, safeProfile) {
  const checks = [];
  for (const constraint of safeProfile.constraints.filter(item => item.level === "hard" || item.level === "must")) {
    const conditionName = constraintCondition(constraint.label);
    const evidence = conditionName ? opportunity.conditions.find(item => item.condition === conditionName) : null;
    checks.push({
      constraint: constraint.label,
      condition: conditionName || "other",
      status: evidence?.status || "unknown_to_confirm",
      evidence: evidence?.evidence_text || "来源未明确说明"
    });
  }

  const allowedCities = compact([...safeProfile.location.preferred_cities, ...safeProfile.location.acceptable_cities]);
  if (allowedCities.length && opportunity.location && !includesAny(opportunity.location, [...allowedCities, "中国", "全国"])) {
    checks.push({ constraint: "可接受工作地点", condition: "location", status: "explicit_conflict", evidence: opportunity.location });
  }
  return checks;
}

function directionScore(opportunity, direction, vector) {
  const text = [opportunity.title, ...opportunity.tasks, ...opportunity.required].join(" ");
  const titleHits = direction.market_titles.filter(term => includesAny(opportunity.title, [term])).length;
  const taskHits = direction.tasks.filter(term => includesAny(text, [term])).length;
  const deliverableHits = direction.deliverables.filter(term => includesAny(text, [term])).length;
  const toolHits = vector.verified_tools.filter(term => includesAny(text, [term])).length;
  return Math.min(1, titleHits * 0.35 + taskHits * 0.14 + deliverableHits * 0.12 + toolHits * 0.08);
}

function completeness(opportunity) {
  const fields = [opportunity.title, opportunity.company, opportunity.location, opportunity.tasks.length, opportunity.required.length, opportunity.url];
  return fields.filter(Boolean).length / fields.length;
}

export function scoreOpportunity(opportunity, direction, vector, safeProfile) {
  const constraintChecks = checkMustConstraints(opportunity, safeProfile);
  const hardConflict = constraintChecks.some(item => item.status === "explicit_conflict");
  const preferConditions = safeProfile.constraints.filter(item => ["soft", "preference", "prefer"].includes(item.level));
  const preferMatches = preferConditions.filter(constraint => {
    const name = constraintCondition(constraint.label);
    return opportunity.conditions.find(item => item.condition === name)?.status === "explicit_match";
  }).length;
  const directionRelevance = directionScore(opportunity, direction, vector);
  const credibility = opportunity.source_credibility || 0;
  const statusScore = opportunity.verification_status === "verified" ? 1 : opportunity.verification_status === "partially_verified" ? 0.55 : 0;
  const total = directionRelevance * 0.42 + credibility * 0.24 + completeness(opportunity) * 0.18 + statusScore * 0.12 + Math.min(1, preferMatches / Math.max(1, preferConditions.length)) * 0.04;
  return {
    ...opportunity,
    direction_id: direction.canonical_id,
    direction_title: direction.canonical_title_zh,
    internal_score: Number(total.toFixed(4)),
    direction_relevance: Number(directionRelevance.toFixed(4)),
    constraint_checks: constraintChecks,
    hard_conflict: hardConflict,
    dedupe_key: hashText(`${opportunity.company}|${opportunity.title}|${opportunity.location}|${opportunity.content_hash}`)
  };
}

export function dedupeOpportunities(opportunities) {
  const seenUrls = new Set();
  const seenBodies = new Set();
  const seenIdentity = new Set();
  return [...opportunities].sort((a, b) => b.internal_score - a.internal_score).filter(item => {
    const identity = `${String(item.company).toLowerCase()}|${String(item.title).toLowerCase()}|${String(item.location).toLowerCase()}`;
    if (seenUrls.has(item.url) || seenBodies.has(item.content_hash) || seenIdentity.has(identity)) return false;
    seenUrls.add(item.url);
    seenBodies.add(item.content_hash);
    seenIdentity.add(identity);
    return true;
  });
}

export function selectDiverseOpportunities(opportunities, targetCount = 5) {
  const eligible = opportunities.filter(item => !item.hard_conflict && ["verified", "partially_verified"].includes(item.verification_status) && item.direction_relevance > 0);
  const selected = [];
  const companies = new Set();
  const directions = new Set();

  for (const item of eligible) {
    const company = String(item.company || "").toLowerCase();
    if (company && companies.has(company)) continue;
    if (directions.has(item.direction_id)) continue;
    selected.push(item);
    if (company) companies.add(company);
    directions.add(item.direction_id);
    if (selected.length === targetCount) return selected;
  }
  for (const item of eligible) {
    if (selected.includes(item)) continue;
    const company = String(item.company || "").toLowerCase();
    if (company && companies.has(company)) continue;
    selected.push(item);
    if (company) companies.add(company);
    if (selected.length === targetCount) break;
  }
  return selected;
}
