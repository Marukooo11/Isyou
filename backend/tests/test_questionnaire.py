from __future__ import annotations

import tempfile
import unittest
from copy import deepcopy
from datetime import datetime, timezone
from pathlib import Path

from auth import SQLiteAuthStore
from questionnaire import QUESTIONNAIRE_SCHEMA, QuestionnaireScorer, QuestionnaireService

from questionnaire_fixture import ready_questionnaire_answers


class QuestionnaireTest(unittest.TestCase):
    def setUp(self):
        self.now = datetime(2026, 8, 28, 9, 0, tzinfo=timezone.utc)
        self.answers = ready_questionnaire_answers()

    def test_schema_contains_35_questions_and_job_branch(self):
        self.assertEqual(QUESTIONNAIRE_SCHEMA["question_count"], 35)
        self.assertEqual(len({item["id"] for item in QUESTIONNAIRE_SCHEMA["questions"]}), 35)
        job_questions = [item for item in QUESTIONNAIRE_SCHEMA["questions"] if item["section"] == "job"]
        self.assertEqual(len(job_questions), 9)
        self.assertTrue(all(item["condition"]["question"] == "B7" for item in job_questions))

    def test_ready_answers_build_traceable_output1(self):
        profile = QuestionnaireScorer().build_profile(self.answers, self.now)

        self.assertEqual(profile["schema_version"], "output1.v1.0")
        self.assertTrue(profile["profile_status"]["job_matching_ready"])
        self.assertEqual(profile["profile_status"]["missing_critical_fields"], [])
        self.assertEqual(profile["job_search_profile"]["education"]["highest_level"], "bachelor")
        self.assertEqual(profile["job_search_profile"]["experiences"][0]["title"], "数据分析实习生")
        self.assertEqual(len(profile["job_search_profile"]["skills"]), 3)
        self.assertGreaterEqual(len(profile["evidence_units"]), 5)
        self.assertTrue(all(item["source_question_id"] for item in profile["evidence_units"]))
        self.assertIn("logical_mathematical", profile["intelligence_profile"])

    def test_not_looking_ignores_stale_job_answers(self):
        answers = deepcopy(self.answers)
        answers["B7"] = {"value": "not_now"}
        profile = QuestionnaireScorer().build_profile(answers, self.now)

        self.assertEqual(profile["profile_status"]["completion_level"], "psychological_only")
        self.assertFalse(profile["consent"]["can_use_for_job_matching"])
        self.assertEqual(profile["job_search_profile"]["experiences"], [])
        self.assertEqual(profile["job_search_profile"]["skills"], [])
        self.assertEqual(profile["meta"]["total_shown"], 26)
        self.assertEqual(profile["meta"]["answered"], 26)

    def test_draft_persists_and_profile_version_increments(self):
        with tempfile.TemporaryDirectory() as tempdir:
            store = SQLiteAuthStore(Path(tempdir) / "questionnaire.db")
            store.create_user({
                "user_id": "user-questionnaire", "username": "questionnaire_user",
                "contact_type": "email", "contact_value": "q@example.com",
                "password_salt": "salt", "password_hash": "hash",
                "created_at": self.now.isoformat(), "updated_at": self.now.isoformat(),
            })
            service = QuestionnaireService(store)
            saved = service.save_draft("user-questionnaire", {"answers": self.answers, "current_section": "job"}, self.now)
            self.assertEqual(saved["answers"]["B7"]["value"], "active")
            first = service.complete("user-questionnaire", {"answers": self.answers}, self.now)
            store.save_profile("user-questionnaire", first, self.now.isoformat())
            second = service.complete("user-questionnaire", {"answers": self.answers}, self.now)
            self.assertEqual(second["profile_id"], first["profile_id"])
            self.assertEqual(second["profile_version"], 2)


if __name__ == "__main__":
    unittest.main()
