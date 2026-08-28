class CoachError(Exception):
    """Base error converted to the public API error envelope."""

    status = 500
    code = "INTERNAL_ERROR"
    retryable = False

    def __init__(self, message: str):
        super().__init__(message)
        self.message = message


class InvalidRequest(CoachError):
    status = 400
    code = "INVALID_REQUEST"


class AuthenticationRequired(CoachError):
    status = 401
    code = "AUTH_REQUIRED"


class InvalidCredentials(CoachError):
    status = 401
    code = "INVALID_CREDENTIALS"


class AccountConflict(CoachError):
    status = 409
    code = "ACCOUNT_CONFLICT"


class RateLimited(CoachError):
    status = 429
    code = "RATE_LIMITED"
    retryable = True


class SessionNotFound(CoachError):
    status = 404
    code = "SESSION_NOT_FOUND"


class StateConflict(CoachError):
    status = 409
    code = "STATE_CONFLICT"
    retryable = True
