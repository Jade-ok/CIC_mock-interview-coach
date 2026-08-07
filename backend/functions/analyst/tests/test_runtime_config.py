"""Operational regression tests for the Analyst Bedrock integration."""

from unittest.mock import patch

from analyst import bedrock_client, orchestrator, prompt_builder
from analyst.parser import SchemaValidationError


def test_bedrock_timeouts_and_retry_budget():
    assert bedrock_client._bedrock_config.read_timeout == 120
    assert bedrock_client._bedrock_config.connect_timeout == 10
    assert bedrock_client.MAX_ATTEMPTS == 1


def test_prompt_uses_shared_sonnet_4_6_and_large_output_budget():
    request = prompt_builder.build_converse_request("resume", "job")

    assert request["modelId"] == "global.anthropic.claude-sonnet-4-6"
    assert request["inferenceConfig"]["maxTokens"] == 8192


def test_schema_failure_allows_exactly_one_recovery_call():
    responses = [{"attempt": 1}, {"attempt": 2}]
    parsed = {"analysis_warnings": []}

    with (
        patch.object(orchestrator, "call_converse", side_effect=responses) as converse,
        patch.object(
            orchestrator,
            "parse_converse_response",
            side_effect=[SchemaValidationError("invalid"), parsed],
        ) as parse,
        patch.object(orchestrator, "check_analysis_warnings", return_value=[]),
    ):
        result = orchestrator.analyze(
            {"resume_text": "resume", "job_posting_text": "job"}
        )

    assert result == parsed
    assert converse.call_count == 2
    assert parse.call_count == 2
