import hashlib
import json

import pytest
from botocore.exceptions import ClientError

from backend.functions.shared.python import session_guard


def hosted_env(monkeypatch):
    monkeypatch.setenv("HOSTED_GUARDRAILS_ENABLED", "true")
    monkeypatch.setenv("HOSTED_SESSION_TABLE", "sessions")
    monkeypatch.setenv("HOSTED_DAILY_INTERVIEW_LIMIT", "100")
    monkeypatch.setenv("HOSTED_DAILY_VIEWER_LIMIT", "5")


def hosted_event(payload=None, address="198.51.100.10:46532"):
    return {
        "headers": {"CloudFront-Viewer-Address": address},
        "body": json.dumps(payload or {}),
    }


def test_local_mode_is_unlimited(monkeypatch):
    monkeypatch.setenv("HOSTED_GUARDRAILS_ENABLED", "false")
    monkeypatch.setattr(session_guard, "_dynamodb_client", None)

    created = session_guard.start_interview_session({})
    session_guard.authorize_stage({}, "analyst")

    assert created["session_token"] == session_guard.LOCAL_SESSION_TOKEN
    assert session_guard._dynamodb_client is None


def test_hosted_session_uses_hashed_token_and_viewer(monkeypatch):
    hosted_env(monkeypatch)

    class FakeClient:
        def __init__(self):
            self.transaction = None

        def transact_write_items(self, **kwargs):
            self.transaction = kwargs

    client = FakeClient()
    monkeypatch.setattr(session_guard, "_dynamodb_client", client)
    monkeypatch.setattr(session_guard.secrets, "token_urlsafe", lambda _: "opaque-token")
    monkeypatch.setattr(session_guard.time, "time", lambda: 1_800_000_000)

    result = session_guard.start_interview_session(hosted_event())

    assert result["session_token"] == "opaque-token"
    put_item = client.transaction["TransactItems"][2]["Put"]["Item"]
    assert put_item["pk"]["S"] == "session#" + hashlib.sha256(
        b"opaque-token"
    ).hexdigest()
    assert "opaque-token" not in json.dumps(client.transaction)
    assert put_item["viewer_hash"]["S"] == hashlib.sha256(
        b"198.51.100.10"
    ).hexdigest()


def test_global_daily_limit_returns_429(monkeypatch):
    hosted_env(monkeypatch)

    class FakeClient:
        def transact_write_items(self, **_kwargs):
            raise ClientError(
                {"Error": {"Code": "TransactionCanceledException", "Message": "cancelled"}},
                "TransactWriteItems",
            )

        def get_item(self, **kwargs):
            key = kwargs["Key"]["pk"]["S"]
            count = "100" if key.startswith("daily#") else "0"
            return {"Item": {"count": {"N": count}}}

    monkeypatch.setattr(session_guard, "_dynamodb_client", FakeClient())

    with pytest.raises(session_guard.DailyLimitReached) as error:
        session_guard.start_interview_session(hosted_event())

    assert error.value.status_code == 429


def test_viewer_limit_returns_429(monkeypatch):
    hosted_env(monkeypatch)

    class FakeClient:
        def transact_write_items(self, **_kwargs):
            raise ClientError(
                {"Error": {"Code": "TransactionCanceledException", "Message": "cancelled"}},
                "TransactWriteItems",
            )

        def get_item(self, **kwargs):
            key = kwargs["Key"]["pk"]["S"]
            count = "5" if key.startswith("viewer#") else "0"
            return {"Item": {"count": {"N": count}}}

    monkeypatch.setattr(session_guard, "_dynamodb_client", FakeClient())

    with pytest.raises(session_guard.ViewerLimitReached):
        session_guard.start_interview_session(hosted_event())


def test_stage_authorization_is_ip_bound_and_bounded(monkeypatch):
    hosted_env(monkeypatch)

    class FakeClient:
        def __init__(self):
            self.update = None

        def update_item(self, **kwargs):
            self.update = kwargs

    client = FakeClient()
    monkeypatch.setattr(session_guard, "_dynamodb_client", client)
    monkeypatch.setattr(session_guard.time, "time", lambda: 1_800_000_000)

    session_guard.authorize_stage(
        hosted_event({"session_token": "opaque-token"}), "voice_session"
    )

    assert client.update["Key"]["pk"]["S"].startswith("session#")
    assert client.update["ExpressionAttributeValues"][":limit"] == {"N": "3"}
    assert client.update["ExpressionAttributeValues"][":viewer"] == {
        "S": hashlib.sha256(b"198.51.100.10").hexdigest()
    }


def test_hosted_stage_rejects_missing_token_before_dynamodb(monkeypatch):
    hosted_env(monkeypatch)
    monkeypatch.setattr(session_guard, "_dynamodb_client", None)

    with pytest.raises(session_guard.InvalidSession):
        session_guard.authorize_stage(hosted_event({}), "analyst")

    assert session_guard._dynamodb_client is None


def test_hosted_session_rejects_missing_cloudfront_viewer_address(monkeypatch):
    hosted_env(monkeypatch)

    with pytest.raises(session_guard.SessionGuardError) as error:
        session_guard.start_interview_session({"headers": {}, "body": "{}"})

    assert error.value.status_code == 403


@pytest.mark.parametrize(
    ("item", "expected_error"),
    [
        ({}, session_guard.InvalidSession),
        (
            {
                "pk": {"S": "session#digest"},
                "viewer_hash": {"S": hashlib.sha256(b"203.0.113.9").hexdigest()},
                "expires_at": {"N": "1800000100"},
            },
            session_guard.InvalidSession,
        ),
        (
            {
                "pk": {"S": "session#digest"},
                "viewer_hash": {"S": hashlib.sha256(b"198.51.100.10").hexdigest()},
                "expires_at": {"N": "1800000000"},
            },
            session_guard.InvalidSession,
        ),
        (
            {
                "pk": {"S": "session#digest"},
                "viewer_hash": {"S": hashlib.sha256(b"198.51.100.10").hexdigest()},
                "expires_at": {"N": "1800000100"},
            },
            session_guard.StageLimitReached,
        ),
    ],
)
def test_failed_stage_claim_distinguishes_invalid_from_exhausted(
    monkeypatch, item, expected_error
):
    hosted_env(monkeypatch)

    class FakeClient:
        def update_item(self, **_kwargs):
            raise ClientError(
                {
                    "Error": {
                        "Code": "ConditionalCheckFailedException",
                        "Message": "condition failed",
                    }
                },
                "UpdateItem",
            )

        def get_item(self, **_kwargs):
            return {"Item": item}

    monkeypatch.setattr(session_guard, "_dynamodb_client", FakeClient())
    monkeypatch.setattr(session_guard.time, "time", lambda: 1_800_000_000)

    with pytest.raises(expected_error):
        session_guard.authorize_stage(
            hosted_event({"session_token": "opaque-token"}), "analyst"
        )


def test_ipv6_viewer_address_is_normalized_before_hashing(monkeypatch):
    hosted_env(monkeypatch)

    class FakeClient:
        def __init__(self):
            self.transaction = None

        def transact_write_items(self, **kwargs):
            self.transaction = kwargs

    client = FakeClient()
    monkeypatch.setattr(session_guard, "_dynamodb_client", client)
    monkeypatch.setattr(session_guard.secrets, "token_urlsafe", lambda _: "opaque-token")

    session_guard.start_interview_session(
        hosted_event(address="[2001:db8:0:0:0:0:0:1]:443")
    )

    put_item = client.transaction["TransactItems"][2]["Put"]["Item"]
    assert put_item["viewer_hash"]["S"] == hashlib.sha256(
        b"2001:db8::1"
    ).hexdigest()
