from __future__ import annotations

from datetime import datetime
from typing import Any

from coach.errors import InvalidRequest
from coach.service import CoachService

from .adapter import CareerAdapter
from .matcher import CareerMatcher


class CareerService:
    """Application facade for evaluation and the Career → Coach handoff."""

    def __init__(
        self,
        coach_service: CoachService,
        matcher: CareerMatcher | None = None,
        adapter: CareerAdapter | None = None,
    ):
        self.coach_service = coach_service
        self.matcher = matcher or CareerMatcher()
        self.adapter = adapter or CareerAdapter(self.matcher)

    def evaluate(self, payload: dict[str, Any], now: datetime) -> dict[str, Any]:
        if not isinstance(payload, dict):
            raise InvalidRequest("请求体必须是 JSON 对象。")
        profile = payload.get("profile")
        if not isinstance(profile, dict):
            raise InvalidRequest("缺少有效的 profile。")
        matched = self.matcher.match_profile(profile, now)
        ready = bool((matched.get("profile_status") or {}).get("job_matching_ready"))
        context = None
        selected = None
        if ready:
            context, selected = self.adapter.build_context(
                matched,
                payload.get("selected_occupation_id"),
            )
        return {
            "schema_version": "career-evaluation.v1",
            "profile_id": matched.get("profile_id"),
            "profile_status": matched.get("profile_status"),
            "recommended_occupations": matched.get("recommended_occupations") or [],
            "selected_occupation": selected,
            "career_context": context,
            "library": {
                "schema_version": self.matcher.library_meta.get("schema_version"),
                "occupation_count": self.matcher.occupation_count,
                "tagged_by": (self.matcher.library_meta.get("tag_system") or {}).get("tagged_by"),
            },
            "boundary": {
                "result_type": "occupation_direction_match",
                "real_jd_filtering_completed": False,
                "note": "真实 JD 的地点、薪资、职级与资格核验仍由 handoff 消费方执行。",
                "scoring_note": "当前主分来自 Big Five 与多元智能；技能和经历用于就绪判断及同分排序，不代表真实岗位胜任度。",
            },
        }

    def create_coach_session(self, payload: dict[str, Any], now: datetime) -> dict[str, Any]:
        evaluation = self.evaluate(payload, now)
        if not evaluation["career_context"]:
            missing = (evaluation.get("profile_status") or {}).get("missing_critical_fields") or []
            raise InvalidRequest("画像尚未满足职业匹配条件：" + "、".join(missing))
        coach_payload = {
            "client_user_id": payload.get("client_user_id") or evaluation.get("profile_id"),
            "domain": "career",
            "career_context": evaluation["career_context"],
            "preferences": payload.get("preferences") or {},
        }
        coach = self.coach_service.create_session(coach_payload, now)
        return {
            "career_evaluation": evaluation,
            "coach": coach,
        }
