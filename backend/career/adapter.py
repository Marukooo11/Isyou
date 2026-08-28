from __future__ import annotations

from copy import deepcopy
from typing import Any

from coach.errors import InvalidRequest

from .matcher import CREDENTIAL_LABELS, CareerMatcher


class CareerAdapter:
    """Translate a matched output1 profile into the stable Coach context."""

    def __init__(self, matcher: CareerMatcher):
        self.matcher = matcher

    def build_context(
        self,
        matched_profile: dict[str, Any],
        selected_occupation_id: str | None = None,
    ) -> tuple[dict[str, Any], dict[str, Any]]:
        recommendations = matched_profile.get("recommended_occupations") or []
        if not recommendations:
            missing = (matched_profile.get("profile_status") or {}).get("missing_critical_fields") or []
            detail = "、".join(missing) if missing else "职业推荐尚未生成"
            raise InvalidRequest(f"当前画像还不能启动职业 Coach：{detail}")
        selected = next(
            (
                item
                for item in recommendations
                if item.get("occupation_id") == selected_occupation_id
            ),
            None,
        )
        if selected_occupation_id and selected is None:
            raise InvalidRequest("selected_occupation_id 必须来自本次 recommended_occupations。")
        selected = selected or recommendations[0]
        occupation = self.matcher.get_occupation(selected["occupation_id"]) or {}
        requirements = self._requirements(selected, occupation)
        context = {
            "selected_direction": {
                "id": selected["occupation_id"],
                "title": selected["occupation_name"],
                "source_refs": ["career-library:occupations@1.1"],
                "match_score": selected["match_score"],
                "current_readiness": selected["current_readiness"],
            },
            "target_requirements": requirements,
            "user_profile": self._user_profile(matched_profile, selected),
            "handoff": deepcopy(matched_profile.get("handoff") or {}),
            "source_profile": {
                "profile_id": matched_profile.get("profile_id"),
                "schema_version": matched_profile.get("schema_version"),
                "profile_version": matched_profile.get("profile_version"),
            },
        }
        return context, deepcopy(selected)

    def _requirements(
        self,
        selected: dict[str, Any],
        occupation: dict[str, Any],
    ) -> list[dict[str, Any]]:
        requirements: list[dict[str, Any]] = []
        source_ref = f"occupation:{selected['occupation_id']}"
        for index, text in enumerate(selected.get("missing_readiness_information") or [], start=1):
            requirements.append(
                {
                    "id": f"{selected['occupation_id']}-gap-{index}",
                    "text": text,
                    "source_ref": "profile-readiness-comparison",
                    "evidence_status": "derived_from_confirmed_profile",
                }
            )
        seniority = occupation.get("typical_seniority")
        if seniority == "experienced_required":
            requirements.append(
                {
                    "id": f"{selected['occupation_id']}-seniority",
                    "text": "该职业在当前职业库中标记为通常需要经验资历积累。",
                    "source_ref": source_ref,
                    "evidence_status": "internal_tag_unverified",
                }
            )
        credential = occupation.get("credential_required")
        if credential not in {None, "none", "unknown", "vocational_cert"}:
            requirements.append(
                {
                    "id": f"{selected['occupation_id']}-credential",
                    "text": f"该职业通常要求{CREDENTIAL_LABELS.get(credential, credential)}。",
                    "source_ref": source_ref,
                    "evidence_status": "internal_tag_unverified",
                }
            )
        if not requirements:
            requirements.append(
                {
                    "id": f"{selected['occupation_id']}-validation",
                    "text": "需要通过一份真实任务、经历或作品继续验证当前起点。",
                    "source_ref": "profile-readiness-comparison",
                    "evidence_status": "needs_validation",
                }
            )
        return requirements

    def _user_profile(
        self,
        profile: dict[str, Any],
        selected: dict[str, Any],
    ) -> dict[str, Any]:
        job = profile.get("job_search_profile") or {}
        education = job.get("education") or {}
        facts: list[str] = []
        if education.get("highest_level") or education.get("major"):
            facts.append(
                "学历/专业："
                + " · ".join(
                    str(item)
                    for item in (education.get("highest_level"), education.get("major"))
                    if item
                )
            )
        facts.extend(
            f"经历：{item.get('title')}（{item.get('duration_months', '?')}个月）"
            for item in (job.get("experiences") or [])[:4]
            if item.get("title")
        )
        facts.extend(
            f"技能：{item.get('normalized_name') or item.get('name')}（{item.get('level', 'unknown')}）"
            for item in (job.get("skills") or [])[:6]
            if item.get("name") or item.get("normalized_name")
        )
        evidence = [
            {
                "id": item.get("evidence_unit_id") or item.get("id"),
                "summary": item.get("claim") or item.get("summary") or item.get("evidence"),
                "strength": item.get("strength"),
                "status": item.get("user_status") or "accepted",
            }
            for item in (profile.get("evidence_units") or [])
        ]
        open_questions = [
            *(selected.get("missing_readiness_information") or []),
            *((profile.get("profile_status") or {}).get("missing_critical_fields") or []),
        ]
        return {
            "facts": facts,
            "evidence": evidence,
            "constraints": deepcopy((profile.get("user_work_profile") or {}).get("constraints") or []),
            "open_questions": list(dict.fromkeys(open_questions)),
        }
