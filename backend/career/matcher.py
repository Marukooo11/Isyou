from __future__ import annotations

import json
import re
from copy import deepcopy
from datetime import datetime
from pathlib import Path
from typing import Any

from coach.errors import InvalidRequest


DIMS = ("E", "N", "C", "A", "O")
NEUTRAL_LO = 0.4
NEUTRAL_HI = 0.6

CREDENTIAL_LABELS = {
    "medical_license": "医师类执照",
    "law_license": "法律职业资格",
    "cpa_professional": "财会/金融专业资格",
    "other_professional": "执业资格（药师/兽医/助产等）",
    "teaching_cert": "教师资格",
    "driver_license": "驾驶执照",
}
CREDENTIAL_PATTERNS = {
    "medical_license": re.compile(r"医师|医生执照|执业医|护士执业|护师|药师"),
    "law_license": re.compile(r"法律职业资格|司法考试|律师"),
    "cpa_professional": re.compile(r"注册会计师|CPA|保荐|证券从业|基金从业|精算|会计从业", re.I),
    "other_professional": re.compile(r"执业药师|兽医|助产|心理治疗师"),
    "teaching_cert": re.compile(r"教师资格|教资"),
    "driver_license": re.compile(r"驾照|驾驶证"),
}
NEGATIVE_KEYWORDS = {
    "no_client_facing": ["销售", "电话销售", "地推", "商务拓展", "BD"],
    "no_heavy_travel": ["出差", "驻场", "外派"],
    "no_frequent_switching": ["多线程", "急速响应"],
}
NON_JOBS = {
    "职业学生（继续深造）",
    "家庭主妇/主夫",
    "全职父母",
    "独裁者",
    "职业杀手",
    "雇佣兵",
    "国际间谍",
    "赏金猎人",
    "环保主义者",
    "社会活动家",
}
INTELLIGENCE_LABELS = {
    "linguistic": "语言",
    "logical_mathematical": "数学逻辑",
    "spatial": "空间",
    "bodily_kinesthetic": "身体运动",
    "musical": "音乐",
    "interpersonal": "人际",
    "intrapersonal": "自我认知",
    "naturalistic": "自然认知",
}
LEVEL_LABELS = {
    3: "进阶",
    2: "可用",
    1: "入门",
    "advanced": "进阶",
    "working": "可用",
    "basic": "入门",
}


def _round3(value: float) -> float:
    return round(value + 0.0, 3)


def _unique(items: list[str]) -> list[str]:
    return list(dict.fromkeys(item for item in items if item))


def _bigrams(text: str) -> list[str]:
    return re.findall(r"[\u4e00-\u9fff]{2}", text or "")


class CareerMatcher:
    """Pure Python port of the questionnaire 4.0 occupation matcher.

    It accepts an already-scored ``output1.v1.0`` profile. Questionnaire
    presentation and natural-language answer extraction remain upstream.
    """

    def __init__(self, occupations_path: Path | None = None):
        path = occupations_path or Path(__file__).with_name("data") / "occupations.json"
        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as error:
            raise RuntimeError(f"无法读取职业库：{path}") from error
        occupations = payload.get("occupations")
        if not isinstance(occupations, list) or not occupations:
            raise RuntimeError("职业库缺少 occupations 数组。")
        self.library_meta = {key: value for key, value in payload.items() if key != "occupations"}
        self.occupations: list[dict[str, Any]] = occupations
        self._by_id = {item.get("occupation_id"): item for item in occupations}

    @property
    def occupation_count(self) -> int:
        return len(self.occupations)

    def get_occupation(self, occupation_id: str) -> dict[str, Any] | None:
        item = self._by_id.get(occupation_id)
        return deepcopy(item) if item else None

    def match_profile(
        self,
        source_profile: dict[str, Any],
        now: datetime | None = None,
    ) -> dict[str, Any]:
        self._validate_profile(source_profile)
        profile = deepcopy(source_profile)
        missing = self._evaluate_readiness(profile)
        ready = not missing

        user_tokens = self._user_tokens(profile)
        scored: list[dict[str, Any]] = []
        for occupation in self.occupations:
            result = self._score_occupation(profile, occupation)
            vetoes = [
                *self._client_vetoes(profile, occupation),
                *self._environment_vetoes(profile, occupation),
                *self._credential_vetoes(profile, occupation),
            ]
            result["veto_reasons"] = vetoes
            result["_seniority_blocked"] = self._seniority_blocked(profile, occupation)
            result["_name_overlap"] = any(part in user_tokens for part in _bigrams(occupation.get("name", "")))
            scored.append(result)

        scored.sort(
            key=lambda item: (
                -item["match_score"],
                -int(item["_name_overlap"]),
                -item["intelligence_match_norm"],
            )
        )
        recommended, warnings = self._build_recommendations(profile, scored, ready)

        profile["occupation_match"] = [
            {key: value for key, value in item.items() if not key.startswith("_")}
            for item in scored
        ]
        profile["recommended_occupations"] = recommended
        previous_status = profile.get("profile_status") or {}
        profile["profile_status"] = {
            **previous_status,
            "job_matching_ready": ready,
            "missing_critical_fields": [] if ready else missing,
            "warnings": _unique([*(previous_status.get("warnings") or []), *warnings]),
        }
        timestamp = (now or datetime.now().astimezone()).isoformat(timespec="seconds")
        previous_meta = profile.get("meta") or {}
        previous_checks = previous_meta.get("data_quality_checks") or {}
        profile["meta"] = {
            **previous_meta,
            "generator": "intelligent-questionnaire-4.0 + career-matcher-py",
            "updated_at": timestamp,
            "recompute_trigger": "occupation_match_engine",
            "data_quality_checks": {
                **previous_checks,
                "valid_json": True,
                "five_occupations_present": len(recommended) == 5 if ready else True,
                "critical_job_search_fields_complete": ready,
            },
        }
        return profile

    def _validate_profile(self, profile: dict[str, Any]) -> None:
        if not isinstance(profile, dict):
            raise InvalidRequest("profile 必须是 JSON 对象。")
        if profile.get("schema_version") != "output1.v1.0":
            raise InvalidRequest("profile.schema_version 必须是 output1.v1.0。")
        for field in ("big5_scores", "intelligence_profile", "job_search_profile"):
            value = profile.get(field)
            if value is not None and not isinstance(value, dict):
                raise InvalidRequest(f"profile.{field} 必须是 JSON 对象。")

    def _user_stance(self, dim: str, score: dict[str, Any] | None) -> str:
        if not score or not isinstance(score.get("norm"), (int, float)):
            return "excluded"
        reliability = str(score.get("reliability") or "ok")
        if reliability == "low_confidence" or reliability.startswith("inconsistent"):
            return "excluded"
        norm = 1 - score["norm"] if dim == "N" else score["norm"]
        if norm >= NEUTRAL_HI:
            return "high"
        if norm <= NEUTRAL_LO:
            return "low"
        return "neutral"

    def _flipped_norm(self, dim: str, score: dict[str, Any]) -> float:
        return 1 - score["norm"] if dim == "N" else score["norm"]

    def _score_occupation(
        self,
        profile: dict[str, Any],
        occupation: dict[str, Any],
    ) -> dict[str, Any]:
        matched: dict[str, str] = {}
        conflicts: dict[str, str] = {}
        skipped: list[dict[str, str]] = []
        total = 0.0
        weight_sum = 0.0
        valid = 0
        scores = profile.get("big5_scores") or {}
        occupation_states = occupation.get("big5_state") or {}

        for dim in DIMS:
            score = scores.get(dim)
            stance = self._user_stance(dim, score)
            occupation_stance = occupation_states.get(dim, "none")
            if stance in {"neutral", "excluded"}:
                if stance == "neutral":
                    reason = "user_neutral"
                elif score and score.get("reliability") == "low_confidence":
                    reason = "user_excluded_low_confidence"
                else:
                    reason = "user_excluded_inconsistent_or_missing"
                skipped.append({"dim": dim, "reason": reason})
                continue
            if occupation_stance in {"both", "none"}:
                skipped.append(
                    {
                        "dim": dim,
                        "reason": "occupation_both" if occupation_stance == "both" else "occupation_none",
                    }
                )
                continue
            valid += 1
            weight = max(0.2, abs(2 * self._flipped_norm(dim, score) - 1))
            if stance == occupation_stance:
                matched[dim] = stance
                total += weight
            else:
                conflicts[dim] = stance
                total -= weight
            weight_sum += weight

        big5_match = total / weight_sum if valid >= 2 and weight_sum > 0 else None
        intelligence_score = 0.0
        profile_intelligence = profile.get("intelligence_profile") or {}
        for index, tag in enumerate(occupation.get("intelligence_tags") or []):
            verdict = (profile_intelligence.get(tag) or {}).get("verdict")
            if verdict == "strength":
                intelligence_score += 2 + (0.5 if index == 0 else 0)
            elif verdict == "potential":
                intelligence_score += 1
        intelligence_norm = min(1.0, intelligence_score / 7)
        big5_norm = None if big5_match is None else (big5_match + 1) / 2
        match_score = intelligence_norm if big5_norm is None else 0.5 * big5_norm + 0.5 * intelligence_norm
        demotions = self._environment_demotions(profile, occupation)
        verdict = "recommend" if match_score >= 0.70 else "worth_exploring" if match_score >= 0.45 else "hold"
        for _ in demotions:
            verdict = "worth_exploring" if verdict == "recommend" else "hold"
        basis = [f"{dim}立场一致({'高' if stance == 'high' else '低'})" for dim, stance in matched.items()]
        basis.extend(f"{dim}立场冲突" for dim in conflicts)
        basis.extend(demotions)
        matched_intelligences = [
            tag
            for tag in occupation.get("intelligence_tags") or []
            if (profile_intelligence.get(tag) or {}).get("verdict") in {"strength", "potential"}
        ]
        return {
            "occupation_id": occupation.get("occupation_id"),
            "name": occupation.get("name"),
            "match_score": _round3(match_score),
            "verdict": verdict,
            "big5_match": None if big5_match is None else _round3(big5_match),
            "intelligence_match_norm": _round3(intelligence_norm),
            "matched_dimensions": matched,
            "conflict_dimensions": conflicts,
            "skipped_dimensions": skipped,
            "matched_intelligences": matched_intelligences,
            "env_demotions": demotions,
            "confidence": "intelligence_only" if big5_norm is None else "both_tracks",
            "basis": basis,
            "user_status": "accepted",
        }

    def _evaluate_readiness(self, profile: dict[str, Any]) -> list[str]:
        missing: list[str] = []
        job = profile.get("job_search_profile") or {}
        if (profile.get("profile_status") or {}).get("completion_level") == "psychological_only":
            missing.append("job_search_profile（B7=暂时不找，补充页未作答）")
        if not (profile.get("consent") or {}).get("can_use_for_job_matching"):
            missing.append("consent.can_use_for_job_matching")
        if not (job.get("education") or {}).get("highest_level"):
            missing.append("job_search_profile.education.highest_level")
        if not (job.get("location_preferences") or {}).get("current_city"):
            missing.append("job_search_profile.location_preferences.current_city")
        if not (job.get("employment_preferences") or {}).get("target_seniority"):
            missing.append("job_search_profile.employment_preferences.target_seniority")
        if not (job.get("employment_preferences") or {}).get("employment_types"):
            missing.append("job_search_profile.employment_preferences.employment_types")
        if (job.get("compensation") or {}).get("minimum_amount") is None:
            missing.append("job_search_profile.compensation.minimum_amount")
        if not job.get("experiences") and not job.get("skills"):
            strong_life_evidence = any(
                (unit.get("strength") or 0) >= 2 for unit in profile.get("evidence_units") or []
            )
            if not strong_life_evidence:
                missing.append("job_search_profile.experiences[]/skills[]（且无 2 级以上生活证据）")
        return missing

    def _constraints(self, profile: dict[str, Any]) -> list[dict[str, Any]]:
        return (profile.get("user_work_profile") or {}).get("constraints") or []

    def _environment_demotions(self, profile: dict[str, Any], occupation: dict[str, Any]) -> list[str]:
        notes: list[str] = []
        constraints = self._constraints(profile)
        environment = occupation.get("environment_tags") or {}
        ids = {item.get("constraint_id") for item in constraints}
        if (
            "quiet_env" in ids or any(re.search(r"安静|噪音", item.get("label") or "") for item in constraints)
        ) and environment.get("noise_level") == "high":
            notes.append("环境冲突：该职业典型环境噪音高")
        if "no_frequent_switching" in ids and environment.get("interruption_frequency") == "high":
            notes.append("环境冲突：该职业打断频繁")
        remote_is_hard = any(
            "远程" in (item.get("label") or "")
            and (item.get("constraint_level") == "hard" or item.get("negotiability") == "non_negotiable")
            for item in constraints
        )
        if remote_is_hard and environment.get("remote_feasibility") == "low":
            notes.append("环境冲突：该职业远程可行性低")
        return notes

    def _client_vetoes(self, profile: dict[str, Any], occupation: dict[str, Any]) -> list[str]:
        reasons: list[str] = []
        for constraint in self._constraints(profile):
            if constraint.get("constraint_level") != "hard":
                continue
            label = constraint.get("label") or ""
            client_facing = constraint.get("constraint_id") == "no_client_facing" or re.search(
                r"客户|销售|地推", label
            )
            if client_facing and (occupation.get("intelligence_tags") or [None])[0] == "interpersonal":
                reasons.append(f'人际密集型职业（人际智能为首要标签）与硬约束"{label}"冲突')
        return reasons

    def _environment_vetoes(self, profile: dict[str, Any], occupation: dict[str, Any]) -> list[str]:
        ids = {item.get("constraint_id") for item in self._constraints(profile)}
        if "no_heavy_travel" in ids and (occupation.get("environment_tags") or {}).get("travel_level") == "frequent":
            return ["硬约束：不接受频繁出差，而该职业典型出差频繁"]
        return []

    def _credential_vetoes(self, profile: dict[str, Any], occupation: dict[str, Any]) -> list[str]:
        required = occupation.get("credential_required")
        if required in {None, "none", "unknown", "vocational_cert"}:
            return []
        pattern = CREDENTIAL_PATTERNS.get(required)
        if pattern is None:
            return []
        eligibility = (profile.get("job_search_profile") or {}).get("eligibility") or {}
        held = "；".join([*(eligibility.get("certifications") or []), *(eligibility.get("licenses") or [])])
        if pattern.search(held):
            return []
        return [f"资格硬否决：需要{CREDENTIAL_LABELS.get(required, required)}，画像未确认持有"]

    def _seniority_blocked(self, profile: dict[str, Any], occupation: dict[str, Any]) -> bool:
        if occupation.get("typical_seniority") != "experienced_required":
            return False
        job = profile.get("job_search_profile") or {}
        stage = (job.get("employment_preferences") or {}).get("career_stage")
        summary = job.get("experience_summary") or {}
        months = summary.get("relevant_experience_months")
        if months is None:
            months = summary.get("formal_work_months") or 0
        return stage in {"fresh_graduate", "entry_level"} or months < 12

    def _user_tokens(self, profile: dict[str, Any]) -> str:
        job = profile.get("job_search_profile") or {}
        experiences = "".join(
            f"{item.get('title') or ''}{item.get('domain') or ''}" for item in job.get("experiences") or []
        )
        skills = "".join(
            f"{item.get('name') or ''}{item.get('normalized_name') or ''}" for item in job.get("skills") or []
        )
        return f"{experiences}{skills}{(job.get('education') or {}).get('major') or ''}"

    def _build_recommendations(
        self,
        profile: dict[str, Any],
        scored: list[dict[str, Any]],
        ready: bool,
    ) -> tuple[list[dict[str, Any]], list[str]]:
        warnings: list[str] = []
        if not ready:
            return [], warnings

        veto_count = sum(bool(item["veto_reasons"]) for item in scored)
        seniority_count = sum(bool(item["_seniority_blocked"]) for item in scored)
        if veto_count:
            warnings.append(f"硬否决 {veto_count} 个职业（客户面向/频繁出差/资格不符）")
        if seniority_count:
            warnings.append(f'{seniority_count} 个"需经验资历"职业对入门用户暂缓（职级过滤）')

        def allowed(item: dict[str, Any]) -> bool:
            return not item["veto_reasons"] and item["name"] not in NON_JOBS

        pool = [
            item
            for item in scored
            if allowed(item) and not item["_seniority_blocked"] and item["verdict"] != "hold"
        ]
        if len(pool) < 5:
            pool = [item for item in scored if allowed(item) and not item["_seniority_blocked"]]
            warnings.append("候选不足 5，已放宽 verdict 门槛至 hold")
        if len(pool) < 5:
            pool = [item for item in scored if allowed(item)]
            warnings.append("候选仍不足 5，已松绑职级过滤（含需经验资历职业，就绪度标 exploration_only）")

        job = profile.get("job_search_profile") or {}
        education = job.get("education") or {}
        employment = job.get("employment_preferences") or {}
        fresh = bool(education.get("is_fresh_graduate"))
        target_seniority = employment.get("target_seniority") or []
        skills = job.get("skills") or []
        tools = [tool for experience in job.get("experiences") or [] for tool in experience.get("tools") or []]
        negative = self._negative_keywords(profile)
        strong_evidence = [
            unit for unit in profile.get("evidence_units") or [] if (unit.get("strength") or 0) >= 3
        ]
        user_tokens = self._user_tokens(profile)
        portfolio_count = len(job.get("portfolio") or [])

        recommendations: list[dict[str, Any]] = []
        for rank, result in enumerate(pool[:5], start=1):
            name = result["name"]
            titles = [name]
            if fresh or "intern" in target_seniority or "entry_level" in target_seniority:
                titles.extend(
                    [
                        f"初级{name}",
                        re.sub(r"(工程师|专员|分析师)$", r"\1助理", name),
                        f"{name}助理",
                    ]
                )
            keywords = [name]
            keywords.extend(item.get("normalized_name") for item in skills[:3])
            keywords.extend(tools[:2])
            if fresh:
                keywords.append("应届")
            overlap = any(part in user_tokens for part in _bigrams(name))
            if portfolio_count and len(strong_evidence) >= 2 and overlap:
                readiness = "ready"
            elif skills or profile.get("evidence_units"):
                readiness = "partially_ready"
            else:
                readiness = "exploration_only"
            if result["_seniority_blocked"]:
                readiness = "exploration_only"

            matched_information = [
                f"{item.get('normalized_name') or item.get('name')}（{LEVEL_LABELS.get(item.get('level'), '?')}）"
                for item in skills[:3]
            ]
            matched_information.extend(
                f"{item.get('title')}（{item.get('duration_months', '?')}个月）"
                for item in (job.get("experiences") or [])[:2]
            )
            missing_information: list[str] = []
            if not overlap:
                missing_information.append("该职业与已登记经历/技能无直接重叠，转入探索验证")
            if result["_seniority_blocked"]:
                missing_information.append("该职业通常需要经验资历积累，当前作为探索项呈现")
            if not portfolio_count:
                missing_information.append("缺少可对外展示的作品集")
            if len(strong_evidence) < 2:
                missing_information.append("缺少两条 3 级相关经历证据")
            if not any(item.get("category") in {"technical", "tool"} for item in skills):
                missing_information.append("未登记工具/技术类技能")
            reasons = [*result["basis"]]
            reasons.extend(
                f"{INTELLIGENCE_LABELS.get(tag, tag)}智能匹配"
                for tag in result["matched_intelligences"]
            )
            recommendations.append(
                {
                    "rank": rank,
                    "occupation_id": result["occupation_id"],
                    "occupation_name": name,
                    "recommendation_type": "career_fit_direction",
                    "match_score": result["match_score"],
                    "confidence": result["confidence"],
                    "user_status": "accepted",
                    "reason": reasons[:5],
                    "search_titles": _unique(titles)[:4],
                    "search_keywords": _unique(keywords)[:6],
                    "negative_keywords": negative,
                    "current_readiness": readiness,
                    "matched_readiness_information": matched_information,
                    "missing_readiness_information": missing_information,
                }
            )
        return recommendations, warnings

    def _negative_keywords(self, profile: dict[str, Any]) -> list[str]:
        keywords: list[str] = []
        for constraint in self._constraints(profile):
            keywords.extend(NEGATIVE_KEYWORDS.get(constraint.get("constraint_id"), []))
            label = constraint.get("label") or ""
            if re.search(r"客户|销售|地推|商务拓展", label):
                keywords.extend(["销售", "电话销售", "地推", "商务拓展"])
            if re.search(r"出差|驻场|外派", label):
                keywords.extend(["出差", "驻场", "外派"])
        excluded = ((profile.get("job_search_profile") or {}).get("industry_preferences") or {}).get("excluded") or []
        keywords.extend(excluded)
        return _unique(keywords)
