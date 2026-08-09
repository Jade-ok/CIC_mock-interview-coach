"""Tests for the hosted voice-session URL service."""

import json
from urllib.parse import parse_qs, unquote, urlparse

from botocore.credentials import Credentials

from backend.functions.voice_session import handler


class _Session:
    def __init__(self, region_name):
        assert region_name == "us-east-1"

    def get_credentials(self):
        return Credentials("access", "secret", "token")


def test_generates_scoped_presigned_websocket_url(monkeypatch):
    runtime_arn = (
        "arn:aws:bedrock-agentcore:us-east-1:123456789012:"
        "runtime/example-runtime"
    )
    monkeypatch.setenv("AGENTCORE_RUNTIME_ARN", runtime_arn)
    monkeypatch.setenv("AWS_REGION", "us-east-1")
    monkeypatch.setattr(handler.boto3, "Session", _Session)

    response = handler.lambda_handler({}, None)
    payload = json.loads(response["body"])
    parsed = urlparse(payload["url"])
    query = parse_qs(parsed.query)

    assert response["statusCode"] == 200
    assert payload["expires_in"] == 300
    assert parsed.scheme == "wss"
    assert parsed.hostname == "bedrock-agentcore.us-east-1.amazonaws.com"
    assert unquote(parsed.path) == f"/runtimes/{runtime_arn}/ws"
    assert "X-Amzn-Bedrock-AgentCore-Runtime-Session-Id" in query
    assert query["X-Amz-Expires"] == ["300"]
    assert query["X-Amz-Security-Token"] == ["token"]


def test_missing_runtime_configuration_returns_error(monkeypatch):
    monkeypatch.delenv("AGENTCORE_RUNTIME_ARN", raising=False)

    response = handler.lambda_handler({}, None)

    assert response["statusCode"] == 500
    assert "AGENTCORE_RUNTIME_ARN" in json.loads(response["body"])["error"]
