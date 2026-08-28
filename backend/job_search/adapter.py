from __future__ import annotations

from copy import deepcopy
from typing import Any

from coach.errors import InvalidRequest


UNKNOWN_CONDITION_LABELS = {
    "remote_work": "是否允许远程或混合办公？",
    "flexible_schedule": "工作时间、夜班、轮班或弹性安排是什么？",
    "travel": "岗位是否需要出差，频率和持续时间如何？",
    "onsite": "是否要求固定坐班或长期驻场？",
    "communication_load": "会议、电话和客户沟通的频率如何？",
}


class JobCoachAdapter:
    """Map one verified JD plus output1 facts into the stable Coach context."""

    def build_context(
        self,
        profile: dict[str, Any],
        selected_job: dict[str, Any],
    ) -> dict[str, Any]:
        if profile.get("schema_version") != "output1.v1.0":
            raise InvalidRequest("Coach handoff 需要 output1.v1.0 画像。")
        if selected_job.get("schema_version") != "output2.jd.v1.0":
            raise InvalidRequest("Coach handoff 需要 output2.jd.v1.0 岗位。")
        opportunity_id = str(selected_job.get("opportunity_id") or "").strip()
        title = str(selected_job.get("title") or "").strip()
        source_url = str(selected_job.get("source_url") or "").strip()
        if not opportunity_id or not title or not source_url:
            raise InvalidRequest("选定岗位缺少 opportunity_id、title 或 source_url。")

        requirements = self._requirements(selected_job, opportunity_id)
        open_questions = self._open_questions(selected_job)
        return {
            "selected_direction": {
                "id": opportunity_id,
                "title": title,
                "source_refs": [source_url],
                "current_readiness": "verified_jd",
                "direction_id": selected_job.get("direction_id"),
                "direction_title": selected_job.get("direction_title"),
            },
            "selected_job": {
                key: deepcopy(selected_job.get(key))
                for key in (
                    "schema_version",
                    "opportunity_id",
                    "title",
                    "company",
                    "location",
                    "work_mode",
                    "employment_type",
                    "compensation",
                    "status",
                    "source_url",
                    "verification_status",
                    "retrieved_at",
                    "tasks",
                    "required",
                    "preferred",
                    "tools",
                )
            },
            "target_requirements": requirements,
            "user_profile": self._user_profile(profile, open_questions),
            "handoff": deepcopy(profile.get("handoff") or {}),
            "source_profile": {
                "profile_id": profile.get("profile_id"),
                "schema_version": profile.get("schema_version"),
                "profile_version": profile.get("profile_version"),
            },
        }

    def _requirements(
        self,
        selected_job: dict[str, Any],
        opportunity_id: str,
    ) -> list[dict[str, Any]]:
        source_ref = str(selected_job["source_url"])
        verification = str(selected_job.get("verification_status") or "unknown")
        evidence_status = (
            "verified_from_original_page"
            if verification == "verified"
            else "partially_verified_from_original_page"
        )
        groups = (
            ("required", "必备要求", selected_job.get("required") or []),
            ("education", "学历、经验与资格", selected_job.get("education_experience") or []),
            ("tool", "工具与技术", selected_job.get("tools") or []),
            ("task", "岗位职责", selected_job.get("tasks") or []),
            ("condition", "时间、地点与协作条件", selected_job.get("schedule_location_collaboration") or []),
        )
        result: list[dict[str, Any]] = []
        for group_id, label, items in groups:
            for item in items:
                text = str(item or "").strip()
                if not text:
                    continue
                result.append(
                    {
                        "id": f"{opportunity_id}-{group_id}-{len(result) + 1}",
                        "type": group_id,
                        "label": label,
                        "text": text,
                        "source_ref": source_ref,
                        "evidence_status": evidence_status,
                    }
                )
                if len(result) >= 20:
                    return result
        if not result:
            result.append(
                {
                    "id": f"{opportunity_id}-validation-1",
                    "type": "validation",
                    "label": "岗位要求",
                    "text": "原始页面没有提取出足够要求，需要先向招聘方确认。",
                    "source_ref": source_ref,
                    "evidence_status": "unknown_to_confirm",
                }
            )
        return result

    def _open_questions(self, selected_job: dict[str, Any]) -> list[str]:
        questions = []
        for item in selected_job.get("conditions") or []:
            if not isinstance(item, dict) or item.get("status") != "unknown_to_confirm":
                continue
            condition = str(item.get("condition") or "")
            questions.append(
                UNKNOWN_CONDITION_LABELS.get(condition)
                or f"需要确认岗位条件：{condition or '未命名条件'}"
            )
        for item in selected_job.get("constraint_checks") or []:
            if not isinstance(item, dict) or item.get("status") != "unknown_to_confirm":
                continue
            label = str(item.get("constraint") or "").strip()
            if label:
                questions.append(f"需要确认是否满足你的限制：{label}")
        return list(dict.fromkeys(questions))

    def _user_profile(
        self,
        profile: dict[str, Any],
        open_questions: list[str],
    ) -> dict[str, Any]:
        job = profile.get("job_search_profile") or {}
        education = job.get("education") or {}
        facts: list[str] = []
        education_parts = [
            str(item)
            for item in (education.get("highest_level"), education.get("major"))
            if item
        ]
        if education_parts:
            facts.append("学历/专业：" + " · ".join(education_parts))
        facts.extend(
            f"经历：{item.get('title')}（{item.get('duration_months', '?')}个月）"
            for item in (job.get("experiences") or [])[:4]
            if isinstance(item, dict) and item.get("title")
        )
        facts.extend(
            f"技能：{item.get('normalized_name') or item.get('name')}（{item.get('level', 'unknown')}）"
            for item in (job.get("skills") or [])[:6]
            if isinstance(item, dict) and (item.get("name") or item.get("normalized_name"))
        )
        evidence = [
            {
                "id": item.get("eu_id") or item.get("evidence_unit_id") or item.get("id"),
                "summary": item.get("text") or item.get("claim") or item.get("summary"),
                "strength": item.get("strength"),
                "status": item.get("user_status") or "accepted",
            }
            for item in (profile.get("evidence_units") or [])
            if isinstance(item, dict)
        ]
        return {
            "facts": facts,
            "evidence": evidence,
            "constraints": deepcopy(
                (profile.get("user_work_profile") or {}).get("constraints") or []
            ),
            "open_questions": open_questions,
        }
