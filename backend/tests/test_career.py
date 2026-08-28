from __future__ import annotations

import json
import tempfile
import unittest
from copy import deepcopy
from datetime import datetime, timezone
from pathlib import Path

from career import CareerMatcher, CareerService
from coach import CoachService, SQLiteCoachStore
from coach.errors import InvalidRequest


ROOT = Path(__file__).resolve().parents[2]
FIXTURE = ROOT / "frontend" / "fixtures" / "profile-ready.json"


class CareerFlowTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.profile = json.loads(FIXTURE.read_text(encoding="utf-8"))
        cls.matcher = CareerMatcher()

    def setUp(self):
        self.tempdir = tempfile.TemporaryDirectory()
        store = SQLiteCoachStore(Path(self.tempdir.name) / "coach.db")
        self.coach_service = CoachService(store)
        self.service = CareerService(self.coach_service, matcher=self.matcher)
        self.now = datetime(2026, 8, 28, 9, 0, tzinfo=timezone.utc)

    def tearDown(self):
        self.tempdir.cleanup()

    def test_ready_profile_returns_five_directions_and_context(self):
        response = self.service.evaluate({"profile": deepcopy(self.profile)}, self.now)

        self.assertTrue(response["profile_status"]["job_matching_ready"])
        self.assertEqual(len(response["recommended_occupations"]), 5)
        self.assertEqual(response["library"]["occupation_count"], 642)
        self.assertEqual(response["boundary"]["result_type"], "occupation_direction_match")
        self.assertFalse(response["boundary"]["real_jd_filtering_completed"])
        self.assertIn("Big Five", response["boundary"]["scoring_note"])
        self.assertEqual(
            response["career_context"]["selected_direction"]["id"],
            response["recommended_occupations"][0]["occupation_id"],
        )
        self.assertTrue(response["career_context"]["target_requirements"])

    def test_missing_consent_returns_no_recommendations(self):
        profile = deepcopy(self.profile)
        profile["consent"]["can_use_for_job_matching"] = False

        response = self.service.evaluate({"profile": profile}, self.now)
        self.assertFalse(response["profile_status"]["job_matching_ready"])
        self.assertEqual(response["recommended_occupations"], [])
        self.assertIsNone(response["career_context"])
        self.assertIn(
            "consent.can_use_for_job_matching",
            response["profile_status"]["missing_critical_fields"],
        )
        with self.assertRaises(InvalidRequest):
            self.service.create_coach_session({"profile": profile}, self.now)

    def test_selected_direction_starts_coach_and_reaches_gap_map(self):
        evaluation = self.service.evaluate({"profile": deepcopy(self.profile)}, self.now)
        selected_id = evaluation["recommended_occupations"][2]["occupation_id"]
        response = self.service.create_coach_session(
            {
                "profile": deepcopy(self.profile),
                "selected_occupation_id": selected_id,
                "client_user_id": "career-demo",
                "preferences": {"available_minutes": 20},
            },
            self.now,
        )

        self.assertEqual(response["coach"]["phase"], "onboarding")
        self.assertEqual(
            response["career_evaluation"]["selected_occupation"]["occupation_id"],
            selected_id,
        )
        coach = response["coach"]
        gap = self.coach_service.handle_turn(
            coach["session_id"],
            {
                "request_id": "career-r1",
                "expected_state_version": coach["state_version"],
                "event": {"type": "answer_question", "message": "先看能力差距"},
            },
            self.now,
        )
        self.assertEqual(gap["phase"], "gap_analysis")
        self.assertEqual(gap["ui_blocks"][0]["type"], "gap_map")
        gap_items = gap["ui_blocks"][0]["data"]["items"]
        self.assertTrue(gap_items[0]["user_evidence_refs"])
        self.assertEqual(gap_items[1]["status"], "in_progress")


if __name__ == "__main__":
    unittest.main()
