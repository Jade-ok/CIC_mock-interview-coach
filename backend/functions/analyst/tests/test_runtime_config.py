"""Operational regression tests for the Analyst Bedrock integration."""

from unittest.mock import patch

import pytest

from analyst import bedrock_client, orchestrator, prompt_builder
from analyst.parser import SchemaValidationError, parse_chat_response


def test_bedrock_timeouts_and_retry_budget():
    assert bedrock_client.REQUEST_TIMEOUT_SECONDS == 120
    assert bedrock_client.MAX_ATTEMPTS == 1


def test_hosted_model_timeout_is_55_seconds_and_local_remains_120():
    with patch.dict("os.environ", {"HOSTED_GUARDRAILS_ENABLED": "true"}):
        assert bedrock_client._request_timeout_seconds() == 55
    with patch.dict("os.environ", {}, clear=True):
        assert bedrock_client._request_timeout_seconds() == 120


def test_prompt_uses_shared_gpt_oss_120b_and_preserves_local_output_budget():
    with patch.dict("os.environ", {}, clear=True):
        request = prompt_builder.build_chat_request("resume", "job")

    assert request["model"] == "openai.gpt-oss-120b"
    assert request["max_tokens"] == 8192
    assert request["reasoning_effort"] == "low"
    assert request["tool_choice"] == {
        "type": "function",
        "function": {"name": "analyst_output"},
    }


def test_hosted_prompt_uses_bounded_output_budget():
    with patch.dict("os.environ", {"HOSTED_GUARDRAILS_ENABLED": "true"}):
        request = prompt_builder.build_chat_request("resume", "job")

    assert request["max_tokens"] == 4096


def test_prompt_schema_supports_flexible_canonical_experience_types():
    schema = prompt_builder._analyst_output_schema()
    selected_type = schema["properties"]["selected_experiences"]["items"][
        "properties"
    ]["experience_type"]

    assert selected_type["enum"] == [
        "internship",
        "coursework",
        "academic_project",
        "personal_project",
        "hackathon",
        "student_club",
        "research",
        "volunteering",
        "work_experience",
        "other",
    ]


def test_schema_failure_allows_exactly_one_recovery_call():
    responses = [{"attempt": 1}, {"attempt": 2}]
    parsed = {"analysis_warnings": []}

    with (
        patch.object(orchestrator, "call_chat_completion", side_effect=responses) as chat,
        patch.object(
            orchestrator,
            "parse_chat_response",
            side_effect=[SchemaValidationError("invalid"), parsed],
        ) as parse,
        patch.object(orchestrator, "check_analysis_warnings", return_value=[]),
    ):
        result = orchestrator.analyze(
            {"resume_text": "resume", "job_posting_text": "job"}
        )

    assert result == parsed
    assert chat.call_count == 2
    assert parse.call_count == 2


def test_hosted_schema_failure_does_not_make_a_second_paid_call():
    with (
        patch.dict("os.environ", {"HOSTED_GUARDRAILS_ENABLED": "true"}),
        patch.object(orchestrator, "call_chat_completion", return_value={}) as chat,
        patch.object(
            orchestrator,
            "parse_chat_response",
            side_effect=SchemaValidationError("invalid"),
        ),
    ):
        with pytest.raises(SchemaValidationError, match="invalid"):
            orchestrator.analyze(
                {"resume_text": "resume", "job_posting_text": "job"}
            )

    assert chat.call_count == 1


def test_non_object_function_arguments_are_schema_errors():
    response = {
        "choices": [
            {
                "message": {
                    "tool_calls": [
                        {
                            "function": {
                                "name": "analyst_output",
                                "arguments": "null",
                            }
                        }
                    ]
                }
            }
        ]
    }

    with pytest.raises(SchemaValidationError, match="must decode to a JSON object"):
        parse_chat_response(response)
