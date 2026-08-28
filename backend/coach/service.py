from __future__ import annotations

import sqlite3
from datetime import datetime
from typing import Any

from .engine import CoachEngine
from .errors import InvalidRequest
from .storage import SQLiteCoachStore


class CoachService:
    """Application service shared by the zero-dependency server and future FastAPI wrapper."""

    def __init__(self, store: SQLiteCoachStore, engine: CoachEngine | None = None):
        self.store = store
        self.engine = engine or CoachEngine()

    def create_session(self, payload: dict[str, Any], now: datetime) -> dict[str, Any]:
        if not isinstance(payload, dict):
            raise InvalidRequest("请求体必须是 JSON 对象。")
        state, response = self.engine.create_state(payload, now)
        self.store.create_session(state)
        return response

    def get_session(self, session_id: str, now: datetime) -> dict[str, Any]:
        state = self.store.get_session(session_id)
        prepared, response, changed = self.engine.prepare_for_date(state, now.date(), now)
        if changed:
            self.store.update_state(session_id, state["state_version"], prepared)
        return response

    def handle_turn(
        self,
        session_id: str,
        payload: dict[str, Any],
        now: datetime,
    ) -> dict[str, Any]:
        if not isinstance(payload, dict):
            raise InvalidRequest("请求体必须是 JSON 对象。")
        request_id = payload.get("request_id")
        expected_version = payload.get("expected_state_version")
        event = payload.get("event")
        if not request_id or not isinstance(request_id, str):
            raise InvalidRequest("缺少有效的 request_id。")
        if not isinstance(expected_version, int):
            raise InvalidRequest("缺少有效的 expected_state_version。")
        if not isinstance(event, dict):
            raise InvalidRequest("缺少有效的 event。")

        replay = self.store.get_turn_response(session_id, request_id)
        if replay is not None:
            return replay

        state = self.store.get_session(session_id)
        if state["state_version"] != expected_version:
            from .errors import StateConflict

            raise StateConflict("会话状态已更新，请重新加载。")

        new_state, response = self.engine.handle_turn(state, event, now)
        try:
            self.store.commit_turn(
                session_id=session_id,
                expected_version=expected_version,
                request_id=request_id,
                event=event,
                state=new_state,
                response=response,
                created_at=now.isoformat(),
            )
        except sqlite3.IntegrityError:
            replay = self.store.get_turn_response(session_id, request_id)
            if replay is not None:
                return replay
            raise
        return response
