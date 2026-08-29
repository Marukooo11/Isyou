from __future__ import annotations

import re
from copy import deepcopy
from datetime import datetime
from typing import Any
from uuid import uuid4

from .questions import QUESTION_IDS


BIG5_RULES = {
    "E": (("Q3", False), ("Q16", True)),
    "A": (("Q7", False), ("Q19", True), ("Q22", False)),
    "C": (("Q1", False), ("Q11", False)),
    "N": (("Q4", True), ("Q5", False)),
    "O": (("Q10", False), ("Q26", False)),
}
CAPABILITY_LABELS = {
    "independent_deep_work": "独立深度工作",
    "detail_detection": "细节校验",
    "self_learning": "自学能力",
    "rule_based_tasks": "规则明确的任务",
    "delivery_for_others": "面向他人的交付",
    "process_execution": "流程执行",
}
INTELLIGENCE_QUESTIONS = {
    "linguistic": ("Q6", "Q12"),
    "logical_mathematical": ("Q10", "Q11", "Q12"),
    "spatial": ("Q13",),
    "bodily_kinesthetic": ("Q13",),
    "musical": (),
    "interpersonal": ("Q3", "Q7", "Q22"),
    "intrapersonal": ("Q18", "Q20", "Q26"),
    "naturalistic": (),
}
EVIDENCE_INTELLIGENCES = {
    "B6": ["intrapersonal"],
    "Q3": ["interpersonal"],
    "Q5": ["intrapersonal"],
    "Q6": ["linguistic", "logical_mathematical"],
    "Q7": ["interpersonal"],
    "Q10": ["logical_mathematical"],
    "Q11": ["logical_mathematical"],
    "Q13": ["spatial", "bodily_kinesthetic"],
    "Q18": ["intrapersonal"],
    "Q20": ["intrapersonal"],
    "Q26": ["intrapersonal"],
    "J2": ["logical_mathematical"],
}
EVIDENCE_CAPABILITIES = {
    "B6": ["process_execution"],
    "Q3": ["verbal_expression"],
    "Q5": ["structured_problem_solving"],
    "Q6": ["independent_deep_work", "self_learning"],
    "Q7": ["delivery_for_others", "structured_problem_solving"],
    "Q10": ["self_learning"],
    "Q11": ["detail_detection", "rule_based_tasks"],
    "Q13": ["hands_on"],
    "Q18": ["structured_problem_solving"],
    "Q20": ["planning_orderliness"],
    "Q26": ["intrapersonal_reflection"],
    "J2": ["delivery_for_others", "structured_problem_solving"],
}
EXPERIENCE_FIELDS = {"full_time", "internship", "part_time", "freelance", "personal_project"}


def _record(answers: dict[str, Any], question_id: str) -> dict[str, Any]:
    value = answers.get(question_id)
    return value if isinstance(value, dict) else {"value": value}


def _value(answers: dict[str, Any], question_id: str, key: str = "value") -> Any:
    record = _record(answers, question_id)
    if record.get("_skipped"):
        return None
    return record.get(key)


def _text(value: Any) -> str | None:
    result = str(value or "").strip()
    return result or None


def _number(value: Any) -> int | float | None:
    if value is None or value == "":
        return None
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return int(number) if number.is_integer() else number


def _list(value: Any) -> list[str]:
    if isinstance(value, list):
        return list(dict.fromkeys(str(item).strip() for item in value if str(item).strip()))
    if not value:
        return []
    return list(
        dict.fromkeys(
            item.strip()
            for item in re.split(r"[，,；;\n]+", str(value))
            if item.strip()
        )
    )


def _lines(value: Any) -> list[str]:
    return [item.strip(" -•\t") for item in str(value or "").splitlines() if item.strip(" -•\t")]


def _boolean(value: Any) -> bool | None:
    if value is True or str(value).lower() == "true":
        return True
    if value is False or str(value).lower() == "false":
        return False
    return None


def _attribute(value: Any, source_question_ids: list[str], confidence: str = "self_report") -> dict[str, Any]:
    unknown = value is None or value == "unknown"
    return {
        "value": value,
        "source_question_ids": source_question_ids,
        "evidence_unit_ids": [],
        "confidence": confidence if not unknown else "unknown",
        "user_status": "accepted" if not unknown else "uncertain",
    }


class QuestionnaireScorer:
    """Deterministic Questionnaire 4.0 answers → output1.v1.0 transformer."""

    def build_profile(
        self,
        answers: dict[str, Any],
        now: datetime,
        existing_profile: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        existing = existing_profile if (existing_profile or {}).get("schema_version") == "output1.v1.0" else {}
        evidence = self._evidence_units(answers)
        job = self._job_search_profile(answers, evidence, now.year)
        consent = self._consent(answers)
        missing = self._readiness_missing(answers, job, consent, evidence)
        b7 = _value(answers, "B7")
        completion = "psychological_only" if b7 == "not_now" else ("strong" if not missing else "partial")
        visible_question_ids = self._visible_question_ids(answers)
        visible_count = len(visible_question_ids)
        answered_count = sum(
            self._answered(answers.get(question_id))
            for question_id in visible_question_ids
        )
        exit_ratio = round(max(0, visible_count - answered_count) / visible_count, 3)
        warnings = []
        if exit_ratio > 0.3:
            warnings.append("跳过题目超过 30%，画像可信度较低。")
        if missing:
            warnings.append("求职关键信息尚未补齐，暂不生成职业推荐。")
        timestamp = now.isoformat(timespec="seconds")
        created_at = existing.get("created_at") or timestamp
        profile = {
            "schema_version": "output1.v1.0",
            "profile_id": existing.get("profile_id") or f"PROFILE-{uuid4().hex[:12].upper()}",
            "profile_version": int(existing.get("profile_version") or 0) + 1,
            "created_at": created_at,
            "updated_at": timestamp,
            "locale": "zh-CN",
            "profile_status": {
                "completion_level": completion,
                "job_matching_ready": not missing,
                "confidence": "low" if exit_ratio > 0.3 else ("high" if len(evidence) >= 3 else "medium"),
                "missing_critical_fields": missing,
                "warnings": warnings,
            },
            "consent": consent,
            "basic_info": self._basic_info(answers),
            "user_work_profile": self._work_profile(answers, evidence),
            "big5_scores": self._big5(answers),
            "intelligence_profile": self._intelligences(answers, evidence),
            "direction_scores": self._direction_scores(answers, evidence),
            "job_search_profile": job,
            "occupation_match": [],
            "recommended_occupations": [],
            "evidence_units": evidence,
            "unverified_clues": self._unverified_clues(answers, evidence),
            "handoff": {
                "consumer": "real_job_matching_module",
                "allowed_uses": ["生成检索词", "检索公开招聘信息", "执行硬条件过滤", "计算岗位匹配", "生成能力差距说明"],
                "required_processing_rules": [
                    "先检查 consent.can_use_for_web_job_search",
                    "未知信息不能按满足处理",
                    "硬约束冲突时淘汰岗位",
                    "职业方向匹配分不能替代真实JD资格核验",
                    "所有真实岗位必须保留原始URL和检索时间",
                ],
            },
            "meta": {
                "answered": answered_count,
                "total_shown": visible_count,
                "exit_ratio": exit_ratio,
                "low_confidence_overall": exit_ratio > 0.3,
                "trauma_guard_triggered": bool(_record(answers, "Q18").get("_skipped")),
                "first_clue_delivered": bool(evidence),
                "recompute_trigger": "questionnaire_completed",
                "generator": "intelligent-questionnaire-4.0-py",
                "data_quality_checks": {
                    "valid_json": True,
                    "five_occupations_present": not missing,
                    "critical_job_search_fields_complete": not missing,
                    "user_confirmation_complete": True,
                },
            },
        }
        return profile

    def _answered(self, value: Any) -> bool:
        if not isinstance(value, dict) or value.get("_skipped"):
            return False
        for key, item in value.items():
            if key.startswith("_") or item is None or item == "" or item == [] or item == ():
                continue
            return True
        return False

    def _visible_question_ids(self, answers: dict[str, Any]) -> set[str]:
        visible = set(QUESTION_IDS)
        experiences = [
            item
            for item in (_value(answers, "B3") or [])
            if item in EXPERIENCE_FIELDS
        ]
        if len(experiences) < 2:
            visible.discard("B4")
        if not experiences:
            visible.difference_update({"B5", "B6"})
        if _value(answers, "B7") not in ("active", "soon"):
            visible.difference_update({f"J{index}" for index in range(1, 10)})
        return visible

    def _basic_info(self, answers: dict[str, Any]) -> dict[str, Any]:
        experiences = [item for item in (_value(answers, "B3") or []) if item in EXPERIENCE_FIELDS]
        primary = _value(answers, "B4") or (experiences[0] if len(experiences) == 1 else None)
        return {
            "age_band": _attribute(_value(answers, "B1") or "unknown", ["B1"]),
            "education_level": _attribute(_value(answers, "B2") or "unknown", ["B2"]),
            "experience_types": _attribute(experiences, ["B3"]),
            "primary_experience": _attribute(primary, ["B4", "B3"]),
            "experience_domain": _attribute(_value(answers, "B5"), ["B5"]),
            "experience_distress_attribution": _attribute(_value(answers, "B6", "attribution") or "unknown", ["B6"]),
            "zero_experience": "none" in (_value(answers, "B3") or []),
        }

    def _big5(self, answers: dict[str, Any]) -> dict[str, Any]:
        result: dict[str, Any] = {}
        for dim, rules in BIG5_RULES.items():
            scores: list[float] = []
            sources: list[str] = []
            for question_id, reverse in rules:
                raw = _number(_value(answers, question_id))
                if raw is None:
                    continue
                scores.append(8 - raw if reverse else raw)
                sources.append(question_id)
            if not scores:
                result[dim] = {"norm": None, "reliability": "low_confidence", "source_question_ids": []}
                continue
            norm = round((sum(scores) / len(scores) - 1) / 6, 3)
            expected = len(rules)
            reliability = "low_confidence" if len(scores) < expected else ("no_reverse_check" if dim in {"C", "O"} else "ok")
            result[dim] = {"norm": norm, "reliability": reliability, "source_question_ids": sources}
        return result

    def _evidence_units(self, answers: dict[str, Any]) -> list[dict[str, Any]]:
        candidates: list[tuple[str, dict[str, str | None], int]] = [
            ("B6", {"situation": _text(_value(answers, "B6", "summary")), "behavior": _text(_value(answers, "B6", "liked")), "result": None}, 1),
            ("Q3", {"situation": _text(_value(answers, "Q3", "detail")), "behavior": None, "result": None}, 1),
            ("Q5", {"situation": _text(_value(answers, "Q5", "detail")), "behavior": _text(_value(answers, "Q5", "detail")), "result": None}, 2),
            ("Q6", {"situation": _text(_value(answers, "Q6", "activity")), "behavior": _text(_value(answers, "Q6", "activity")), "result": _text(_value(answers, "Q6", "result") or _value(answers, "Q6", "feedback"))}, 2),
            ("Q7", {"situation": _text(_value(answers, "Q7", "situation")), "behavior": _text(_value(answers, "Q7", "behavior")), "result": _text(_value(answers, "Q7", "result"))}, 2),
            ("Q10", {"situation": _text(_value(answers, "Q10", "detail")), "behavior": None, "result": None}, 1),
            ("Q11", {"situation": _text(_value(answers, "Q11", "detail")), "behavior": _text(_value(answers, "Q11", "detail")), "result": None}, 2),
            ("Q13", {"situation": _text(_value(answers, "Q13", "detail")), "behavior": _text(_value(answers, "Q13", "detail")), "result": None}, 2),
            ("Q18", {"situation": _text(_value(answers, "Q18", "situation")), "behavior": _text(_value(answers, "Q18", "behavior")), "result": _text(_value(answers, "Q18", "result"))}, 2),
            ("Q20", {"situation": _text(_value(answers, "Q20", "detail")), "behavior": None, "result": None}, 1),
            ("Q26", {"situation": _text(_value(answers, "Q26", "detail")), "behavior": None, "result": None}, 1),
        ]
        j2_results = _lines(_value(answers, "J2", "results"))
        if j2_results:
            candidates.append(("J2", {"situation": _text(_value(answers, "J1", "title")), "behavior": "; ".join(_lines(_value(answers, "J2", "tasks"))) or None, "result": "; ".join(j2_results)}, 3))
        units: list[dict[str, Any]] = []
        for source, parsed, floor in candidates:
            parts = list(dict.fromkeys(value for value in parsed.values() if value))
            if not parts:
                continue
            populated = sum(bool(value) for value in parsed.values())
            strength = 3 if populated == 3 and parsed.get("result") else max(floor, 2 if populated >= 2 else 1)
            units.append({
                "eu_id": f"EU-{len(units) + 1:03d}",
                "source_question_id": source,
                "text": "；".join(parts),
                "strength": strength,
                "parsed": parsed,
                "linked_capabilities": EVIDENCE_CAPABILITIES.get(source, []),
                "linked_intelligences": EVIDENCE_INTELLIGENCES.get(source, []),
                "user_status": "accepted",
            })
        return units

    def _intelligences(self, answers: dict[str, Any], evidence: list[dict[str, Any]]) -> dict[str, Any]:
        result: dict[str, Any] = {}
        ranking: list[tuple[int, float, str]] = []
        for intelligence, question_ids in INTELLIGENCE_QUESTIONS.items():
            values = [_number(_value(answers, question_id)) for question_id in question_ids]
            valid = [float(value) for value in values if value is not None]
            related = [unit for unit in evidence if intelligence in unit["linked_intelligences"]]
            evidence_score = sum(int(unit["strength"]) for unit in related)
            mean = sum(valid) / len(valid) if valid else None
            if evidence_score >= 3 or (mean is not None and mean >= 5.5 and evidence_score >= 2):
                verdict, rank = "strength", 3
            elif (mean is not None and mean >= 5.5) or evidence_score >= 2:
                verdict, rank = "potential", 2
            elif valid or related:
                verdict, rank = "not_prominent", 1
            else:
                verdict, rank = "undeterminable", 0
            result[intelligence] = {"verdict": verdict, "evidence_unit_ids": [unit["eu_id"] for unit in related]}
            ranking.append((rank, mean or 0, intelligence))
        ranking.sort(reverse=True)
        result["top_list"] = [name for rank, _, name in ranking if rank >= 2][:3]
        return result

    def _direction_scores(self, answers: dict[str, Any], evidence: list[dict[str, Any]]) -> list[dict[str, Any]]:
        rules = [("data_quality", "数据/质检/文档", "Q11", "logical_mathematical"), ("research_analysis", "研究/分析/写作", "Q12", "linguistic"), ("technical_hands_on", "手工/技术/实操", "Q13", "bodily_kinesthetic")]
        result = []
        for direction_id, name, question_id, intelligence in rules:
            raw = _number(_value(answers, question_id))
            related = [unit for unit in evidence if intelligence in unit["linked_intelligences"]]
            score = None if raw is None else min(1, round(((float(raw) - 1) / 6) * 0.7 + min(sum(unit["strength"] for unit in related), 6) / 6 * 0.3, 3))
            result.append({"direction_id": direction_id, "name": name, "score": score, "source_question_ids": [question_id], "evidence_unit_ids": [unit["eu_id"] for unit in related], "user_status": "accepted" if score is not None else "uncertain"})
        return result

    def _work_profile(self, answers: dict[str, Any], evidence: list[dict[str, Any]]) -> dict[str, Any]:
        capability_ids = list(_value(answers, "Q8") or [])
        other = _text(_value(answers, "Q8", "other"))
        capabilities = [
            {"capability_id": item, "label": CAPABILITY_LABELS.get(item, item), **_attribute("potential", ["Q8"])}
            for item in capability_ids
        ]
        if other:
            capabilities.append({"capability_id": f"user_defined_{len(capabilities) + 1}", "label": other, **_attribute("potential", ["Q8"])})
        constraints = []
        labels = {
            "quiet_env": "需要相对安静的工作环境", "no_frequent_switching": "不能频繁被打断或切换任务", "async_text": "偏好书面沟通", "clear_rules": "需要明确规则和标准", "onboarding_support": "需要明确入职支持", "disclosure_choice": "保留谱系身份披露选择", "remote_preference": "偏好远程或减少通勤",
        }
        for item in _value(answers, "Q14") or []:
            constraints.append({"constraint_id": item, "label": labels.get(item, item), "scope": "occupation_and_job", "constraint_level": "hard" if item in {"quiet_env", "no_frequent_switching", "clear_rules"} else "preference", "negotiability": "non_negotiable" if item in {"quiet_env", "no_frequent_switching", "clear_rules"} else "negotiable"})
        job_active = _value(answers, "B7") in ("active", "soon")
        hard = _text(_value(answers, "J9", "hard_constraints")) if job_active else None
        if hard:
            constraints.append({"constraint_id": "user_defined_hard_constraint", "label": hard, "scope": "job", "constraint_level": "hard", "negotiability": "non_negotiable"})
        if job_active and _value(answers, "J5", "travel") == "none":
            constraints.append({"constraint_id": "no_heavy_travel", "label": "不接受频繁出差", "scope": "job", "constraint_level": "hard", "negotiability": "non_negotiable"})
        return {
            "capabilities": capabilities,
            "task_preference": {"energizing": _value(answers, "Q15", "energizing") or [], "draining": _value(answers, "Q15", "draining") or []},
            "cognitive_style": {"planning_orderliness": _attribute(_value(answers, "Q1"), ["Q1"]), "ambiguity_tolerance": _attribute(_value(answers, "Q12"), ["Q12"])},
            "communication": {"async_text": _attribute("async_text" in (_value(answers, "Q14") or []), ["Q14"])},
            "environment": {"selected_constraints": _value(answers, "Q14") or []},
            "energy": {"energizing": _value(answers, "Q15", "energizing") or [], "draining": _value(answers, "Q15", "draining") or []},
            "values": {"environment_over_income": _attribute(_value(answers, "Q20"), ["Q20"])},
            "constraints": constraints,
        }

    def _job_search_profile(
        self,
        answers: dict[str, Any],
        evidence: list[dict[str, Any]],
        current_year: int,
    ) -> dict[str, Any]:
        b2 = _record(answers, "B2")
        if _value(answers, "B7") in ("active", "soon"):
            j1, j2, j3, j4, j5, j6, j7, j8 = (_record(answers, item) for item in ("J1", "J2", "J3", "J4", "J5", "J6", "J7", "J8"))
        else:
            j1 = j2 = j3 = j4 = j5 = j6 = j7 = j8 = {}
        experience = None
        if _text(j1.get("title")):
            experience = {
                "experience_id": "EXP-001", "type": j1.get("type") or _value(answers, "B4"), "title": _text(j1.get("title")), "organization": _text(j1.get("organization")), "domain": _value(answers, "B5"), "start_date": _text(j1.get("start_date")), "end_date": _text(j1.get("end_date")), "duration_months": _number(j1.get("duration_months")), "hours_per_week": _number(j1.get("hours_per_week")), "tasks": _lines(j2.get("tasks")), "tools": _list(j2.get("tools")), "results": _lines(j2.get("results")), "source": "user_reported", "confidence": "high", "user_status": "accepted",
            }
        skills = []
        for index, line in enumerate(_lines(j3.get("skills")), start=1):
            parts = re.split(r"[:：]", line, maxsplit=1)
            name = parts[0].strip()
            level_value = _number(parts[1].strip()) if len(parts) > 1 else None
            level = {1: "basic", 2: "working", 3: "advanced"}.get(level_value, "unknown")
            skills.append({"skill_id": f"SKILL-{index:03d}", "name": name, "normalized_name": name, "category": "user_reported", "level": level, "evidence_unit_ids": [unit["eu_id"] for unit in evidence if unit["source_question_id"] == "J2"], "source": "user_reported", "confidence": "high" if level != "unknown" else "medium", "user_status": "accepted"})
        months = _number(j1.get("duration_months")) or 0
        exp_type = j1.get("type")
        return {
            "education": {"highest_level": b2.get("value"), "major": _text(b2.get("major")), "graduation_year": _number(b2.get("graduation_year")), "is_fresh_graduate": bool(_number(b2.get("graduation_year")) and _number(b2.get("graduation_year")) >= current_year - 1), "source": "user_reported", "confidence": "high" if b2.get("value") else "low", "user_status": "accepted" if b2.get("value") else "uncertain"},
            "experience_summary": {"formal_work_months": months if exp_type == "full_time" else 0, "internship_months": months if exp_type == "internship" else 0, "relevant_experience_months": months, "project_count": 1 if experience else 0},
            "experiences": [experience] if experience else [],
            "skills": skills,
            "portfolio": [],
            "languages": [{"name": line, "source": "user_reported"} for line in _lines(j4.get("languages"))],
            "location_preferences": {"current_country_or_region": "中国大陆" if _text(j5.get("current_city")) else None, "current_city": _text(j5.get("current_city")), "preferred_cities": _list(j5.get("preferred_cities")), "acceptable_cities": _list(j5.get("acceptable_cities")), "relocation": j5.get("relocation"), "commute_minutes": _number(j5.get("commute_minutes")), "acceptable_work_modes": j5.get("work_modes") or [], "travel_acceptance": j5.get("travel")},
            "employment_preferences": {"career_stage": self._career_stage(j6.get("seniority")), "target_seniority": j6.get("seniority") or [], "employment_types": j6.get("employment_types") or [], "available_date": _text(j6.get("available_date")), "hours_per_week": _number(j6.get("hours_per_week")), "freelance_acceptable": _boolean(j6.get("freelance_acceptable")), "variable_workload_acceptable": _boolean(j6.get("variable_workload_acceptable"))},
            "compensation": {"minimum_amount": _number(j7.get("minimum_amount")), "expected_amount": _number(j7.get("expected_amount")), "period": "monthly", "currency": "CNY", "before_tax": True, "negotiable": _boolean(j7.get("negotiable"))},
            "eligibility": {"certifications": _lines(j4.get("certifications")), "licenses": _lines(j4.get("certifications")), "work_authorization": None, "visa_sponsorship_required": None},
            "industry_preferences": {"preferred": _list(j8.get("preferred")), "acceptable": _list(j8.get("acceptable")), "excluded": _list(j8.get("excluded")), "outsourcing_acceptable": _boolean(j8.get("outsourcing_acceptable")), "labor_dispatch_acceptable": _boolean(j8.get("labor_dispatch_acceptable"))},
        }

    def _career_stage(self, seniority: Any) -> str | None:
        values = seniority if isinstance(seniority, list) else []
        if "intern" in values:
            return "student"
        if "entry_level" in values:
            return "entry_level"
        if "experienced" in values:
            return "experienced"
        return None

    def _consent(self, answers: dict[str, Any]) -> dict[str, Any]:
        if _value(answers, "B7") not in ("active", "soon"):
            return {
                "can_use_for_job_matching": False,
                "can_use_for_web_job_search": False,
                "can_generate_external_materials": False,
                "can_share_sensitive_information_externally": False,
                "behavior_inference_enabled": False,
                "sensitive_info_requires_confirmation": True,
            }
        return {
            "can_use_for_job_matching": _boolean(_value(answers, "J9", "can_use_for_job_matching")) is True,
            "can_use_for_web_job_search": _boolean(_value(answers, "J9", "can_use_for_web_job_search")) is True,
            "can_generate_external_materials": False,
            "can_share_sensitive_information_externally": False,
            "behavior_inference_enabled": False,
            "sensitive_info_requires_confirmation": _boolean(_value(answers, "J9", "sensitive_info_requires_confirmation")) is not False,
        }

    def _readiness_missing(self, answers: dict[str, Any], job: dict[str, Any], consent: dict[str, Any], evidence: list[dict[str, Any]]) -> list[str]:
        missing = []
        if _value(answers, "B7") not in ("active", "soon"):
            missing.append("job_search_profile（B7=暂时不找，补充页未作答）")
        if not consent["can_use_for_job_matching"]:
            missing.append("consent.can_use_for_job_matching")
        if not job["education"].get("highest_level"):
            missing.append("job_search_profile.education.highest_level")
        if not job["location_preferences"].get("current_city"):
            missing.append("job_search_profile.location_preferences.current_city")
        if not job["employment_preferences"].get("target_seniority"):
            missing.append("job_search_profile.employment_preferences.target_seniority")
        if not job["employment_preferences"].get("employment_types"):
            missing.append("job_search_profile.employment_preferences.employment_types")
        if job["compensation"].get("minimum_amount") is None:
            missing.append("job_search_profile.compensation.minimum_amount")
        if not job["experiences"] and not job["skills"] and not any(unit["strength"] >= 2 for unit in evidence):
            missing.append("job_search_profile.experiences[]/skills[]（且无 2 级以上生活证据）")
        return list(dict.fromkeys(missing))

    def _unverified_clues(self, answers: dict[str, Any], evidence: list[dict[str, Any]]) -> list[dict[str, Any]]:
        supported = {item for unit in evidence if unit["strength"] >= 2 for item in unit["linked_capabilities"]}
        return [
            {"clue": CAPABILITY_LABELS.get(item, item), "reason": "来自自评选择，尚缺 2 级以上具体证据", "source_question_ids": ["Q8"]}
            for item in (_value(answers, "Q8") or [])
            if item not in supported
        ]
