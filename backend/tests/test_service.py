from __future__ import annotations

import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path

from coach import CoachService, SQLiteCoachStore
from coach.errors import StateConflict


def event(request_id: str, version: int, event_type: str, **extra):
    body = {
        "request_id": request_id,
        "expected_state_version": version,
        "event": {"type": event_type},
    }
    body["event"].update(extra)
    return body


class CoachServiceFlowTest(unittest.TestCase):
    def setUp(self):
        self.tempdir = tempfile.TemporaryDirectory()
        database = Path(self.tempdir.name) / "coach.db"
        self.service = CoachService(SQLiteCoachStore(database))
        self.day_one = datetime(2026, 8, 28, 9, 0, tzinfo=timezone.utc)
        self.context = {
            "client_user_id": "demo-user",
            "domain": "career",
            "career_context": {
                "selected_direction": {"id": "3d", "title": "3D 场景相关方向"},
                "target_requirements": [
                    {
                        "id": "portfolio",
                        "text": "需要可展示的建模或场景作品",
                        "source_ref": "source-1",
                    }
                ],
                "user_profile": {
                    "facts": ["学过建模", "有建筑学习经历"],
                    "evidence": [],
                    "constraints": [],
                },
            },
            "preferences": {"available_minutes": 30},
        }

    def tearDown(self):
        self.tempdir.cleanup()

    def test_complete_flow_reaches_next_day_dynamic_task(self):
        response = self.service.create_session(self.context, self.day_one)
        session_id = response["session_id"]
        self.assertEqual(response["phase"], "onboarding")
        self.assertEqual(response["ui_blocks"][0]["type"], "question")

        response = self.service.handle_turn(
            session_id,
            event("r1", response["state_version"], "answer_question", message="找到差距"),
            self.day_one,
        )
        self.assertEqual(response["phase"], "gap_analysis")
        self.assertEqual(response["ui_blocks"][0]["type"], "gap_map")

        response = self.service.handle_turn(
            session_id,
            event("r2", response["state_version"], "confirm_gap_map"),
            self.day_one,
        )
        self.assertEqual(response["phase"], "plan_review")

        response = self.service.handle_turn(
            session_id,
            event("r3", response["state_version"], "confirm_plan"),
            self.day_one,
        )
        self.assertEqual(response["phase"], "daily_learning")
        self.assertEqual(response["ui_blocks"][0]["type"], "daily_task")

        response = self.service.handle_turn(
            session_id,
            event(
                "r4",
                response["state_version"],
                "submit_result",
                message="找到了一张旧模型截图",
                evidence=[{"type": "note", "value": "旧截图"}],
            ),
            self.day_one,
        )
        self.assertEqual(response["phase"], "submission_review")
        self.assertEqual(response["ui_blocks"][0]["type"], "review")
        self.assertEqual(response["ui_blocks"][0]["data"]["reviewed_by"], "coach")
        self.assertEqual(response["workspace"]["outputs"][0]["status"], "reviewed")

        next_day = self.day_one + timedelta(days=1)
        response = self.service.get_session(session_id, next_day)
        self.assertEqual(response["phase"], "daily_learning")
        self.assertEqual(response["state_summary"]["current_day"], 2)
        self.assertEqual(response["ui_blocks"][0]["type"], "review")
        self.assertEqual(response["ui_blocks"][1]["type"], "daily_task")
        self.assertIn("断点", response["ui_blocks"][1]["data"]["title"])

    def test_coach_review_advances_when_submission_has_specific_process(self):
        response = self.service.create_session(self.context, self.day_one)
        session_id = response["session_id"]
        for request_id, event_type in [
            ("r1", "answer_question"),
            ("r2", "confirm_gap_map"),
            ("r3", "confirm_plan"),
        ]:
            response = self.service.handle_turn(
                session_id,
                event(request_id, response["state_version"], event_type),
                self.day_one,
            )
        response = self.service.handle_turn(
            session_id,
            event(
                "r4",
                response["state_version"],
                "submit_result",
                message="我找到旧模型截图，并写清了 Blender 建模步骤和最不确定的灯光部分。",
            ),
            self.day_one,
        )
        review = response["ui_blocks"][0]["data"]
        self.assertEqual(review["outcome"], "ready_to_transfer")
        next_day = self.day_one + timedelta(days=1)
        response = self.service.get_session(session_id, next_day)
        self.assertIn("变化", response["ui_blocks"][1]["data"]["title"])

    def test_blocker_reduces_task(self):
        response = self.service.create_session(self.context, self.day_one)
        session_id = response["session_id"]
        for request_id, event_type in [
            ("r1", "answer_question"),
            ("r2", "confirm_gap_map"),
            ("r3", "confirm_plan"),
        ]:
            response = self.service.handle_turn(
                session_id,
                event(request_id, response["state_version"], event_type),
                self.day_one,
            )
        response = self.service.handle_turn(
            session_id,
            event("r4", response["state_version"], "report_blocker", message="找不到旧文件"),
            self.day_one,
        )
        self.assertEqual(response["phase"], "daily_learning")
        self.assertLessEqual(response["ui_blocks"][0]["data"]["estimated_minutes"], 10)

    def test_idempotent_turn_and_version_conflict(self):
        response = self.service.create_session(self.context, self.day_one)
        session_id = response["session_id"]
        payload = event("same-id", response["state_version"], "answer_question")
        first = self.service.handle_turn(session_id, payload, self.day_one)
        replay = self.service.handle_turn(session_id, payload, self.day_one)
        self.assertEqual(first, replay)

        with self.assertRaises(StateConflict):
            self.service.handle_turn(
                session_id,
                event("new-id", 1, "confirm_gap_map"),
                self.day_one,
            )


if __name__ == "__main__":
    unittest.main()
