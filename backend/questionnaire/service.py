from __future__ import annotations

import json
from copy import deepcopy
from datetime import datetime
from typing import Any

from coach.errors import InvalidRequest

from .questions import QUESTION_IDS, QUESTIONNAIRE_SCHEMA
from .scorer import QuestionnaireScorer


class QuestionnaireService:
    def __init__(self, store: Any, scorer: QuestionnaireScorer | None = None):
        self.store = store
        self.scorer = scorer or QuestionnaireScorer()

    def schema(self) -> dict[str, Any]:
        return deepcopy(QUESTIONNAIRE_SCHEMA)

    def get_draft(self, user_id: str) -> dict[str, Any]:
        draft = self.store.get_questionnaire_draft(user_id)
        if draft:
            return {
                "schema_version": "questionnaire-draft.v1",
                **draft,
            }
        return {
            "schema_version": "questionnaire-draft.v1",
            "user_id": user_id,
            "answers": {},
            "current_section": "background",
            "status": "in_progress",
            "updated_at": None,
            "completed_at": None,
        }

    def save_draft(
        self,
        user_id: str,
        payload: dict[str, Any],
        now: datetime,
    ) -> dict[str, Any]:
        answers = self._validate_answers(payload.get("answers"))
        current_section = str(payload.get("current_section") or "background")
        if current_section not in {item["id"] for item in QUESTIONNAIRE_SCHEMA["sections"]}:
            raise InvalidRequest("current_section 无效。")
        self.store.save_questionnaire_draft(
            user_id,
            answers,
            current_section,
            "in_progress",
            now.isoformat(),
        )
        return self.get_draft(user_id)

    def complete(
        self,
        user_id: str,
        payload: dict[str, Any],
        now: datetime,
    ) -> dict[str, Any]:
        supplied = payload.get("answers")
        if supplied is None:
            draft = self.store.get_questionnaire_draft(user_id)
            supplied = (draft or {}).get("answers") or {}
        answers = self._validate_answers(supplied)
        existing = self.store.get_profile(user_id)
        profile = self.scorer.build_profile(answers, now, existing)
        self.store.save_questionnaire_draft(
            user_id,
            answers,
            "job" if profile["profile_status"]["completion_level"] != "psychological_only" else "values",
            "completed",
            now.isoformat(),
            now.isoformat(),
        )
        return profile

    def _validate_answers(self, value: Any) -> dict[str, Any]:
        if not isinstance(value, dict):
            raise InvalidRequest("answers 必须是 JSON 对象。")
        serialized = json.dumps(value, ensure_ascii=False)
        if len(serialized.encode("utf-8")) > 750_000:
            raise InvalidRequest("问卷答案超过大小限制。")
        unknown = sorted(set(value) - QUESTION_IDS)
        if unknown:
            raise InvalidRequest("存在未知题号：" + "、".join(unknown[:8]))
        answers: dict[str, Any] = {}
        for question_id, record in value.items():
            if not isinstance(record, dict):
                raise InvalidRequest(f"{question_id} 的答案必须是 JSON 对象。")
            answers[question_id] = deepcopy(record)
        return answers
