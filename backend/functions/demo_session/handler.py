"""Issue short-lived hosted interview session tokens."""

import json

try:
    from session_guard import SessionGuardError, error_response, start_interview_session
except ImportError:
    try:
        from backend.functions.shared.python.session_guard import (
            SessionGuardError, error_response, start_interview_session,
        )
    except ImportError:
        from shared.python.session_guard import (
            SessionGuardError, error_response, start_interview_session,
        )


def lambda_handler(event: dict, _context) -> dict:
    try:
        session = start_interview_session(event)
        return {
            "statusCode": 200,
            "headers": {"Content-Type": "application/json"},
            "body": json.dumps(session),
        }
    except SessionGuardError as exc:
        return error_response(exc)
