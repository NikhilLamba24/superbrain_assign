class AppError(Exception):
    status_code = 400
    code = "app_error"
    message = "Something went wrong"

    def __init__(self, message: str | None = None):
        super().__init__(message or self.message)
        if message:
            self.message = message


class SessionConflictError(AppError):
    status_code = 409
    code = "session_conflict"
    message = "This username is already editing. Please choose another username."


class SessionExpiredError(AppError):
    status_code = 401
    code = "session_expired"
    message = "Your session has expired. Please rejoin."


class NotFoundError(AppError):
    status_code = 404
    code = "not_found"
    message = "Not found."


class GenerationError(AppError):
    status_code = 502
    code = "generation_failed"
    message = "Image generation failed. Please try again."
