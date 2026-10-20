"""One error type for the whole API: a status, a stable code for the app, and a translated message."""


class ApiError(Exception):
    def __init__(self, status: int, code: str, **extra):
        super().__init__(code)
        self.status = status
        self.code = code
        self.extra = extra


def bad(code: str = "invalid", **extra) -> ApiError:
    return ApiError(400, code, **extra)


def not_found(code: str = "not_found") -> ApiError:
    return ApiError(404, code)
