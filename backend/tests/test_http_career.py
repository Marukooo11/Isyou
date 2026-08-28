from __future__ import annotations

import json
import tempfile
import threading
import unittest
import urllib.request
from http.server import ThreadingHTTPServer
from pathlib import Path

from career import CareerService
from coach import CoachService, SQLiteCoachStore
from server import CoachRequestHandler


ROOT = Path(__file__).resolve().parents[2]
FIXTURE = ROOT / "frontend" / "fixtures" / "profile-ready.json"


class CareerHttpFlowTest(unittest.TestCase):
    def setUp(self):
        self.tempdir = tempfile.TemporaryDirectory()
        coach = CoachService(SQLiteCoachStore(Path(self.tempdir.name) / "coach.db"))
        CoachRequestHandler.service = coach
        CoachRequestHandler.career_service = CareerService(coach)
        CoachRequestHandler.allowed_origins = set()
        CoachRequestHandler.allow_demo_date = True
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

    def post(self, path: str, payload: dict) -> tuple[int, dict]:
        request = urllib.request.Request(
            self.base_url + path,
            data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
            headers={"Content-Type": "application/json", "X-Coach-Date": "2026-08-28"},
            method="POST",
        )
        with urllib.request.urlopen(request, timeout=5) as response:
            return response.status, json.loads(response.read().decode("utf-8"))

    def test_profile_to_recommendation_to_gap_map_over_http(self):
        status, started = self.post(
            "/api/v1/career/coach-sessions",
            {
                "profile": self.profile,
                "client_user_id": "http-demo-user",
                "preferences": {"available_minutes": 30},
            },
        )
        self.assertEqual(status, 201)
        self.assertEqual(len(started["career_evaluation"]["recommended_occupations"]), 5)
        coach = started["coach"]
        self.assertEqual(coach["phase"], "onboarding")

        status, gap = self.post(
            f"/api/v1/coach/sessions/{coach['session_id']}/turns",
            {
                "request_id": "http-r1",
                "expected_state_version": coach["state_version"],
                "event": {"type": "answer_question", "message": "先确认差距"},
            },
        )
        self.assertEqual(status, 200)
        self.assertEqual(gap["phase"], "gap_analysis")
        self.assertEqual(gap["ui_blocks"][0]["type"], "gap_map")


if __name__ == "__main__":
    unittest.main()
