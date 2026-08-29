import { PipelineError } from "./errors.mjs";
import { asArray, compact, textValue } from "./utils.mjs";

function confirmed(item) {
  return !item?.user_status || item.user_status === "accepted";
}

function publicSkill(skill) {
  if (!confirmed(skill) || !skill?.name) return null;
  return {
    name: skill.normalized_name || skill.name,
    category: skill.category || "unknown",
    level: skill.level || "unknown",
    verified: ["evidence", "internship", "project", "portfolio", "certificate_and_self_report", "mixed"].includes(skill.confidence) || Boolean(skill.evidence_unit_ids?.length)
  };
}

export function createSearchSafeProfile(profile) {
  if (!profile || typeof profile !== "object") throw new PipelineError("INVALID_PROFILE", "请求中缺少 A 输出的 profile JSON。", 400);
  if (profile.consent?.can_use_for_web_job_search !== true) {
    throw new PipelineError("WEB_SEARCH_NOT_AUTHORIZED", "用户没有授权将非敏感画像用于联网岗位检索。", 403);
  }

  const job = profile.job_search_profile || {};
  const directions = (profile.recommended_occupations || [])
    .filter(confirmed)
    .map(item => ({
      occupation_id: item.occupation_id || null,
      title: item.occupation_name || item.name || null,
      search_titles: compact(item.search_titles),
      search_keywords: compact(item.search_keywords),
      negative_keywords: compact(item.negative_keywords),
      reasons: compact(item.reason),
      readiness: item.current_readiness || "unknown"
    }))
    .filter(item => item.title);

  if (!directions.length) throw new PipelineError("NO_ACCEPTED_DIRECTIONS", "A 的输出中没有用户已接受的职业方向。", 422);

  const primaryIds = new Set(directions.map(item => item.occupation_id).filter(Boolean));
  const fallbackDirections = (profile.occupation_match || [])
    .filter(item => item?.user_status !== "rejected" && item?.verdict !== "hold" && item?.name && !primaryIds.has(item.occupation_id))
    .slice(0, 5)
    .map(item => ({
      occupation_id: item.occupation_id || null,
      title: item.name,
      search_titles: [item.name],
      search_keywords: [],
      negative_keywords: [],
      reasons: [],
      readiness: "unknown",
      fallback: true
    }));

  const constraints = (profile.user_work_profile?.constraints || []).filter(confirmed).map(item => ({
    id: item.constraint_id || null,
    label: item.label || item.rule,
    scope: item.scope || "other",
    level: item.constraint_level || item.type || "unknown",
    negotiability: item.negotiability || "unknown"
  })).filter(item => item.label);

  return {
    profile_id: profile.profile_id || null,
    locale: profile.locale || "zh-CN",
    directions,
    fallback_directions: fallbackDirections,
    education: {
      level: job.education?.highest_level || textValue(profile.basic_info?.education_level) || textValue(profile.basic_info?.education) || null,
      major: job.education?.major || null,
      career_stage: job.employment_preferences?.career_stage || null
    },
    experience: {
      relevant_months: job.experience_summary?.relevant_experience_months ?? null,
      formal_months: job.experience_summary?.formal_work_months ?? null,
      internship_months: job.experience_summary?.internship_months ?? null,
      tasks: compact((job.experiences || []).filter(confirmed).flatMap(item => item.tasks || [])),
      deliverables: compact((job.portfolio || []).filter(confirmed).map(item => item.result || item.title))
    },
    skills: (job.skills || []).map(publicSkill).filter(Boolean),
    tools: compact((job.skills || []).map(publicSkill).filter(item => item?.category === "tool" && item.verified).map(item => item.name)),
    domains: compact([
      job.education?.major,
      ...(job.experiences || []).filter(confirmed).map(item => item.domain),
      ...asArray(profile.basic_info?.experience_domain?.label)
    ]),
    location: {
      current_city: job.location_preferences?.current_city || null,
      preferred_cities: compact(job.location_preferences?.preferred_cities),
      acceptable_cities: compact(job.location_preferences?.acceptable_cities),
      work_modes: compact(job.location_preferences?.acceptable_work_modes)
    },
    employment_types: compact(job.employment_preferences?.employment_types),
    constraints
  };
}
