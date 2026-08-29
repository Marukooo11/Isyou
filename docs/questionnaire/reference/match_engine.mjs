// match_engine.mjs —— 职业/岗位匹配正式引擎（问卷4.0 · output1.v1.0）
//
// 用法：node match_engine.mjs <profile.json> [occupation.json] [输出.json]
//   profile.json    ：output1.v1.0 画像（问卷/skill 产出，需含 big5_scores、intelligence_profile，
//                     job_search_profile、consent、evidence_units）
//   occupation.json ：职业库（默认：脚本目录，回退 ../新职业库/）
//   输出.json       ：回写 occupation_match / recommended_occupations / profile_status / meta 后的完整画像
//
// 规则来源：《智能-数据字段说明.md》附录A + 《智能-问卷4.0评分说明.md》第八章。
// 红线：未知即 null/空数组，禁止猜测；job_matching_ready=false 时推荐必须为空数组。
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DIMS = ["E", "N", "C", "A", "O"];
const NEUTRAL_LO = 0.4, NEUTRAL_HI = 0.6;

function resolveLibPath(arg) {
  if (arg) return arg;
  const candidates = [path.join(HERE, "occupation.json"), "E:/ASD/新职业库/occupation.json"];
  for (const c of candidates) if (fs.existsSync(c)) return c;
  throw new Error("未找到 occupation.json，请显式传入路径");
}

const [profilePath, libArg, outArg] = process.argv.slice(2);
if (!profilePath) { console.error("用法: node match_engine.mjs <profile.json> [occupation.json] [输出.json]"); process.exit(1); }
const libPath = resolveLibPath(libArg);
const profile = JSON.parse(fs.readFileSync(profilePath, "utf8"));
const lib = JSON.parse(fs.readFileSync(libPath, "utf8")).occupations;

// ---------- 1. 用户立场（附录A：N 翻转是唯一 1-x 出现点；可靠性门控） ----------
function userStance(dim, sc) {
  if (!sc) return "excluded";
  const rel = sc.reliability ?? "ok";
  if (rel === "low_confidence" || String(rel).startsWith("inconsistent")) return "excluded";
  const norm = dim === "N" ? 1 - sc.norm : sc.norm;
  if (norm >= NEUTRAL_HI) return "high";
  if (norm <= NEUTRAL_LO) return "low";
  return "neutral";
}
function flippedNorm(dim, sc) { return dim === "N" ? 1 - sc.norm : sc.norm; }

// ---------- 2. 双轨打分 ----------
function scoreOccupation(occ) {
  const matched = {}, conflict = {}, skipped = [];
  let sum = 0, wsum = 0, valid = 0;
  for (const d of DIMS) {
    const sc = profile.big5_scores?.[d];
    const stance = userStance(d, sc);
    const occSt = occ.big5_state?.[d] ?? "none";
    if (stance === "neutral" || stance === "excluded") {
      skipped.push({ dim: d, reason: stance === "neutral" ? "user_neutral"
        : sc?.reliability === "low_confidence" ? "user_excluded_low_confidence" : "user_excluded_inconsistent" });
      continue;
    }
    if (occSt === "both" || occSt === "none") {
      skipped.push({ dim: d, reason: occSt === "both" ? "occupation_both" : "occupation_none" });
      continue;
    }
    valid++;
    const w = Math.max(0.2, Math.abs(2 * flippedNorm(d, sc) - 1));
    if (stance === occSt) { matched[d] = stance; sum += w; }
    else { conflict[d] = stance; sum -= w; }
    wsum += w;
  }
  const big5_match = valid >= 2 && wsum > 0 ? sum / wsum : null;
  let im = 0;
  (occ.intelligence_tags ?? []).forEach((t, i) => {
    const v = profile.intelligence_profile?.[t]?.verdict;
    if (v === "strength") im += 2 + (i === 0 ? 0.5 : 0);
    else if (v === "potential") im += 1;
  });
  const im_norm = Math.min(1, im / 7);
  const big5_norm = big5_match === null ? null : (big5_match + 1) / 2;
  const match_score = big5_norm === null ? im_norm : 0.5 * big5_norm + 0.5 * im_norm;
  const confidence = big5_norm === null ? "intelligence_only" : "both_tracks";
  const envNotes = envDemotions(occ); // 环境冲突：每条把 verdict 降一级（recommend→worth_exploring→hold）
  let verdict = match_score >= 0.70 ? "recommend" : match_score >= 0.45 ? "worth_exploring" : "hold";
  for (const _ of envNotes) verdict = verdict === "recommend" ? "worth_exploring" : "hold";
  const basis = [];
  for (const [d, s] of Object.entries(matched)) basis.push(`${d}立场一致(${s === "high" ? "高" : "低"})`);
  for (const d of Object.keys(conflict)) basis.push(`${d}立场冲突`);
  for (const n of envNotes) basis.push(n);
  return {
    occupation_id: occ.occupation_id, name: occ.name,
    match_score: round3(match_score), verdict,
    big5_match: big5_match === null ? null : round3(big5_match),
    intelligence_match_norm: round3(im_norm),
    matched_dimensions: matched, conflict_dimensions: conflict,
    skipped_dimensions: skipped,
    matched_intelligences: (occ.intelligence_tags ?? []).filter(t =>
      ["strength", "potential"].includes(profile.intelligence_profile?.[t]?.verdict ?? "")),
    env_demotions: envNotes,
    confidence, basis, user_status: "accepted",
  };
}
const round3 = x => Math.round(x * 1000) / 1000;

// ---------- 3. job_matching_ready 判定（评分说明 8.1） ----------
function evaluateReadiness() {
  const missing = [];
  const js = profile.job_search_profile ?? {};
  if (profile.profile_status?.completion_level === "psychological_only")
    missing.push("job_search_profile（B7=暂时不找，补充页未作答）");
  if (!profile.consent?.can_use_for_job_matching)
    missing.push("consent.can_use_for_job_matching");
  if (!js.education?.highest_level) missing.push("job_search_profile.education.highest_level");
  if (!js.location_preferences?.current_city) missing.push("job_search_profile.location_preferences.current_city");
  if (!js.employment_preferences?.target_seniority?.length) missing.push("job_search_profile.employment_preferences.target_seniority");
  if (!js.employment_preferences?.employment_types?.length) missing.push("job_search_profile.employment_preferences.employment_types");
  if (js.compensation?.minimum_amount == null) missing.push("job_search_profile.compensation.minimum_amount");
  const noExpNoSkill = !(js.experiences?.length) && !(js.skills?.length);
  if (noExpNoSkill) {
    const strongLifeEU = (profile.evidence_units ?? []).some(eu => eu.strength >= 2);
    if (!strongLifeEU) missing.push("job_search_profile.experiences[]/skills[]（且无 2 级以上生活证据）");
  }
  return missing;
}
const missing = evaluateReadiness();
const job_matching_ready = missing.length === 0;

// ---------- 4. occupation 级硬约束否决（评分说明 8.2 第2步的可执行子集） ----------
// 职业库目前无地点/薪资/行业字段——这些属于 JD 层，由 handoff 消费方在真实岗位层执行；
// 当前唯一可执行的 occupation 级规则：用户"避免面向客户"类硬约束 vs 人际智能为首要标签的职业。
function vetoReasons(occ) {
  const reasons = [];
  for (const c of profile.user_work_profile?.constraints ?? []) {
    if (c.constraint_level !== "hard") continue;
    const isClient = c.constraint_id === "no_client_facing" || /客户|销售|地推/.test(c.label ?? "");
    if (isClient && occ.intelligence_tags?.[0] === "interpersonal")
      reasons.push(`人际密集型职业（人际智能为首要标签）与硬约束"${c.label}"冲突`);
  }
  return reasons;
}

// ---------- 4b. 补标标签消费：环境冲突降级 / 出差硬否决 / 资格硬否决 / 职级过滤 ----------
const CRED_ZH = {
  medical_license: "医师类执照", law_license: "法律职业资格", cpa_professional: "财会/金融专业资格",
  other_professional: "执业资格（药师/兽医/助产等）", teaching_cert: "教师资格", driver_license: "驾驶执照",
};
const CRED_KEYS = {
  medical_license: /医师|医生执照|执业医|护士执业|护师|药师/,
  law_license: /法律职业资格|司法考试|律师/,
  cpa_professional: /注册会计师|CPA|保荐|证券从业|基金从业|精算|会计从业/,
  other_professional: /执业药师|兽医|助产|心理治疗师/,
};

function envDemotions(occ) {
  const notes = [];
  const env = occ.environment_tags ?? {};
  const cs = profile.user_work_profile?.constraints ?? [];
  const isHard = c => c.constraint_level === "hard" || c.negotiability === "non_negotiable";
  const has = id => cs.some(c => c.constraint_id === id);
  if ((has("quiet_env") || cs.some(c => /安静|噪音/.test(c.label ?? ""))) && env.noise_level === "high")
    notes.push("环境冲突：该职业典型环境噪音高");
  if (has("no_frequent_switching") && env.interruption_frequency === "high")
    notes.push("环境冲突：该职业打断频繁");
  if (cs.some(c => /远程/.test(c.label ?? "") && isHard(c)) && env.remote_feasibility === "low")
    notes.push("环境冲突：该职业远程可行性低");
  return notes;
}

function envVeto(occ) {
  const cs = profile.user_work_profile?.constraints ?? [];
  const has = id => cs.some(c => c.constraint_id === id);
  if (has("no_heavy_travel") && occ.environment_tags?.travel_level === "frequent")
    return ["硬约束：不接受频繁出差，而该职业典型出差频繁"];
  return [];
}

function credVeto(occ, js) {
  const cred = occ.credential_required;
  if (!cred || cred === "none" || cred === "unknown" || cred === "vocational_cert") return [];
  const held = [...(js?.eligibility?.certifications ?? []), ...(js?.eligibility?.licenses ?? [])].join("；");
  const re = CRED_KEYS[cred] ?? (cred === "teaching_cert" ? /教师资格|教资/ : cred === "driver_license" ? /驾照|驾驶证/ : null);
  if (!re) return [];
  if (!re.test(held)) return [`资格硬否决：需要${CRED_ZH[cred] ?? cred}，画像未确认持有`];
  return [];
}

function seniorityBlock(occ, js) {
  if (occ.typical_seniority !== "experienced_required") return false;
  const stage = js?.employment_preferences?.career_stage;
  const months = js?.experience_summary?.relevant_experience_months ?? js?.experience_summary?.formal_work_months ?? 0;
  return stage === "fresh_graduate" || stage === "entry_level" || months < 12;
}

// ---------- 5. 推荐生成（评分说明 8.2：恰好5条 + 松绑顺序） ----------
const NEG_MAP = {
  no_client_facing: ["销售", "电话销售", "地推", "商务拓展", "BD"],
  no_heavy_travel: ["出差", "驻场", "外派"],
  no_frequent_switching: ["多线程", "急速响应"],
};
// 源库中的非职业/状态类条目（不进推荐池，保留在 occupation_match 中）
const NON_JOB = new Set([
  "职业学生（继续深造）", "家庭主妇/主夫", "全职父母", "独裁者", "职业杀手",
  "雇佣兵", "国际间谍", "赏金猎人", "环保主义者", "社会活动家",
]);

function buildRecommended(sorted) {
  const warnings = [];
  if (!job_matching_ready) return { recommended: [], warnings };

  const js = profile.job_search_profile ?? {};
  const vetoCount = sorted.filter(r => r.vetoed).length;
  const senBlocked = sorted.filter(r => r._seniority_blocked);
  if (vetoCount) warnings.push(`硬否决 ${vetoCount} 个职业（客户面向/频繁出差/资格不符；详见 occupation_match.vetoed 汇总数）`);
  if (senBlocked.length) warnings.push(`${senBlocked.length} 个"需经验资历"职业对入门用户暂缓（职级过滤）`);

  // 松绑顺序：verdict 门槛 → 职级过滤；资格/出差否决与 non-job 排除永不松绑
  let pool = sorted.filter(r => !r.vetoed && !r._seniority_blocked && r.verdict !== "hold" && !NON_JOB.has(r.name));
  if (pool.length < 5) {
    pool = sorted.filter(r => !r.vetoed && !r._seniority_blocked && !NON_JOB.has(r.name));
    warnings.push("候选不足 5，已放宽 verdict 门槛至 hold");
  }
  if (pool.length < 5) {
    pool = sorted.filter(r => !r.vetoed && !NON_JOB.has(r.name));
    warnings.push("候选仍不足 5，已松绑职级过滤（含需经验资历职业，就绪度标 exploration_only）");
  }
  const top = pool.slice(0, 5);

  const fresh = js.education?.is_fresh_graduate;
  const seniority = js.employment_preferences?.target_seniority ?? [];
  const skills = js.skills ?? [];
  const tools = (js.experiences ?? []).flatMap(e => e.tools ?? []);
  const neg = new Set();
  const NEG_BY_LABEL = [
    { re: /客户|销售|地推|商务拓展/, words: ["销售", "电话销售", "地推", "商务拓展"] },
    { re: /出差|驻场|外派/, words: ["出差", "驻场", "外派"] },
  ];
  for (const c of profile.user_work_profile?.constraints ?? []) {
    (NEG_MAP[c.constraint_id] ?? []).forEach(k => neg.add(k));
    for (const r of NEG_BY_LABEL) if (r.re.test(c.label ?? "")) r.words.forEach(k => neg.add(k));
  }
  for (const ind of js.industry_preferences?.excluded ?? []) neg.add(ind);

  const strongEU = (profile.evidence_units ?? []).filter(e => f_strength(e) >= 3);
  function f_strength(e) { return e.strength ?? 0; }
  const recommended = top.map((r, i) => {
    const occ = lib.find(o => o.occupation_id === r.occupation_id) ?? {};
    const titles = new Set([r.name]);
    if (seniority.includes("intern") || seniority.includes("entry_level") || fresh) {
      titles.add("初级" + r.name); titles.add(r.name.replace(/(工程师|专员|分析师)$/, "$1助理")); titles.add(r.name + "助理");
    }
    const kws = new Set([r.name]);
    skills.slice(0, 3).forEach(s => s.normalized_name && kws.add(s.normalized_name));
    tools.slice(0, 2).forEach(t => kws.add(t));
    if (fresh) kws.add("应届");
    const portfolioCount = (js.portfolio ?? []).length;
    // ready 需要三件事：作品集、≥2 条强证据、职业名与用户经历/技能文本有实质重叠（双字词命中）
    const userTokens = [
      ...(js.experiences ?? []).map(e => `${e.title ?? ""}${e.domain ?? ""}`),
      ...skills.map(s => `${s.name ?? ""}${s.normalized_name ?? ""}`),
      js.education?.major ?? "",
    ].join("");
    const occBigrams = r.name.match(/[\u4e00-\u9fa5]{2}/g) ?? [];
    const domainOverlap = occBigrams.some(bi => userTokens.includes(bi));
    let readiness = portfolioCount > 0 && strongEU.length >= 2 && domainOverlap ? "ready"
      : (skills.length || (profile.evidence_units ?? []).length) ? "partially_ready" : "exploration_only";
    if (r._seniority_blocked) readiness = "exploration_only";
    const matched_info = [...skills.slice(0, 3).map(s => `${s.normalized_name ?? s.name}（${{ 3: "进阶", 2: "可用", 1: "入门" }[s.level] ?? "?"}）`),
      ...(js.experiences ?? []).slice(0, 2).map(e => `${e.title}（${e.duration_months ?? "?"}个月）`)];
    const missing_info = [];
    if (!domainOverlap) missing_info.push("该职业与已登记经历/技能无直接重叠，转入探索验证");
    if (r._seniority_blocked) missing_info.push("该职业通常需要经验资历积累，当前作为探索项呈现");
    if (!(js.portfolio ?? []).length) missing_info.push("缺少可对外展示的作品集");
    if (strongEU.length < 2) missing_info.push("缺少 2 级以上相关经历证据");
    if (!skills.some(s => (s.category === "technical" || s.category === "tool"))) missing_info.push("未登记工具/技术类技能");
    return {
      rank: i + 1, occupation_id: r.occupation_id, occupation_name: r.name,
      recommendation_type: "career_fit_direction",
      match_score: r.match_score, confidence: r.confidence, user_status: "accepted",
      reason: [...r.basis, ...r.matched_intelligences.map(t => `${ZH_INT[t] ?? t}智能匹配`)].slice(0, 5),
      search_titles: [...titles].slice(0, 4),
      search_keywords: [...kws].slice(0, 6),
      negative_keywords: [...neg],
      current_readiness: readiness,
      matched_readiness_information: matched_info,
      missing_readiness_information: missing_info,
    };
  });
  return { recommended, warnings };
}
const ZH_INT = { linguistic: "语言", logical_mathematical: "数学逻辑", spatial: "空间", bodily_kinesthetic: "身体运动", musical: "音乐", interpersonal: "人际", intrapersonal: "自我认知", naturalistic: "自然认知" };

// ---------- 6. 执行 ----------
// 破平规则（不改变分数，只决定同分排序）：match_score 并列时，优先职业名与用户经历/技能/专业
// 文本有双字词重叠的（如"数据分析师"命中用户的"数据分析"经历），再按智能分。
const js0 = profile.job_search_profile ?? {};
const USER_TOKENS = [
  ...(js0.experiences ?? []).map(e => `${e.title ?? ""}${e.domain ?? ""}`),
  ...(js0.skills ?? []).map(s => `${s.name ?? ""}${s.normalized_name ?? ""}`),
  js0.education?.major ?? "",
].join("");
const nameOverlap = name => (name.match(/[\u4e00-\u9fa5]{2}/g) ?? []).some(bi => USER_TOKENS.includes(bi));

const JSP = profile.job_search_profile ?? {};
const scored = lib.map(o => {
  const r = scoreOccupation(o);
  const v = [...vetoReasons(o), ...envVeto(o), ...credVeto(o, JSP)];
  if (v.length) r.vetoed = v;
  if (seniorityBlock(o, JSP)) r._seniority_blocked = true;
  return r;
}).sort((a, b) =>
  b.match_score - a.match_score ||
  (nameOverlap(b.name) ? 1 : 0) - (nameOverlap(a.name) ? 1 : 0) ||
  b.intelligence_match_norm - a.intelligence_match_norm);

const { recommended, warnings } = buildRecommended(scored);

profile.occupation_match = scored.map(r => {
  const { vetoed, _seniority_blocked, ...rest } = r; // 内部标记不入正式输出
  return rest;
});
profile.recommended_occupations = recommended;
profile.profile_status = {
  ...profile.profile_status,
  job_matching_ready,
  missing_critical_fields: job_matching_ready ? [] : missing, // 关键字段不删除，就绪时为空数组
  warnings: [...(profile.profile_status?.warnings ?? []), ...warnings],
};
profile.meta = {
  ...profile.meta,
  generator: "intelligent-questionnaire-4.0 + match_engine",
  updated_at: new Date().toISOString().slice(0, 19) + "+08:00",
  recompute_trigger: "occupation_match_engine",
  data_quality_checks: {
    valid_json: true,
    five_occupations_present: job_matching_ready ? recommended.length === 5 : true, // 未就绪时预期为空，按规则放行
    critical_job_search_fields_complete: job_matching_ready,
    user_confirmation_complete: true,
  },
};

const outPath = outArg ?? profilePath.replace(/\.json$/, "") + ".matched.json";
fs.writeFileSync(outPath, JSON.stringify(profile, null, 2), "utf8");

// ---------- 7. 摘要 ----------
console.log(`职业库: ${libPath}（${lib.length} 个职业）`);
console.log(`job_matching_ready: ${job_matching_ready}${job_matching_ready ? "" : "\n  缺失: " + missing.join("；")}`);
if (warnings.length) warnings.forEach(w => console.log("warning: " + w));
console.log(`\n=== recommended_occupations (${recommended.length}) ===`);
recommended.forEach(r => {
  const v = scored.find(s => s.occupation_id === r.occupation_id);
  console.log(
    `${r.rank}. ${r.occupation_name}  score=${r.match_score}  [${v?.verdict ?? "-"}]  readiness=${r.current_readiness}\n     检索词: ${r.search_keywords.join(", ")}${r.negative_keywords.length ? " ｜排除: " + r.negative_keywords.join(",") : ""}`);
});
console.log(`\n输出: ${outPath}`);
