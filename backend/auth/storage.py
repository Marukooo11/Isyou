from __future__ import annotations

import json
import sqlite3
from contextlib import closing
from pathlib import Path
from typing import Any


class SQLiteAuthStore:
    """SQLite persistence for accounts, verification challenges, tokens, and profiles."""

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
        with closing(self._connect()) as connection:
            with connection:
                connection.executescript(
                    """
                    CREATE TABLE IF NOT EXISTS users (
                        user_id TEXT PRIMARY KEY,
                        username TEXT NOT NULL COLLATE NOCASE UNIQUE,
                        contact_type TEXT NOT NULL CHECK(contact_type IN ('email', 'phone')),
                        contact_value TEXT NOT NULL COLLATE NOCASE UNIQUE,
                        password_salt TEXT NOT NULL,
                        password_hash TEXT NOT NULL,
                        created_at TEXT NOT NULL,
                        updated_at TEXT NOT NULL
                    );

                    CREATE TABLE IF NOT EXISTS auth_challenges (
                        challenge_id TEXT PRIMARY KEY,
                        purpose TEXT NOT NULL CHECK(purpose IN ('register', 'login')),
                        contact_type TEXT NOT NULL CHECK(contact_type IN ('email', 'phone')),
                        contact_value TEXT NOT NULL COLLATE NOCASE,
                        code_salt TEXT NOT NULL,
                        code_hash TEXT NOT NULL,
                        attempts INTEGER NOT NULL DEFAULT 0,
                        expires_at TEXT NOT NULL,
                        consumed_at TEXT,
                        created_at TEXT NOT NULL
                    );

                    CREATE INDEX IF NOT EXISTS idx_auth_challenge_contact
                    ON auth_challenges(contact_value, purpose, created_at DESC);

                    CREATE TABLE IF NOT EXISTS auth_sessions (
                        token_hash TEXT PRIMARY KEY,
                        user_id TEXT NOT NULL,
                        expires_at TEXT NOT NULL,
                        created_at TEXT NOT NULL,
                        last_seen_at TEXT NOT NULL,
                        revoked_at TEXT,
                        FOREIGN KEY(user_id) REFERENCES users(user_id)
                    );

                    CREATE INDEX IF NOT EXISTS idx_auth_session_user
                    ON auth_sessions(user_id, created_at DESC);

                    CREATE TABLE IF NOT EXISTS user_profiles (
                        user_id TEXT PRIMARY KEY,
                        profile_json TEXT NOT NULL,
                        updated_at TEXT NOT NULL,
                        FOREIGN KEY(user_id) REFERENCES users(user_id)
                    );

                    CREATE TABLE IF NOT EXISTS questionnaire_drafts (
                        user_id TEXT PRIMARY KEY,
                        answers_json TEXT NOT NULL,
                        current_section TEXT,
                        status TEXT NOT NULL CHECK(status IN ('in_progress', 'completed')),
                        updated_at TEXT NOT NULL,
                        completed_at TEXT,
                        FOREIGN KEY(user_id) REFERENCES users(user_id)
                    );

                    CREATE TABLE IF NOT EXISTS job_search_runs (
                        search_id TEXT PRIMARY KEY,
                        user_id TEXT NOT NULL,
                        profile_json TEXT NOT NULL,
                        result_json TEXT NOT NULL,
                        created_at TEXT NOT NULL,
                        FOREIGN KEY(user_id) REFERENCES users(user_id)
                    );

                    CREATE INDEX IF NOT EXISTS idx_job_search_user
                    ON job_search_runs(user_id, created_at DESC);

                    CREATE TABLE IF NOT EXISTS selected_jobs (
                        selection_id TEXT PRIMARY KEY,
                        user_id TEXT NOT NULL,
                        search_id TEXT NOT NULL,
                        candidate_id TEXT NOT NULL,
                        result_json TEXT NOT NULL,
                        created_at TEXT NOT NULL,
                        FOREIGN KEY(user_id) REFERENCES users(user_id),
                        FOREIGN KEY(search_id) REFERENCES job_search_runs(search_id)
                    );

                    CREATE INDEX IF NOT EXISTS idx_selected_job_user
                    ON selected_jobs(user_id, created_at DESC);
                    """
                )

    def latest_challenge(self, contact_value: str, purpose: str) -> dict[str, Any] | None:
        with closing(self._connect()) as connection:
            row = connection.execute(
                """
                SELECT * FROM auth_challenges
                WHERE contact_value = ? AND purpose = ?
                ORDER BY created_at DESC LIMIT 1
                """,
                (contact_value, purpose),
            ).fetchone()
        return dict(row) if row else None

    def create_challenge(self, challenge: dict[str, Any]) -> None:
        with closing(self._connect()) as connection:
            with connection:
                connection.execute(
                    """
                    INSERT INTO auth_challenges
                        (challenge_id, purpose, contact_type, contact_value, code_salt,
                         code_hash, attempts, expires_at, consumed_at, created_at)
                    VALUES (?, ?, ?, ?, ?, ?, 0, ?, NULL, ?)
                    """,
                    (
                        challenge["challenge_id"],
                        challenge["purpose"],
                        challenge["contact_type"],
                        challenge["contact_value"],
                        challenge["code_salt"],
                        challenge["code_hash"],
                        challenge["expires_at"],
                        challenge["created_at"],
                    ),
                )

    def get_challenge(self, challenge_id: str) -> dict[str, Any] | None:
        with closing(self._connect()) as connection:
            row = connection.execute(
                "SELECT * FROM auth_challenges WHERE challenge_id = ?",
                (challenge_id,),
            ).fetchone()
        return dict(row) if row else None

    def increment_challenge_attempts(self, challenge_id: str) -> None:
        with closing(self._connect()) as connection:
            with connection:
                connection.execute(
                    """
                    UPDATE auth_challenges SET attempts = attempts + 1
                    WHERE challenge_id = ? AND consumed_at IS NULL
                    """,
                    (challenge_id,),
                )

    def consume_challenge(self, challenge_id: str, consumed_at: str) -> bool:
        with closing(self._connect()) as connection:
            with connection:
                cursor = connection.execute(
                    """
                    UPDATE auth_challenges SET consumed_at = ?
                    WHERE challenge_id = ? AND consumed_at IS NULL AND attempts < 5
                    """,
                    (consumed_at, challenge_id),
                )
        return cursor.rowcount == 1

    def create_user(self, user: dict[str, Any]) -> None:
        with closing(self._connect()) as connection:
            with connection:
                connection.execute(
                    """
                    INSERT INTO users
                        (user_id, username, contact_type, contact_value, password_salt,
                         password_hash, created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        user["user_id"],
                        user["username"],
                        user["contact_type"],
                        user["contact_value"],
                        user["password_salt"],
                        user["password_hash"],
                        user["created_at"],
                        user["updated_at"],
                    ),
                )

    def create_user_with_challenge(
        self,
        user: dict[str, Any],
        challenge_id: str,
        consumed_at: str,
    ) -> bool:
        connection = self._connect()
        try:
            connection.execute("BEGIN IMMEDIATE")
            cursor = connection.execute(
                """
                UPDATE auth_challenges SET consumed_at = ?
                WHERE challenge_id = ? AND consumed_at IS NULL AND attempts < 5
                """,
                (consumed_at, challenge_id),
            )
            if cursor.rowcount != 1:
                connection.rollback()
                return False
            connection.execute(
                """
                INSERT INTO users
                    (user_id, username, contact_type, contact_value, password_salt,
                     password_hash, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    user["user_id"],
                    user["username"],
                    user["contact_type"],
                    user["contact_value"],
                    user["password_salt"],
                    user["password_hash"],
                    user["created_at"],
                    user["updated_at"],
                ),
            )
            connection.commit()
            return True
        except Exception:
            connection.rollback()
            raise
        finally:
            connection.close()

    def get_user_by_username(self, username: str) -> dict[str, Any] | None:
        with closing(self._connect()) as connection:
            row = connection.execute(
                "SELECT * FROM users WHERE username = ? COLLATE NOCASE",
                (username,),
            ).fetchone()
        return dict(row) if row else None

    def get_user_by_contact(self, contact_value: str) -> dict[str, Any] | None:
        with closing(self._connect()) as connection:
            row = connection.execute(
                "SELECT * FROM users WHERE contact_value = ? COLLATE NOCASE",
                (contact_value,),
            ).fetchone()
        return dict(row) if row else None

    def get_user(self, user_id: str) -> dict[str, Any] | None:
        with closing(self._connect()) as connection:
            row = connection.execute(
                "SELECT * FROM users WHERE user_id = ?",
                (user_id,),
            ).fetchone()
        return dict(row) if row else None

    def create_auth_session(self, session: dict[str, Any]) -> None:
        with closing(self._connect()) as connection:
            with connection:
                connection.execute(
                    """
                    INSERT INTO auth_sessions
                        (token_hash, user_id, expires_at, created_at, last_seen_at, revoked_at)
                    VALUES (?, ?, ?, ?, ?, NULL)
                    """,
                    (
                        session["token_hash"],
                        session["user_id"],
                        session["expires_at"],
                        session["created_at"],
                        session["last_seen_at"],
                    ),
                )

    def get_auth_session(self, token_hash: str) -> dict[str, Any] | None:
        with closing(self._connect()) as connection:
            row = connection.execute(
                "SELECT * FROM auth_sessions WHERE token_hash = ?",
                (token_hash,),
            ).fetchone()
        return dict(row) if row else None

    def touch_auth_session(self, token_hash: str, last_seen_at: str) -> None:
        with closing(self._connect()) as connection:
            with connection:
                connection.execute(
                    "UPDATE auth_sessions SET last_seen_at = ? WHERE token_hash = ?",
                    (last_seen_at, token_hash),
                )

    def revoke_auth_session(self, token_hash: str, revoked_at: str) -> None:
        with closing(self._connect()) as connection:
            with connection:
                connection.execute(
                    """
                    UPDATE auth_sessions SET revoked_at = ?
                    WHERE token_hash = ? AND revoked_at IS NULL
                    """,
                    (revoked_at, token_hash),
                )

    def save_profile(self, user_id: str, profile: dict[str, Any], updated_at: str) -> None:
        serialized = json.dumps(profile, ensure_ascii=False)
        with closing(self._connect()) as connection:
            with connection:
                connection.execute(
                    """
                    INSERT INTO user_profiles (user_id, profile_json, updated_at)
                    VALUES (?, ?, ?)
                    ON CONFLICT(user_id) DO UPDATE SET
                        profile_json = excluded.profile_json,
                        updated_at = excluded.updated_at
                    """,
                    (user_id, serialized, updated_at),
                )

    def get_profile(self, user_id: str) -> dict[str, Any] | None:
        with closing(self._connect()) as connection:
            row = connection.execute(
                "SELECT profile_json FROM user_profiles WHERE user_id = ?",
                (user_id,),
            ).fetchone()
        return json.loads(row["profile_json"]) if row else None

    def save_questionnaire_draft(
        self,
        user_id: str,
        answers: dict[str, Any],
        current_section: str | None,
        status: str,
        updated_at: str,
        completed_at: str | None = None,
    ) -> None:
        serialized = json.dumps(answers, ensure_ascii=False)
        with closing(self._connect()) as connection:
            with connection:
                connection.execute(
                    """
                    INSERT INTO questionnaire_drafts
                        (user_id, answers_json, current_section, status, updated_at, completed_at)
                    VALUES (?, ?, ?, ?, ?, ?)
                    ON CONFLICT(user_id) DO UPDATE SET
                        answers_json = excluded.answers_json,
                        current_section = excluded.current_section,
                        status = excluded.status,
                        updated_at = excluded.updated_at,
                        completed_at = excluded.completed_at
                    """,
                    (user_id, serialized, current_section, status, updated_at, completed_at),
                )

    def get_questionnaire_draft(self, user_id: str) -> dict[str, Any] | None:
        with closing(self._connect()) as connection:
            row = connection.execute(
                "SELECT * FROM questionnaire_drafts WHERE user_id = ?",
                (user_id,),
            ).fetchone()
        if not row:
            return None
        result = dict(row)
        result["answers"] = json.loads(result.pop("answers_json"))
        return result

    def create_job_search_run(
        self,
        search_id: str,
        user_id: str,
        profile: dict[str, Any],
        result: dict[str, Any],
        created_at: str,
    ) -> None:
        with closing(self._connect()) as connection:
            with connection:
                connection.execute(
                    """
                    INSERT INTO job_search_runs
                        (search_id, user_id, profile_json, result_json, created_at)
                    VALUES (?, ?, ?, ?, ?)
                    """,
                    (
                        search_id,
                        user_id,
                        json.dumps(profile, ensure_ascii=False),
                        json.dumps(result, ensure_ascii=False),
                        created_at,
                    ),
                )

    def get_job_search_run(
        self,
        search_id: str,
        user_id: str,
    ) -> dict[str, Any] | None:
        with closing(self._connect()) as connection:
            row = connection.execute(
                """
                SELECT * FROM job_search_runs
                WHERE search_id = ? AND user_id = ?
                """,
                (search_id, user_id),
            ).fetchone()
        return self._decode_job_search(row)

    def get_latest_job_search_run(self, user_id: str) -> dict[str, Any] | None:
        with closing(self._connect()) as connection:
            row = connection.execute(
                """
                SELECT * FROM job_search_runs
                WHERE user_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 1
                """,
                (user_id,),
            ).fetchone()
        return self._decode_job_search(row)

    def create_selected_job(
        self,
        selection_id: str,
        user_id: str,
        search_id: str,
        candidate_id: str,
        result: dict[str, Any],
        created_at: str,
    ) -> None:
        with closing(self._connect()) as connection:
            with connection:
                connection.execute(
                    """
                    INSERT INTO selected_jobs
                        (selection_id, user_id, search_id, candidate_id, result_json, created_at)
                    VALUES (?, ?, ?, ?, ?, ?)
                    """,
                    (
                        selection_id,
                        user_id,
                        search_id,
                        candidate_id,
                        json.dumps(result, ensure_ascii=False),
                        created_at,
                    ),
                )

    def get_selected_job(
        self,
        selection_id: str,
        user_id: str,
    ) -> dict[str, Any] | None:
        with closing(self._connect()) as connection:
            row = connection.execute(
                """
                SELECT * FROM selected_jobs
                WHERE selection_id = ? AND user_id = ?
                """,
                (selection_id, user_id),
            ).fetchone()
        return self._decode_selected_job(row)

    def get_latest_selected_job(self, user_id: str) -> dict[str, Any] | None:
        with closing(self._connect()) as connection:
            row = connection.execute(
                """
                SELECT * FROM selected_jobs
                WHERE user_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 1
                """,
                (user_id,),
            ).fetchone()
        return self._decode_selected_job(row)

    @staticmethod
    def _decode_job_search(row: sqlite3.Row | None) -> dict[str, Any] | None:
        if not row:
            return None
        result = dict(row)
        result["profile"] = json.loads(result.pop("profile_json"))
        result["result"] = json.loads(result.pop("result_json"))
        return result

    @staticmethod
    def _decode_selected_job(row: sqlite3.Row | None) -> dict[str, Any] | None:
        if not row:
            return None
        result = dict(row)
        result["result"] = json.loads(result.pop("result_json"))
        return result
