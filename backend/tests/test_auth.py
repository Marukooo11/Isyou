from __future__ import annotations

import hashlib
import re
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path

from auth import AuthService, SQLiteAuthStore
from coach.errors import AccountConflict, AuthenticationRequired, InvalidCredentials


class AuthServiceTest(unittest.TestCase):
    def setUp(self):
        self.tempdir = tempfile.TemporaryDirectory()
        self.store = SQLiteAuthStore(Path(self.tempdir.name) / "auth.db")
        self.service = AuthService(
            self.store,
            expose_dev_codes=True,
            resend_cooldown_seconds=0,
        )
        self.now = datetime(2026, 8, 28, 10, 0, tzinfo=timezone.utc)

    def tearDown(self):
        self.tempdir.cleanup()

    def register(self, contact_type="email", contact="demo@example.com", username="demo_user"):
        challenge = self.service.request_code(
            {"purpose": "register", "contact_type": contact_type, "contact": contact},
            self.now,
        )
        return self.service.register(
            {
                "challenge_id": challenge["challenge_id"],
                "code": challenge["dev_code"],
                "username": username,
                "password": "career123",
            },
            self.now,
        )

    def test_email_register_password_and_code_login_keep_same_user_id(self):
        registered = self.register()
        user_id = registered["user"]["user_id"]
        stored_user = self.store.get_user(user_id)
        self.assertNotEqual(stored_user["password_hash"], "career123")
        self.assertIsNotNone(
            self.store.get_auth_session(
                hashlib.sha256(registered["access_token"].encode("utf-8")).hexdigest()
            )
        )
        self.assertEqual(
            self.service.authenticate(registered["access_token"], self.now)["user_id"],
            user_id,
        )

        password_login = self.service.login_with_password(
            {"username": "DEMO_USER", "password": "career123"}, self.now
        )
        self.assertEqual(password_login["user"]["user_id"], user_id)

        challenge = self.service.request_code(
            {"purpose": "login", "contact_type": "email", "contact": "DEMO@example.com"},
            self.now,
        )
        self.assertRegex(challenge["dev_code"], re.compile(r"^\d{6}$"))
        code_login = self.service.login_with_code(
            {"challenge_id": challenge["challenge_id"], "code": challenge["dev_code"]},
            self.now,
        )
        self.assertEqual(code_login["user"]["user_id"], user_id)

    def test_phone_register_duplicate_and_logout(self):
        registered = self.register("phone", "+8613812345678", "phone_user")
        self.assertEqual(registered["user"]["contact_type"], "phone")
        with self.assertRaises(AccountConflict):
            self.service.request_code(
                {
                    "purpose": "register",
                    "contact_type": "phone",
                    "contact": "+86 138-1234-5678",
                },
                self.now,
            )
        self.service.logout(registered["access_token"], self.now)
        with self.assertRaises(AuthenticationRequired):
            self.service.authenticate(registered["access_token"], self.now)

    def test_wrong_or_expired_code_is_rejected(self):
        challenge = self.service.request_code(
            {"purpose": "register", "contact_type": "email", "contact": "late@example.com"},
            self.now,
        )
        with self.assertRaises(InvalidCredentials):
            self.service.register(
                {
                    "challenge_id": challenge["challenge_id"],
                    "code": "000000" if challenge["dev_code"] != "000000" else "999999",
                    "username": "late_user",
                    "password": "career123",
                },
                self.now,
            )
        with self.assertRaises(InvalidCredentials):
            self.service.register(
                {
                    "challenge_id": challenge["challenge_id"],
                    "code": challenge["dev_code"],
                    "username": "late_user",
                    "password": "career123",
                },
                self.now + timedelta(minutes=11),
            )


if __name__ == "__main__":
    unittest.main()
