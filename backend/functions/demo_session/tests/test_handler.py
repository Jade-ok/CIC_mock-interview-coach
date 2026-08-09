import json

from backend.functions.demo_session import handler
from backend.functions.shared.python import session_guard


def test_handler_returns_local_session_when_hosted_guard_is_disabled(monkeypatch):
    monkeypatch.setenv("HOSTED_GUARDRAILS_ENABLED", "false")

    response = handler.lambda_handler({"body": "{}"}, None)
    body = json.loads(response["body"])

    assert response["statusCode"] == 200
    assert body["session_token"] == session_guard.LOCAL_SESSION_TOKEN


def test_handler_preserves_safe_guard_error(monkeypatch):
    def reject(_event):
        raise session_guard.DailyLimitReached()

    monkeypatch.setattr(handler, "start_interview_session", reject)

    response = handler.lambda_handler({"body": "{}"}, None)
    body = json.loads(response["body"])

    assert response["statusCode"] == 429
    assert body["code"] == "DAILY_INTERVIEW_LIMIT_REACHED"
