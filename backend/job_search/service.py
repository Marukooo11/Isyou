from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import uuid4

from coach.errors import InvalidRequest

from .adapter import JobCoachAdapter
from .client import JobMatcherClient, JobSearchError


class JobSearchService:
    def __init__(
        self,
        store: Any,
        coach_service: Any,
        client: JobMatcherClient,
        adapter: JobCoachAdapter | None = None,
    ):
        self.store = store
        self.coach_service = coach_service
        self.client = client
        self.adapter = adapter or JobCoachAdapter()

    def search_candidates(
        self,
        user_id: str,
        payload: dict[str, Any],
        now: datetime,
    ) -> dict[str, Any]:
        profile = self._profile(user_id)
        if (profile.get("consent") or {}).get("can_use_for_web_job_search") is not True:
            raise JobSearchError(
                "WEB_SEARCH_NOT_AUTHORIZED",
                "请先在问卷中授权使用非敏感画像检索公开岗位。",
                403,
                False,
            )
        request = {
            "profile": profile,
            "market": payload.get("market") or "CN",
            "language": payload.get("language") or "zh-CN",
        }
        upstream = self.client.search_candidates(request)
        candidates = upstream.get("candidates")
        if not isinstance(candidates, list) or not candidates:
            raise JobSearchError(
                "JOB_MATCHER_INVALID_RESPONSE",
                "真实岗位服务没有返回可用候选。",
                502,
                True,
            )
        clean_candidates = self._validate_candidates(candidates)
        search_id = f"job-search-{uuid4()}"
        result = {
            "status": upstream.get("status") or "partial",
            "generated_at": upstream.get("generated_at") or now.isoformat(),
            "candidate_count": len(clean_candidates),
            "candidates": clean_candidates,
            "warning": upstream.get("warning"),
        }
        self.store.create_job_search_run(
            search_id,
            user_id,
            profile,
            result,
            now.isoformat(),
        )
        return {
            "schema_version": "job-search-candidates.v1",
            "search_id": search_id,
            **result,
        }

    def select_candidate(
        self,
        user_id: str,
        payload: dict[str, Any],
        now: datetime,
    ) -> dict[str, Any]:
        search_id = str(payload.get("search_id") or "").strip()
        candidate_id = str(payload.get("candidate_id") or "").strip()
        if not search_id or not candidate_id:
            raise InvalidRequest("缺少 search_id 或 candidate_id。")
        search = self.store.get_job_search_run(search_id, user_id)
        if not search:
            raise JobSearchError("JOB_SEARCH_NOT_FOUND", "岗位搜索记录不存在。", 404)
        candidate = next(
            (
                item
                for item in (search["result"].get("candidates") or [])
                if item.get("candidate_id") == candidate_id
            ),
            None,
        )
        if not candidate:
            raise JobSearchError(
                "JOB_CANDIDATE_NOT_FOUND",
                "该候选不属于当前账号的这次搜索。",
                404,
            )
        upstream = self.client.select_candidate(
            {"profile": search["profile"], "candidate": candidate}
        )
        selected_job = upstream.get("selected_job")
        file_result = upstream.get("file")
        if (
            not isinstance(selected_job, dict)
            or selected_job.get("schema_version") != "output2.jd.v1.0"
            or not isinstance(file_result, dict)
            or not isinstance(file_result.get("content"), str)
        ):
            raise JobSearchError(
                "JOB_MATCHER_INVALID_RESPONSE",
                "真实岗位服务没有返回有效的选定岗位。",
                502,
                True,
            )
        selection_id = f"job-selection-{uuid4()}"
        result = {
            "status": upstream.get("status") or "complete",
            "generated_at": upstream.get("generated_at") or now.isoformat(),
            "verification_status": upstream.get("verification_status"),
            "selected_job": selected_job,
            "file": file_result,
        }
        self.store.create_selected_job(
            selection_id,
            user_id,
            search_id,
            candidate_id,
            result,
            now.isoformat(),
        )
        return {
            "schema_version": "job-selection.v1",
            "selection_id": selection_id,
            "search_id": search_id,
            "candidate_id": candidate_id,
            **result,
        }

    def create_coach_session(
        self,
        user_id: str,
        payload: dict[str, Any],
        now: datetime,
    ) -> dict[str, Any]:
        selection_id = str(payload.get("selection_id") or "").strip()
        if not selection_id:
            raise InvalidRequest("缺少 selection_id。")
        selection = self.store.get_selected_job(selection_id, user_id)
        if not selection:
            raise JobSearchError("JOB_SELECTION_NOT_FOUND", "选定岗位不存在。", 404)
        search = self.store.get_job_search_run(selection["search_id"], user_id)
        if not search:
            raise JobSearchError("JOB_SEARCH_NOT_FOUND", "岗位搜索记录不存在。", 404)
        selected_job = selection["result"].get("selected_job") or {}
        context = self.adapter.build_context(search["profile"], selected_job)
        coach = self.coach_service.create_session(
            {
                "user_id": user_id,
                "client_user_id": user_id,
                "domain": "career",
                "career_context": context,
                "preferences": payload.get("preferences") or {},
            },
            now,
        )
        return {
            "schema_version": "job-coach-handoff.v1",
            "selection_id": selection_id,
            "selected_job": selected_job,
            "career_context": context,
            "coach": coach,
        }

    def get_state(self, user_id: str) -> dict[str, Any]:
        search = self.store.get_latest_job_search_run(user_id)
        selection = self.store.get_latest_selected_job(user_id)
        if selection and search and selection["search_id"] != search["search_id"]:
            selection = None
        return {
            "schema_version": "job-search-state.v1",
            "search": None
            if not search
            else {
                "search_id": search["search_id"],
                "created_at": search["created_at"],
                **search["result"],
            },
            "selection": None
            if not selection
            else {
                "selection_id": selection["selection_id"],
                "search_id": selection["search_id"],
                "candidate_id": selection["candidate_id"],
                "created_at": selection["created_at"],
                "status": selection["result"].get("status"),
                "verification_status": selection["result"].get("verification_status"),
                "selected_job": selection["result"].get("selected_job"),
            },
        }

    def _profile(self, user_id: str) -> dict[str, Any]:
        profile = self.store.get_profile(user_id)
        if not profile:
            raise JobSearchError(
                "PROFILE_REQUIRED",
                "请先完成问卷并生成职业画像。",
                409,
            )
        if not (profile.get("recommended_occupations") or []):
            raise JobSearchError(
                "PROFILE_NOT_READY",
                "画像尚未生成可用于检索的职业方向。",
                409,
            )
        return profile

    def _validate_candidates(
        self,
        candidates: list[Any],
    ) -> list[dict[str, Any]]:
        result = []
        seen = set()
        allowed = {
            "candidate_id",
            "title",
            "company",
            "location",
            "snippet",
            "source_url",
            "source_type",
            "direction_id",
            "direction_title",
            "discovery_status",
        }
        for item in candidates[:5]:
            if not isinstance(item, dict):
                continue
            candidate_id = str(item.get("candidate_id") or "").strip()
            title = str(item.get("title") or "").strip()
            source_url = str(item.get("source_url") or "").strip()
            if not candidate_id or not title or not source_url or candidate_id in seen:
                continue
            seen.add(candidate_id)
            result.append({key: item.get(key) for key in allowed})
        if not result:
            raise JobSearchError(
                "JOB_MATCHER_INVALID_RESPONSE",
                "真实岗位服务返回的候选格式无效。",
                502,
                True,
            )
        return result
