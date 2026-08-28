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
from job_search import JobSearchService
from server import CoachRequestHandler
from questionnaire import QuestionnaireService

from questionnaire_fixture import ready_questionnaire_answers


ROOT = Path(__file__).resolve().parents[2]
FIXTURE = ROOT / "frontend" / "fixtures" / "profile-ready.json"


class FakeJobMatcherClient:
    def __init__(self):
        self.search_calls = []
        self.select_calls = []

    def search_candidates(self, payload):
        self.search_calls.append(payload)
        return {
            "status": "complete",
            "generated_at": "2026-08-28T12:00:00+08:00",
            "candidate_count": 5,
            "candidates": [
                {
                    "candidate_id": f"CANDIDATE-{index:03d}",
                    "title": "数据分析师" if index == 1 else f"岗位候选 {index}",
                    "company": f"演示公司 {index}",
                    "location": "上海",
                    "snippet": "公开岗位搜索摘要",
                    "source_url": f"https://jobs.example.com/{index}",
                    "source_type": "web_search_result",
                    "direction_id": "OCC-0001",
                    "direction_title": "数据分析",
                    "discovery_status": "search_result_unverified",
                }
                for index in range(1, 6)
            ],
            "warning": None,
        }

    def select_candidate(self, payload):
        self.select_calls.append(payload)
        candidate = payload["candidate"]
        selected_job = {
            "schema_version": "output2.jd.v1.0",
            "opportunity_id": "OPP-SELECTED",
            "title": candidate["title"],
            "company": candidate["company"],
            "location": candidate["location"],
            "work_mode": "hybrid",
            "employment_type": "全职",
            "compensation": "15k-20k",
            "status": "active",
            "published_at": "2026-08-27",
            "source_url": candidate["source_url"],
            "source_type": "structured_job_page",
            "verification_status": "verified",
            "retrieved_at": "2026-08-28T12:01:00+08:00",
            "direction_id": candidate["direction_id"],
            "direction_title": candidate["direction_title"],
            "tasks": ["整理业务数据", "制作分析报告"],
            "required": ["熟练使用 SQL", "能够独立完成数据分析"],
            "preferred": ["有实习经历"],
            "tools": ["SQL", "Excel"],
            "education_experience": ["本科及以上"],
            "schedule_location_collaboration": ["每周到岗三天"],
            "conditions": [
                {"condition": "travel", "status": "unknown_to_confirm"}
            ],
            "constraint_checks": [],
        }
        return {
            "status": "complete",
            "generated_at": "2026-08-28T12:01:00+08:00",
            "verification_status": "verified",
            "selected_job": selected_job,
            "file": {
                "filename": "jd_selected.md",
                "opportunity_id": "OPP-SELECTED",
                "content": "---\nschema_version: output2.jd.v1.0\n---\n# 数据分析师\n",
            },
        }


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
        self.job_matcher = FakeJobMatcherClient()
        CoachRequestHandler.job_search_service = JobSearchService(
            auth_store, coach, self.job_matcher
        )
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

    def test_questionnaire_to_real_jd_to_coach_over_http(self):
        registered = self.register("job-flow@example.com", "job_flow_user")
        token = registered["access_token"]
        answers = ready_questionnaire_answers()
        answers["J9"]["can_use_for_web_job_search"] = True
        status, completed = self.post(
            "/api/v1/questionnaire/complete", {"answers": answers}, token
        )
        self.assertEqual(status, 200)
        self.assertTrue(completed["profile"]["consent"]["can_use_for_web_job_search"])

        status, candidates = self.post(
            "/api/v1/job-search/candidates", {"market": "CN"}, token
        )
        self.assertEqual(status, 200)
        self.assertEqual(candidates["candidate_count"], 5)
        self.assertEqual(len(self.job_matcher.search_calls), 1)
        search_id = candidates["search_id"]

        other = self.register("job-other@example.com", "job_other_user")
        status, denied = self.post(
            "/api/v1/job-search/select",
            {"search_id": search_id, "candidate_id": "CANDIDATE-001"},
            other["access_token"],
        )
        self.assertEqual(status, 404)
        self.assertEqual(denied["error"]["code"], "JOB_SEARCH_NOT_FOUND")

        status, selected = self.post(
            "/api/v1/job-search/select",
            {"search_id": search_id, "candidate_id": "CANDIDATE-001"},
            token,
        )
        self.assertEqual(status, 200)
        self.assertEqual(selected["selected_job"]["schema_version"], "output2.jd.v1.0")
        self.assertEqual(selected["file"]["filename"], "jd_selected.md")

        status, state = self.request("GET", "/api/v1/job-search/state", token=token)
        self.assertEqual(status, 200)
        self.assertEqual(state["search"]["search_id"], search_id)
        self.assertEqual(state["selection"]["selection_id"], selected["selection_id"])

        status, handoff = self.post(
            "/api/v1/job-search/coach-sessions",
            {
                "selection_id": selected["selection_id"],
                "preferences": {"available_minutes": 20},
            },
            token,
        )
        self.assertEqual(status, 201)
        self.assertEqual(handoff["coach"]["phase"], "onboarding")
        self.assertEqual(
            handoff["career_context"]["selected_direction"]["title"],
            "数据分析师",
        )
        self.assertTrue(
            any(
                item["text"] == "熟练使用 SQL"
                for item in handoff["career_context"]["target_requirements"]
            )
        )
        saved = CoachRequestHandler.service.store.get_session(
            handoff["coach"]["session_id"]
        )
        self.assertEqual(saved["user_id"], registered["user"]["user_id"])

    def test_job_search_requires_explicit_web_consent(self):
        registered = self.register("no-web@example.com", "no_web_user")
        token = registered["access_token"]
        status, _ = self.post(
            "/api/v1/questionnaire/complete",
            {"answers": ready_questionnaire_answers()},
            token,
        )
        self.assertEqual(status, 200)
        status, denied = self.post(
            "/api/v1/job-search/candidates", {"market": "CN"}, token
        )
        self.assertEqual(status, 403)
        self.assertEqual(denied["error"]["code"], "WEB_SEARCH_NOT_AUTHORIZED")
        self.assertEqual(self.job_matcher.search_calls, [])


if __name__ == "__main__":
    unittest.main()
