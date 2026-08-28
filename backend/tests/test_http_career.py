from __future__ import annotations

import json
import tempfile
import threading
import unittest
import urllib.error
import urllib.request
from http.server import ThreadingHTTPServer
from pathlib import Path

from auth import AuthService, SQLiteAuthStore
from career import CareerService
from coach import CoachService, SQLiteCoachStore
from server import CoachRequestHandler
from questionnaire import QuestionnaireService

from questionnaire_fixture import ready_questionnaire_answers


ROOT = Path(__file__).resolve().parents[2]
FIXTURE = ROOT / "frontend" / "fixtures" / "profile-ready.json"


class CareerHttpFlowTest(unittest.TestCase):
    def setUp(self):
        self.tempdir = tempfile.TemporaryDirectory()
        database = Path(self.tempdir.name) / "coach.db"
        auth_store = SQLiteAuthStore(database)
        coach = CoachService(SQLiteCoachStore(database))
        CoachRequestHandler.auth_service = AuthService(
            auth_store, expose_dev_codes=True, resend_cooldown_seconds=0
        )
        CoachRequestHandler.service = coach
        CoachRequestHandler.career_service = CareerService(coach, profile_store=auth_store)
        CoachRequestHandler.questionnaire_service = QuestionnaireService(auth_store)
        CoachRequestHandler.allowed_origins = set()
        CoachRequestHandler.allow_demo_date = True
        CoachRequestHandler.frontend_dir = ROOT / "frontend"
        self.server = ThreadingHTTPServer(("127.0.0.1", 0), CoachRequestHandler)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        host, port = self.server.server_address
        self.base_url = f"http://{host}:{port}"
        self.profile = json.loads(FIXTURE.read_text(encoding="utf-8"))

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(timeout=2)
        self.tempdir.cleanup()

    def request(
        self, method: str, path: str, payload: dict | None = None, token: str | None = None
    ) -> tuple[int, dict]:
        headers = {"X-Coach-Date": "2026-08-28"}
        data = None
        if payload is not None:
            headers["Content-Type"] = "application/json"
            data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        if token:
            headers["Authorization"] = f"Bearer {token}"
        request = urllib.request.Request(
            self.base_url + path,
            data=data,
            headers=headers,
            method=method,
        )
        try:
            with urllib.request.urlopen(request, timeout=5) as response:
                return response.status, json.loads(response.read().decode("utf-8"))
        except urllib.error.HTTPError as error:
            return error.code, json.loads(error.read().decode("utf-8"))

    def post(self, path: str, payload: dict, token: str | None = None) -> tuple[int, dict]:
        return self.request("POST", path, payload, token)

    def register(self, email: str, username: str) -> dict:
        _, challenge = self.post(
            "/api/v1/auth/codes",
            {"purpose": "register", "contact_type": "email", "contact": email},
        )
        _, registered = self.post(
            "/api/v1/auth/register",
            {
                "challenge_id": challenge["challenge_id"],
                "code": challenge["dev_code"],
                "username": username,
                "password": "career123",
            },
        )
        return registered

    def test_profile_to_recommendation_to_gap_map_over_http(self):
        registered = self.register("http@example.com", "http_user")
        token = registered["access_token"]
        user_id = registered["user"]["user_id"]
        status, started = self.post(
            "/api/v1/career/coach-sessions",
            {
                "profile": self.profile,
                "client_user_id": "spoofed-user-id",
                "preferences": {"available_minutes": 30},
            },
            token,
        )
        self.assertEqual(status, 201)
        self.assertEqual(len(started["career_evaluation"]["recommended_occupations"]), 5)
        coach = started["coach"]
        self.assertEqual(coach["phase"], "onboarding")
        self.assertEqual(started["career_evaluation"]["user_id"], user_id)
        saved_state = CoachRequestHandler.service.store.get_session(coach["session_id"])
        self.assertEqual(saved_state["user_id"], user_id)
        self.assertEqual(
            CoachRequestHandler.auth_service.store.get_profile(user_id)["profile_id"],
            self.profile["profile_id"],
        )
        status, saved_profile = self.request(
            "GET", "/api/v1/users/me/profile", token=token
        )
        self.assertEqual(status, 200)
        self.assertEqual(saved_profile["user_id"], user_id)
        self.assertEqual(saved_profile["profile"]["profile_id"], self.profile["profile_id"])

        status, gap = self.post(
            f"/api/v1/coach/sessions/{coach['session_id']}/turns",
            {
                "request_id": "http-r1",
                "expected_state_version": coach["state_version"],
                "event": {"type": "answer_question", "message": "先确认差距"},
            },
            token,
        )
        self.assertEqual(status, 200)
        self.assertEqual(gap["phase"], "gap_analysis")
        self.assertEqual(gap["ui_blocks"][0]["type"], "gap_map")

        other = self.register("other@example.com", "other_user")
        status, denied = self.request(
            "GET",
            f"/api/v1/coach/sessions/{coach['session_id']}",
            token=other["access_token"],
        )
        self.assertEqual(status, 404)
        self.assertEqual(denied["error"]["code"], "SESSION_NOT_FOUND")

    def test_career_data_requires_login(self):
        status, denied = self.post(
            "/api/v1/career/evaluations", {"profile": self.profile}
        )
        self.assertEqual(status, 401)
        self.assertEqual(denied["error"]["code"], "AUTH_REQUIRED")

    def test_single_service_serves_frontend_and_allows_same_origin(self):
        request = urllib.request.Request(
            self.base_url + "/",
            headers={"Origin": self.base_url},
            method="GET",
        )
        with urllib.request.urlopen(request, timeout=5) as response:
            body = response.read().decode("utf-8")
            self.assertEqual(response.status, 200)
            self.assertIn("text/html", response.headers["Content-Type"])
            self.assertIn("Isyou", body)

        request = urllib.request.Request(
            self.base_url + "/api/v1/health",
            headers={"Origin": self.base_url},
            method="GET",
        )
        with urllib.request.urlopen(request, timeout=5) as response:
            payload = json.loads(response.read().decode("utf-8"))
            self.assertEqual(response.status, 200)
            self.assertEqual(payload["status"], "ok")

    def test_questionnaire_draft_to_profile_to_five_directions(self):
        registered = self.register("questionnaire@example.com", "questionnaire_http")
        token = registered["access_token"]
        answers = ready_questionnaire_answers()

        status, schema = self.request("GET", "/api/v1/questionnaire/schema")
        self.assertEqual(status, 200)
        self.assertEqual(schema["question_count"], 35)

        status, draft = self.post(
            "/api/v1/questionnaire/draft",
            {"answers": answers, "current_section": "job"},
            token,
        )
        self.assertEqual(status, 200)
        self.assertEqual(draft["status"], "in_progress")

        status, result = self.post(
            "/api/v1/questionnaire/complete",
            {"answers": answers},
            token,
        )
        self.assertEqual(status, 200)
        self.assertEqual(result["profile"]["schema_version"], "output1.v1.0")
        self.assertTrue(result["profile"]["profile_status"]["job_matching_ready"])
        self.assertEqual(len(result["career_evaluation"]["recommended_occupations"]), 5)
        self.assertEqual(
            CoachRequestHandler.auth_service.store.get_profile(
                registered["user"]["user_id"]
            )["profile_id"],
            result["profile"]["profile_id"],
        )


if __name__ == "__main__":
    unittest.main()
