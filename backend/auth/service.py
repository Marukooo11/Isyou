from __future__ import annotations

import hashlib
import hmac
import re
import secrets
import sqlite3
from datetime import datetime, timedelta
from typing import Any, Protocol
from uuid import uuid4

from coach.errors import (
    AccountConflict,
    AuthenticationRequired,
    InvalidCredentials,
    InvalidRequest,
    RateLimited,
)

from .storage import SQLiteAuthStore


EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
PHONE_RE = re.compile(r"^\+?[1-9]\d{7,14}$")
USERNAME_RE = re.compile(r"^[\w\-]{3,24}$", re.UNICODE)
CODE_RE = re.compile(r"^\d{6}$")
PASSWORD_ROUNDS = 310_000
CODE_ROUNDS = 80_000


class CodeDelivery(Protocol):
    def send(self, contact_type: str, contact_value: str, code: str, purpose: str) -> None: ...


class DevelopmentCodeDelivery:
    """No-op delivery used only when the API explicitly exposes dev codes."""

    def send(self, contact_type: str, contact_value: str, code: str, purpose: str) -> None:
        return None


class AuthService:
    def __init__(
        self,
        store: SQLiteAuthStore,
        delivery: CodeDelivery | None = None,
        *,
        expose_dev_codes: bool = False,
        code_ttl_minutes: int = 10,
        resend_cooldown_seconds: int = 60,
        session_ttl_days: int = 30,
    ):
        self.store = store
        self.delivery = delivery or DevelopmentCodeDelivery()
        self.expose_dev_codes = expose_dev_codes
        self.code_ttl = timedelta(minutes=code_ttl_minutes)
        self.resend_cooldown = timedelta(seconds=resend_cooldown_seconds)
        self.session_ttl = timedelta(days=session_ttl_days)

    def request_code(self, payload: dict[str, Any], now: datetime) -> dict[str, Any]:
        purpose = str(payload.get("purpose") or "").strip()
        if purpose not in {"register", "login"}:
            raise InvalidRequest("purpose 必须是 register 或 login。")
        contact_type, contact_value = self._normalize_contact(
            payload.get("contact_type"), payload.get("contact")
        )
        existing = self.store.get_user_by_contact(contact_value)
        if purpose == "register" and existing:
            raise AccountConflict("这个手机号或邮箱已经注册。")
        if purpose == "login" and not existing:
            raise InvalidCredentials("账号或验证码无效。")

        latest = self.store.latest_challenge(contact_value, purpose)
        if latest:
            created_at = datetime.fromisoformat(latest["created_at"])
            remaining = self.resend_cooldown - (now - created_at)
            if remaining.total_seconds() > 0:
                raise RateLimited(f"请在 {int(remaining.total_seconds()) + 1} 秒后重新获取验证码。")

        code = f"{secrets.randbelow(1_000_000):06d}"
        challenge_id = f"challenge-{uuid4()}"
        salt = secrets.token_hex(16)
        challenge = {
            "challenge_id": challenge_id,
            "purpose": purpose,
            "contact_type": contact_type,
            "contact_value": contact_value,
            "code_salt": salt,
            "code_hash": self._hash_secret(code, salt, CODE_ROUNDS),
            "expires_at": (now + self.code_ttl).isoformat(),
            "created_at": now.isoformat(),
        }
        self.store.create_challenge(challenge)
        self.delivery.send(contact_type, contact_value, code, purpose)
        response = {
            "challenge_id": challenge_id,
            "purpose": purpose,
            "delivery": {
                "contact_type": contact_type,
                "masked_contact": self._mask_contact(contact_type, contact_value),
            },
            "expires_at": challenge["expires_at"],
            "resend_after_seconds": int(self.resend_cooldown.total_seconds()),
        }
        if self.expose_dev_codes:
            response["dev_code"] = code
        return response

    def register(self, payload: dict[str, Any], now: datetime) -> dict[str, Any]:
        username = self._validate_username(payload.get("username"))
        password = self._validate_password(payload.get("password"))
        challenge = self._verify_challenge(
            payload.get("challenge_id"), payload.get("code"), "register", now
        )
        salt = secrets.token_hex(16)
        user = {
            "user_id": f"user-{uuid4()}",
            "username": username,
            "contact_type": challenge["contact_type"],
            "contact_value": challenge["contact_value"],
            "password_salt": salt,
            "password_hash": self._hash_secret(password, salt, PASSWORD_ROUNDS),
            "created_at": now.isoformat(),
            "updated_at": now.isoformat(),
        }
        try:
            created = self.store.create_user_with_challenge(
                user, challenge["challenge_id"], now.isoformat()
            )
        except sqlite3.IntegrityError as error:
            raise AccountConflict("用户名、手机号或邮箱已被使用。") from error
        if not created:
            raise InvalidCredentials("验证码已经使用，请重新获取。")
        return self._auth_response(user, now)

    def login_with_password(self, payload: dict[str, Any], now: datetime) -> dict[str, Any]:
        username = str(payload.get("username") or "").strip()
        password = str(payload.get("password") or "")
        user = self.store.get_user_by_username(username) if username else None
        if not user or not password or not hmac.compare_digest(
            user["password_hash"],
            self._hash_secret(password, user["password_salt"], PASSWORD_ROUNDS),
        ):
            raise InvalidCredentials("用户名或密码错误。")
        return self._auth_response(user, now)

    def login_with_code(self, payload: dict[str, Any], now: datetime) -> dict[str, Any]:
        challenge = self._verify_challenge(
            payload.get("challenge_id"), payload.get("code"), "login", now
        )
        user = self.store.get_user_by_contact(challenge["contact_value"])
        if not user or not self.store.consume_challenge(challenge["challenge_id"], now.isoformat()):
            raise InvalidCredentials("账号或验证码无效。")
        return self._auth_response(user, now)

    def authenticate(self, token: str | None, now: datetime) -> dict[str, Any]:
        if not token:
            raise AuthenticationRequired("请先注册或登录。")
        token_hash = hashlib.sha256(token.encode("utf-8")).hexdigest()
        session = self.store.get_auth_session(token_hash)
        if not session or session.get("revoked_at"):
            raise AuthenticationRequired("登录状态无效，请重新登录。")
        if datetime.fromisoformat(session["expires_at"]) <= now:
            raise AuthenticationRequired("登录已过期，请重新登录。")
        user = self.store.get_user(session["user_id"])
        if not user:
            raise AuthenticationRequired("账号不存在。")
        self.store.touch_auth_session(token_hash, now.isoformat())
        return self._public_user(user)

    def logout(self, token: str | None, now: datetime) -> None:
        if not token:
            raise AuthenticationRequired("当前没有登录会话。")
        self.store.revoke_auth_session(
            hashlib.sha256(token.encode("utf-8")).hexdigest(), now.isoformat()
        )

    def _verify_challenge(
        self,
        challenge_id_value: Any,
        code_value: Any,
        purpose: str,
        now: datetime,
    ) -> dict[str, Any]:
        challenge_id = str(challenge_id_value or "").strip()
        code = str(code_value or "").strip()
        if not challenge_id or not CODE_RE.fullmatch(code):
            raise InvalidCredentials("验证码无效。")
        challenge = self.store.get_challenge(challenge_id)
        if (
            not challenge
            or challenge["purpose"] != purpose
            or challenge.get("consumed_at")
            or challenge["attempts"] >= 5
            or datetime.fromisoformat(challenge["expires_at"]) <= now
        ):
            raise InvalidCredentials("验证码无效或已过期。")
        actual = self._hash_secret(code, challenge["code_salt"], CODE_ROUNDS)
        if not hmac.compare_digest(challenge["code_hash"], actual):
            self.store.increment_challenge_attempts(challenge_id)
            raise InvalidCredentials("验证码无效或已过期。")
        return challenge

    def _auth_response(self, user: dict[str, Any], now: datetime) -> dict[str, Any]:
        token = secrets.token_urlsafe(32)
        expires_at = now + self.session_ttl
        self.store.create_auth_session(
            {
                "token_hash": hashlib.sha256(token.encode("utf-8")).hexdigest(),
                "user_id": user["user_id"],
                "expires_at": expires_at.isoformat(),
                "created_at": now.isoformat(),
                "last_seen_at": now.isoformat(),
            }
        )
        return {
            "access_token": token,
            "token_type": "Bearer",
            "expires_at": expires_at.isoformat(),
            "user": self._public_user(user),
        }

    @staticmethod
    def _hash_secret(secret: str, salt_hex: str, rounds: int) -> str:
        return hashlib.pbkdf2_hmac(
            "sha256", secret.encode("utf-8"), bytes.fromhex(salt_hex), rounds
        ).hex()

    @staticmethod
    def _validate_username(value: Any) -> str:
        username = str(value or "").strip()
        if not USERNAME_RE.fullmatch(username):
            raise InvalidRequest("用户名需为 3—24 位中文、字母、数字、下划线或连字符。")
        return username

    @staticmethod
    def _validate_password(value: Any) -> str:
        password = str(value or "")
        if len(password) < 8 or len(password) > 128:
            raise InvalidRequest("密码长度需为 8—128 位。")
        if not re.search(r"[A-Za-z]", password) or not re.search(r"\d", password):
            raise InvalidRequest("密码至少包含一个字母和一个数字。")
        return password

    @staticmethod
    def _normalize_contact(contact_type_value: Any, contact_value: Any) -> tuple[str, str]:
        contact_type = str(contact_type_value or "").strip().lower()
        raw = str(contact_value or "").strip()
        if contact_type == "email":
            normalized = raw.lower()
            if not EMAIL_RE.fullmatch(normalized):
                raise InvalidRequest("邮箱格式无效。")
            return contact_type, normalized
        if contact_type == "phone":
            normalized = re.sub(r"[\s()\-]", "", raw)
            if not PHONE_RE.fullmatch(normalized):
                raise InvalidRequest("手机号格式无效，请使用 8—15 位号码，可带国家区号。")
            return contact_type, normalized
        raise InvalidRequest("contact_type 必须是 email 或 phone。")

    @staticmethod
    def _mask_contact(contact_type: str, contact_value: str) -> str:
        if contact_type == "email":
            local, domain = contact_value.split("@", 1)
            visible = local[:2] if len(local) > 2 else local[:1]
            return f"{visible}***@{domain}"
        return f"{contact_value[:3]}****{contact_value[-4:]}"

    @staticmethod
    def _public_user(user: dict[str, Any]) -> dict[str, Any]:
        return {
            "user_id": user["user_id"],
            "username": user["username"],
            "contact_type": user["contact_type"],
            "masked_contact": AuthService._mask_contact(
                user["contact_type"], user["contact_value"]
            ),
            "created_at": user["created_at"],
        }
