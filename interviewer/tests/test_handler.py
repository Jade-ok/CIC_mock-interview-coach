"""Tests for interviewer.handler.lambda_handler"""

import json
import os
from io import BytesIO
from unittest.mock import patch, MagicMock

import pytest
from botocore.exceptions import ClientError

from interviewer.handler import lambda_handler


def make_s3_response(data):
    """Helper to create a mock S3 GetObject response."""
    return {"Body": BytesIO(json.dumps(data).encode("utf-8"))}


@pytest.fixture(autouse=True)
def set_env_vars(monkeypatch):
    """Set required environment variables for all tests."""
    monkeypatch.setenv("S3_BUCKET", "test-bucket")
    monkeypatch.setenv("INTERVIEW_STRUCTURE_KEY", "structure.json")
    monkeypatch.setenv("INTERVIEW_PROFILE_KEY", "profile.json")


VALID_ANALYST_OUTPUT = {"candidate_profile": {"name": "Alice"}}
MOCK_STRUCTURE = {"sections": [{"topic": "behavioral"}]}
MOCK_PROFILE = {"tone": "friendly", "style": "conversational"}


class TestFunctionURLHappyPath:
    """Function URL mode: event has 'body' key with valid JSON."""

    @patch("interviewer.config_loader._s3_client")
    def test_returns_200_with_runtime_context(self, mock_s3):
        mock_s3.get_object.side_effect = [
            make_s3_response(MOCK_STRUCTURE),
            make_s3_response(MOCK_PROFILE),
        ]

        event = {"body": json.dumps({"analyst_output": VALID_ANALYST_OUTPUT})}
        result = lambda_handler(event, None)

        assert result["statusCode"] == 200
        body = json.loads(result["body"])
        assert body["success"] is True
        assert len(body["runtime_context"]) > 0


class TestInvalidBody:
    """Function URL mode with non-JSON body."""

    def test_returns_400_with_error(self):
        event = {"body": "not json"}
        result = lambda_handler(event, None)

        assert result["statusCode"] == 400
        body = json.loads(result["body"])
        assert body["success"] is False
        assert "not valid JSON" in body["error_message"]


class TestDirectInvocationMode:
    """Direct invocation: event IS the payload (no 'body' key)."""

    @patch("interviewer.config_loader._s3_client")
    def test_returns_200_with_runtime_context(self, mock_s3):
        mock_s3.get_object.side_effect = [
            make_s3_response(MOCK_STRUCTURE),
            make_s3_response(MOCK_PROFILE),
        ]

        event = {"analyst_output": VALID_ANALYST_OUTPUT}
        result = lambda_handler(event, None)

        assert result["statusCode"] == 200
        body = json.loads(result["body"])
        assert body["success"] is True
        assert len(body["runtime_context"]) > 0


class TestValidationError:
    """Payload missing analyst_output triggers validation error."""

    def test_returns_200_with_validation_error(self):
        event = {"body": json.dumps({})}
        result = lambda_handler(event, None)

        assert result["statusCode"] == 200
        body = json.loads(result["body"])
        assert body["success"] is False
        assert "analyst_output" in body["error_message"]


class TestConfigLoadError:
    """S3 ClientError during config loading."""

    @patch("interviewer.config_loader._s3_client")
    def test_returns_200_with_config_error(self, mock_s3):
        mock_s3.get_object.side_effect = ClientError(
            {"Error": {"Code": "NoSuchKey", "Message": "Not found"}},
            "GetObject",
        )

        event = {"body": json.dumps({"analyst_output": VALID_ANALYST_OUTPUT})}
        result = lambda_handler(event, None)

        assert result["statusCode"] == 200
        body = json.loads(result["body"])
        assert body["success"] is False
        assert "interview_structure" in body["error_message"]


class TestUnhandledException:
    """Unhandled exception in handler returns 500."""

    @patch("interviewer.handler.validate_input", side_effect=RuntimeError("boom"))
    def test_returns_500_on_unexpected_error(self, mock_validate):
        event = {"body": json.dumps({"analyst_output": VALID_ANALYST_OUTPUT})}
        result = lambda_handler(event, None)

        assert result["statusCode"] == 500
        body = json.loads(result["body"])
        assert body["success"] is False
        assert "boom" in body["error_message"]
