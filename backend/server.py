#!/usr/bin/env python3
from __future__ import annotations

import json
import mimetypes
import os
import re
from datetime import date, datetime, time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from urllib.parse import unquote, urlsplit

from auth import AuthService, DevelopmentCodeDelivery, SQLiteAuthStore
from career import CareerService
from coach import CoachService, SQLiteCoachStore
from coach.errors import CoachError, InvalidRequest
from questionnaire import QuestionnaireService


SESSION_PATH = re.compile(r"^/api/v1/coach/sessions/([^/]+)$")
TURN_PATH = re.compile(r"^/api/v1/coach/sessions/([^/]+)/turns$")
MAX_BODY_BYTES = 1_000_000


class CoachRequestHandler(BaseHTTPRequestHandler):
    service: CoachService
    career_service: CareerService
    auth_service: AuthService
    questionnaire_service: QuestionnaireService
    allowed_origins: set[str] = set()
    allow_demo_date = False
    frontend_dir: Path | None = None

    server_version = "IsyouCoach/0.4"

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
            request_path = urlsplit(self.path).path
            if request_path == "/api/v1/health":
                self._write_json(
                    200,
                    {
                        "status": "ok",
                        "service": "isyou-coach",
                        "version": "0.4.0",
                        "features": {
                            "auth": True,
                            "quest_coach": True,
                            "career_adapter": True,
                            "questionnaire": True,
                            "occupation_count": self.career_service.matcher.occupation_count,
                        },
                    },
                )
                return
            if request_path == "/api/v1/questionnaire/schema":
                self._write_json(200, self.questionnaire_service.schema())
                return
            if request_path == "/api/v1/auth/me":
                user = self._authenticate()
                self._write_json(200, {"user": user})
                return
            if request_path == "/api/v1/users/me/profile":
                user = self._authenticate()
                self._write_json(
                    200,
                    {
                        "user_id": user["user_id"],
                        "profile": self.auth_service.store.get_profile(user["user_id"]),
                    },
                )
                return
            if request_path == "/api/v1/questionnaire/draft":
                user = self._authenticate()
                self._write_json(200, self.questionnaire_service.get_draft(user["user_id"]))
                return
            match = SESSION_PATH.match(request_path)
            if match:
                user = self._authenticate()
                response = self.service.get_session(
                    match.group(1), self._now(), user_id=user["user_id"]
                )
                self._write_json(200, response)
                return
            if not request_path.startswith("/api/") and self._write_static(request_path):
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
            request_path = urlsplit(self.path).path
            if request_path == "/api/v1/auth/codes":
                response = self.auth_service.request_code(payload, self._now())
                self._write_json(201, response)
                return
            if request_path == "/api/v1/auth/register":
                response = self.auth_service.register(payload, self._now())
                self._write_json(201, response)
                return
            if request_path == "/api/v1/auth/login/password":
                response = self.auth_service.login_with_password(payload, self._now())
                self._write_json(200, response)
                return
            if request_path == "/api/v1/auth/login/code":
                response = self.auth_service.login_with_code(payload, self._now())
                self._write_json(200, response)
                return
            if request_path == "/api/v1/auth/logout":
                self._authenticate()
                self.auth_service.logout(self._bearer_token(), self._now())
                self._write_json(200, {"status": "logged_out"})
                return
            user = self._authenticate()
            if request_path == "/api/v1/questionnaire/draft":
                response = self.questionnaire_service.save_draft(
                    user["user_id"], payload, self._now()
                )
                self._write_json(200, response)
                return
            if request_path == "/api/v1/questionnaire/complete":
                profile = self.questionnaire_service.complete(
                    user["user_id"], payload, self._now()
                )
                evaluation = self.career_service.evaluate(
                    {"profile": profile}, self._now(), user_id=user["user_id"]
                )
                self._write_json(
                    200,
                    {
                        "schema_version": "questionnaire-result.v1",
                        "profile": self.auth_service.store.get_profile(user["user_id"]),
                        "career_evaluation": evaluation,
                    },
                )
                return
            if request_path == "/api/v1/career/evaluations":
                response = self.career_service.evaluate(
                    payload, self._now(), user_id=user["user_id"]
                )
                self._write_json(200, response)
                return
            if request_path == "/api/v1/career/coach-sessions":
                response = self.career_service.create_coach_session(
                    payload, self._now(), user_id=user["user_id"]
                )
                self._write_json(201, response)
                return
            if request_path == "/api/v1/coach/sessions":
                trusted_payload = {
                    **payload,
                    "user_id": user["user_id"],
                    "client_user_id": user["user_id"],
                }
                response = self.service.create_session(trusted_payload, self._now())
                self._write_json(201, response)
                return
            match = TURN_PATH.match(request_path)
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
        if not origin or origin in self.allowed_origins:
            return True
        host = self.headers.get("Host")
        forwarded_proto = self.headers.get("X-Forwarded-Proto", "").split(",", 1)[0].strip()
        scheme = forwarded_proto or "http"
        return bool(host and origin == f"{scheme}://{host}")

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

    def _write_static(self, request_path: str) -> bool:
        root = self.frontend_dir
        if root is None:
            return False
        relative = unquote(request_path).lstrip("/") or "index.html"
        candidate = (root / relative).resolve()
        try:
            candidate.relative_to(root.resolve())
        except ValueError:
            return False
        if candidate.is_dir():
            candidate = candidate / "index.html"
        if not candidate.is_file():
            return False
        body = candidate.read_bytes()
        content_type = mimetypes.guess_type(candidate.name)[0] or "application/octet-stream"
        if content_type.startswith("text/") or content_type in {
            "application/javascript",
            "application/json",
        }:
            content_type += "; charset=utf-8"
        self.send_response(200)
        self._cors_headers()
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-cache" if candidate.suffix == ".html" else "public, max-age=300")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "same-origin")
        self.end_headers()
        self.wfile.write(body)
        return True

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
    repo_dir = backend_dir.parent
    database_path = Path(
        os.environ.get("COACH_DATABASE_PATH", backend_dir / "data" / "coach.db")
    )
    platform_port = os.environ.get("PORT")
    host = os.environ.get("COACH_HOST", "0.0.0.0" if platform_port else "127.0.0.1")
    port = int(platform_port or os.environ.get("COACH_PORT") or "8001")
    origins = os.environ.get(
        "COACH_ALLOWED_ORIGINS",
        "http://127.0.0.1:8000,http://localhost:8000",
    )
    auth_store = SQLiteAuthStore(database_path)
    demo_auth = os.environ.get("AUTH_DEMO_MODE", "0") == "1"
    expose_dev_codes = demo_auth or os.environ.get("AUTH_DEV_SHOW_CODE", "1") == "1"
    if expose_dev_codes and host not in {"127.0.0.1", "localhost", "::1"} and not demo_auth:
        raise RuntimeError("公开地址显示验证码必须显式设置 AUTH_DEMO_MODE=1。")
    CoachRequestHandler.auth_service = AuthService(
        auth_store,
        DevelopmentCodeDelivery(),
        expose_dev_codes=expose_dev_codes,
    )
    CoachRequestHandler.service = CoachService(SQLiteCoachStore(database_path))
    CoachRequestHandler.questionnaire_service = QuestionnaireService(auth_store)
    CoachRequestHandler.career_service = CareerService(
        CoachRequestHandler.service, profile_store=auth_store
    )
    CoachRequestHandler.allowed_origins = {item.strip() for item in origins.split(",") if item.strip()}
    CoachRequestHandler.allow_demo_date = os.environ.get("COACH_ALLOW_DEMO_DATE", "0") == "1"
    CoachRequestHandler.frontend_dir = (
        repo_dir / "frontend" if os.environ.get("COACH_SERVE_FRONTEND", "1") == "1" else None
    )
    return ThreadingHTTPServer((host, port), CoachRequestHandler)


def main() -> None:
    server = build_server()
    host, port = server.server_address
    print(f"Isyou demo listening on http://{host}:{port}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
