from __future__ import annotations

import json
import sqlite3
from pathlib import Path
from typing import Any

from .errors import SessionNotFound, StateConflict


class SQLiteCoachStore:
    """Small SQLite store for sessions, state versions, and idempotent turns."""

    def __init__(self, database_path: str | Path):
        self.database_path = Path(database_path)
        self.database_path.parent.mkdir(parents=True, exist_ok=True)
        self._initialize()

    def _connect(self) -> sqlite3.Connection:
        connection = sqlite3.connect(self.database_path, timeout=5)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA foreign_keys = ON")
        connection.execute("PRAGMA journal_mode = WAL")
        return connection

    def _initialize(self) -> None:
        with self._connect() as connection:
            connection.executescript(
                """
                CREATE TABLE IF NOT EXISTS coach_sessions (
                    session_id TEXT PRIMARY KEY,
                    state_version INTEGER NOT NULL,
                    state_json TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS coach_turns (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    session_id TEXT NOT NULL,
                    request_id TEXT NOT NULL,
                    event_json TEXT NOT NULL,
                    response_json TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    UNIQUE(session_id, request_id),
                    FOREIGN KEY(session_id) REFERENCES coach_sessions(session_id)
                );
                """
            )

    def create_session(self, state: dict[str, Any]) -> None:
        with self._connect() as connection:
            connection.execute(
                """
                INSERT INTO coach_sessions
                    (session_id, state_version, state_json, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?)
                """,
                (
                    state["session_id"],
                    state["state_version"],
                    json.dumps(state, ensure_ascii=False),
                    state["created_at"],
                    state["updated_at"],
                ),
            )

    def get_session(self, session_id: str) -> dict[str, Any]:
        with self._connect() as connection:
            row = connection.execute(
                "SELECT state_json, state_version FROM coach_sessions WHERE session_id = ?",
                (session_id,),
            ).fetchone()
        if row is None:
            raise SessionNotFound("没有找到这个 Coach 会话。")
        state = json.loads(row["state_json"])
        state["state_version"] = row["state_version"]
        return state

    def get_turn_response(self, session_id: str, request_id: str) -> dict[str, Any] | None:
        with self._connect() as connection:
            row = connection.execute(
                """
                SELECT response_json FROM coach_turns
                WHERE session_id = ? AND request_id = ?
                """,
                (session_id, request_id),
            ).fetchone()
        return json.loads(row["response_json"]) if row else None

    def update_state(
        self,
        session_id: str,
        expected_version: int,
        state: dict[str, Any],
    ) -> None:
        with self._connect() as connection:
            cursor = connection.execute(
                """
                UPDATE coach_sessions
                SET state_version = ?, state_json = ?, updated_at = ?
                WHERE session_id = ? AND state_version = ?
                """,
                (
                    state["state_version"],
                    json.dumps(state, ensure_ascii=False),
                    state["updated_at"],
                    session_id,
                    expected_version,
                ),
            )
            if cursor.rowcount != 1:
                raise StateConflict("会话状态已更新，请重新加载。")

    def commit_turn(
        self,
        session_id: str,
        expected_version: int,
        request_id: str,
        event: dict[str, Any],
        state: dict[str, Any],
        response: dict[str, Any],
        created_at: str,
    ) -> None:
        connection = self._connect()
        try:
            connection.execute("BEGIN IMMEDIATE")
            current = connection.execute(
                "SELECT state_version FROM coach_sessions WHERE session_id = ?",
                (session_id,),
            ).fetchone()
            if current is None:
                raise SessionNotFound("没有找到这个 Coach 会话。")
            if current["state_version"] != expected_version:
                raise StateConflict("会话状态已更新，请重新加载。")

            connection.execute(
                """
                UPDATE coach_sessions
                SET state_version = ?, state_json = ?, updated_at = ?
                WHERE session_id = ?
                """,
                (
                    state["state_version"],
                    json.dumps(state, ensure_ascii=False),
                    state["updated_at"],
                    session_id,
                ),
            )
            connection.execute(
                """
                INSERT INTO coach_turns
                    (session_id, request_id, event_json, response_json, created_at)
                VALUES (?, ?, ?, ?, ?)
                """,
                (
                    session_id,
                    request_id,
                    json.dumps(event, ensure_ascii=False),
                    json.dumps(response, ensure_ascii=False),
                    created_at,
                ),
            )
            connection.commit()
        except Exception:
            connection.rollback()
            raise
        finally:
            connection.close()

