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


class SessionNotFound(CoachError):
    status = 404
    code = "SESSION_NOT_FOUND"


class StateConflict(CoachError):
    status = 409
    code = "STATE_CONFLICT"
    retryable = True

