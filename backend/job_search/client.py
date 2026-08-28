from __future__ import annotations

import json
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urlsplit
from urllib.request import Request, urlopen

from coach.errors import CoachError


class JobSearchError(CoachError):
    """Safe public error returned by the internal job-matcher service."""

    def __init__(
        self,
        code: str,
        message: str,
        status: int = 502,
        retryable: bool = False,
    ):
        super().__init__(message)
        self.code = code
        self.status = status
        self.retryable = retryable


class JobMatcherClient:
    def __init__(self, base_url: str, timeout_seconds: float = 90):
        normalized = str(base_url or "").rstrip("/")
        parsed = urlsplit(normalized)
        if parsed.scheme not in {"http", "https"} or not parsed.netloc:
            raise ValueError("JOB_MATCHER_BASE_URL 必须是有效的 http/https 地址。")
        self.base_url = normalized
        self.timeout_seconds = timeout_seconds

    def search_candidates(self, payload: dict[str, Any]) -> dict[str, Any]:
        return self._post("/api/job-search/candidates", payload)

    def select_candidate(self, payload: dict[str, Any]) -> dict[str, Any]:
        return self._post("/api/job-search/select", payload)

    def _post(self, path: str, payload: dict[str, Any]) -> dict[str, Any]:
        request = Request(
            self.base_url + path,
            data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
            headers={"Content-Type": "application/json", "Accept": "application/json"},
            method="POST",
        )
        try:
            with urlopen(request, timeout=self.timeout_seconds) as response:
                result = json.loads(response.read().decode("utf-8"))
        except HTTPError as error:
            try:
                body = json.loads(error.read().decode("utf-8"))
                public = body.get("error") or {}
            except (UnicodeDecodeError, json.JSONDecodeError):
                public = {}
            code = str(public.get("code") or "JOB_MATCHER_ERROR")
            message = str(public.get("message") or "真实岗位服务拒绝了请求。")
            retryable = error.code >= 500 or code in {
                "SEARCH_PROVIDER_UNAVAILABLE",
                "PROVIDER_TIMEOUT",
            }
            raise JobSearchError(code, message, error.code, retryable) from error
        except (URLError, TimeoutError, OSError) as error:
            raise JobSearchError(
                "JOB_MATCHER_UNAVAILABLE",
                "真实岗位服务暂时不可用，请稍后重试。",
                502,
                True,
            ) from error
        except (UnicodeDecodeError, json.JSONDecodeError) as error:
            raise JobSearchError(
                "JOB_MATCHER_INVALID_RESPONSE",
                "真实岗位服务返回了无效数据。",
                502,
                True,
            ) from error
        if not isinstance(result, dict):
            raise JobSearchError(
                "JOB_MATCHER_INVALID_RESPONSE",
                "真实岗位服务返回了无效数据。",
                502,
                True,
            )
        return result
