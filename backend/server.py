#!/usr/bin/env python3
from __future__ import annotations

import json
import os
import re
from datetime import date, datetime, time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any

from auth import AuthService, DevelopmentCodeDelivery, SQLiteAuthStore
from career import CareerService
from coach import CoachService, SQLiteCoachStore
from coach.errors import CoachError, InvalidRequest


SESSION_PATH = re.compile(r"^/api/v1/coach/sessions/([^/]+)$")
TURN_PATH = re.compile(r"^/api/v1/coach/sessions/([^/]+)/turns$")
MAX_BODY_BYTES = 1_000_000


class CoachRequestHandler(BaseHTTPRequestHandler):
    service: CoachService
    career_service: CareerService
    auth_service: AuthService
    allowed_origins: set[str] = set()
    allow_demo_date = False

    server_version = "IsyouCoach/0.3"

    def do_OPTIONS(self) -> None:
        if not self._origin_allowed():
            self._write_error(403, "ORIGIN_NOT_ALLOWED", "当前前端地址不在允许列表中。", False)
            return
        self.send_response(204)
        self._cors_headers()
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header(
            "Access-Control-Allow-Headers", "Authorization, Content-Type, X-Coach-Date"
        )
        self.send_header("Access-Control-Max-Age", "600")
        self.end_headers()

    def do_GET(self) -> None:
        if not self._origin_allowed():
            self._write_error(403, "ORIGIN_NOT_ALLOWED", "当前前端地址不在允许列表中。", False)
            return
        try:
            if self.path == "/api/v1/health":
                self._write_json(
                    200,
                    {
                        "status": "ok",
                        "service": "isyou-coach",
                        "version": "0.3.0",
                        "features": {
                            "auth": True,
                            "quest_coach": True,
                            "career_adapter": True,
                            "occupation_count": self.career_service.matcher.occupation_count,
                        },
                    },
                )
                return
            if self.path == "/api/v1/auth/me":
                user = self._authenticate()
                self._write_json(200, {"user": user})
                return
            if self.path == "/api/v1/users/me/profile":
                user = self._authenticate()
                self._write_json(
                    200,
                    {
                        "user_id": user["user_id"],
                        "profile": self.auth_service.store.get_profile(user["user_id"]),
                    },
                )
                return
            match = SESSION_PATH.match(self.path)
            if match:
                user = self._authenticate()
                response = self.service.get_session(
                    match.group(1), self._now(), user_id=user["user_id"]
                )
                self._write_json(200, response)
                return
            self._write_error(404, "NOT_FOUND", "接口不存在。", False)
        except CoachError as error:
            self._write_error(error.status, error.code, error.message, error.retryable)
        except Exception:
            self._write_error(500, "INTERNAL_ERROR", "服务暂时无法处理请求。", True)

    def do_POST(self) -> None:
        if not self._origin_allowed():
            self._write_error(403, "ORIGIN_NOT_ALLOWED", "当前前端地址不在允许列表中。", False)
            return
        try:
            payload = self._read_json()
            if self.path == "/api/v1/auth/codes":
                response = self.auth_service.request_code(payload, self._now())
                self._write_json(201, response)
                return
            if self.path == "/api/v1/auth/register":
                response = self.auth_service.register(payload, self._now())
                self._write_json(201, response)
                return
            if self.path == "/api/v1/auth/login/password":
                response = self.auth_service.login_with_password(payload, self._now())
                self._write_json(200, response)
                return
            if self.path == "/api/v1/auth/login/code":
                response = self.auth_service.login_with_code(payload, self._now())
                self._write_json(200, response)
                return
            if self.path == "/api/v1/auth/logout":
                self._authenticate()
                self.auth_service.logout(self._bearer_token(), self._now())
                self._write_json(200, {"status": "logged_out"})
                return
            user = self._authenticate()
            if self.path == "/api/v1/career/evaluations":
                response = self.career_service.evaluate(
                    payload, self._now(), user_id=user["user_id"]
                )
                self._write_json(200, response)
                return
            if self.path == "/api/v1/career/coach-sessions":
                response = self.career_service.create_coach_session(
                    payload, self._now(), user_id=user["user_id"]
                )
                self._write_json(201, response)
                return
            if self.path == "/api/v1/coach/sessions":
                trusted_payload = {
                    **payload,
                    "user_id": user["user_id"],
                    "client_user_id": user["user_id"],
                }
                response = self.service.create_session(trusted_payload, self._now())
                self._write_json(201, response)
                return
            match = TURN_PATH.match(self.path)
            if match:
                response = self.service.handle_turn(
                    match.group(1), payload, self._now(), user_id=user["user_id"]
                )
                self._write_json(200, response)
                return
            self._write_error(404, "NOT_FOUND", "接口不存在。", False)
        except CoachError as error:
            self._write_error(error.status, error.code, error.message, error.retryable)
        except Exception:
            self._write_error(500, "INTERNAL_ERROR", "服务暂时无法处理请求。", True)

    def _read_json(self) -> dict[str, Any]:
        content_type = self.headers.get("Content-Type", "")
        if "application/json" not in content_type:
            raise InvalidRequest("Content-Type 必须是 application/json。")
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError as error:
            raise InvalidRequest("Content-Length 无效。") from error
        if length <= 0 or length > MAX_BODY_BYTES:
            raise InvalidRequest("请求体为空或超过大小限制。")
        try:
            payload = json.loads(self.rfile.read(length).decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError) as error:
            raise InvalidRequest("请求体不是有效 JSON。") from error
        if not isinstance(payload, dict):
            raise InvalidRequest("请求体必须是 JSON 对象。")
        return payload

    def _origin_allowed(self) -> bool:
        origin = self.headers.get("Origin")
        return not origin or origin in self.allowed_origins

    def _bearer_token(self) -> str | None:
        authorization = self.headers.get("Authorization", "")
        scheme, separator, token = authorization.partition(" ")
        if not separator or scheme.lower() != "bearer" or not token.strip():
            return None
        return token.strip()

    def _authenticate(self) -> dict[str, Any]:
        return self.auth_service.authenticate(self._bearer_token(), self._now())

    def _cors_headers(self) -> None:
        origin = self.headers.get("Origin")
        if origin and origin in self.allowed_origins:
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Vary", "Origin")

    def _write_json(self, status: int, payload: dict[str, Any]) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self._cors_headers()
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def _write_error(
        self,
        status: int,
        code: str,
        message: str,
        retryable: bool,
    ) -> None:
        self._write_json(
            status,
            {"error": {"code": code, "message": message, "retryable": retryable}},
        )

    def _now(self) -> datetime:
        current = datetime.now().astimezone()
        demo_date = self.headers.get("X-Coach-Date")
        if demo_date and self.allow_demo_date:
            try:
                parsed = date.fromisoformat(demo_date)
            except ValueError as error:
                raise InvalidRequest("X-Coach-Date 必须是 YYYY-MM-DD。") from error
            return datetime.combine(parsed, time(12, 0), tzinfo=current.tzinfo)
        return current

    def log_message(self, format: str, *args: Any) -> None:
        if os.environ.get("COACH_HTTP_LOG", "1") != "0":
            super().log_message(format, *args)


def build_server() -> ThreadingHTTPServer:
    backend_dir = Path(__file__).resolve().parent
    database_path = Path(
        os.environ.get("COACH_DATABASE_PATH", backend_dir / "data" / "coach.db")
    )
    host = os.environ.get("COACH_HOST", "127.0.0.1")
    port = int(os.environ.get("COACH_PORT", "8001"))
    origins = os.environ.get(
        "COACH_ALLOWED_ORIGINS",
        "http://127.0.0.1:8000,http://localhost:8000",
    )
    auth_store = SQLiteAuthStore(database_path)
    expose_dev_codes = os.environ.get("AUTH_DEV_SHOW_CODE", "1") == "1"
    if expose_dev_codes and host not in {"127.0.0.1", "localhost", "::1"}:
        raise RuntimeError("AUTH_DEV_SHOW_CODE=1 只能绑定本机地址。")
    CoachRequestHandler.auth_service = AuthService(
        auth_store,
        DevelopmentCodeDelivery(),
        expose_dev_codes=expose_dev_codes,
    )
    CoachRequestHandler.service = CoachService(SQLiteCoachStore(database_path))
    CoachRequestHandler.career_service = CareerService(
        CoachRequestHandler.service, profile_store=auth_store
    )
    CoachRequestHandler.allowed_origins = {item.strip() for item in origins.split(",") if item.strip()}
    CoachRequestHandler.allow_demo_date = os.environ.get("COACH_ALLOW_DEMO_DATE", "0") == "1"
    return ThreadingHTTPServer((host, port), CoachRequestHandler)


def main() -> None:
    server = build_server()
    host, port = server.server_address
    print(f"Isyou Coach API listening on http://{host}:{port}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
