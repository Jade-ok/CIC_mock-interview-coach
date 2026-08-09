"""Operational regression tests for the Analyst Bedrock integration."""

from unittest.mock import patch

import pytest

from analyst import bedrock_client, orchestrator, prompt_builder
from analyst.parser import SchemaValidationError, parse_chat_response


def test_bedrock_timeouts_and_retry_budget():
    assert bedrock_client.REQUEST_TIMEOUT_SECONDS == 120
    assert bedrock_client.MAX_ATTEMPTS == 1


def test_prompt_uses_shared_gpt_oss_120b_and_large_output_budget():
    request = prompt_builder.build_chat_request("resume", "job")

    assert request["model"] == "openai.gpt-oss-120b"
    assert request["max_tokens"] == 8192
    assert request["reasoning_effort"] == "low"
    assert request["tool_choice"] == {
        "type": "function",
        "function": {"name": "analyst_output"},
    }


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
