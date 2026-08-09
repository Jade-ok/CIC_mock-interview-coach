import asyncio
import json
import os

from backend import local_server


def response_json(response) -> dict:
    return json.loads(response.body.decode("utf-8"))


def test_local_entry_point_disables_hosted_guardrails():
    assert os.environ["HOSTED_GUARDRAILS_ENABLED"] == "false"


def test_local_interviewer_reads_repository_config():
    response = local_server._build_local_interviewer_response(
        {"analyst_output": {"candidate_profile": {"candidate_level": "student"}}}
    )

    assert response["statusCode"] == 200
    body = json.loads(response["body"])
    assert body["success"] is True
    assert "[INTERVIEW STRUCTURE]" in body["runtime_context"]
    assert "[INTERVIEW PROFILE]" in body["runtime_context"]


def test_local_interviewer_preserves_validation_envelope():
    response = local_server._build_local_interviewer_response({})

    assert response["statusCode"] == 200
    assert json.loads(response["body"])["success"] is False


def test_local_lambda_adapter_uses_function_url_event(monkeypatch):
    captured = {}

    def fake_handler(event, context):
        captured["event"] = event
        captured["context"] = context
        return {"statusCode": 201, "body": json.dumps({"ok": True})}

    monkeypatch.setattr(local_server, "_lambda_handler", lambda *_: fake_handler)
    response = asyncio.run(local_server._invoke("module", "handler", {"value": 7}))

    assert response.status_code == 201
    assert response_json(response) == {"ok": True}
    assert json.loads(captured["event"]["body"]) == {"value": 7}
    assert captured["context"] is None


def test_identity_check_rejects_missing_credentials(monkeypatch):
    class FakeSession:
        def get_credentials(self):
            return None

    monkeypatch.setattr(local_server.boto3, "Session", FakeSession)

    try:
        local_server._active_aws_identity()
    except RuntimeError as exc:
        assert "No AWS credentials found" in str(exc)
    else:
        raise AssertionError("Expected missing credentials to fail local startup")


def test_identity_check_uses_the_active_boto3_session(monkeypatch):
    calls = {}

    class FakeStsClient:
        def get_caller_identity(self):
            return {"Account": "123456789012", "Arn": "arn:aws:iam::123456789012:user/local"}

    class FakeSession:
        region_name = "us-west-2"

        def get_credentials(self):
            return object()

        def client(self, service, region_name):
            calls.update(service=service, region_name=region_name)
            return FakeStsClient()

    monkeypatch.setattr(local_server.boto3, "Session", FakeSession)

    identity = local_server._active_aws_identity()

    assert calls == {"service": "sts", "region_name": "us-west-2"}
    assert identity["Account"] == "123456789012"
