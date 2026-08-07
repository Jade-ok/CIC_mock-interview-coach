"""Unit tests for the Evaluator bedrock_client module."""

from unittest.mock import patch, MagicMock
import pytest

from evaluator.bedrock_client import (
    MODEL_ID,
    MAX_ATTEMPTS,
    _client,
    _extract_tool_input,
    invoke,
)
from evaluator.exceptions import EvaluationError


def _mock_converse_response(tool_input: dict) -> dict:
    """Create a mock Bedrock Converse API response with tool_use block."""
    return {
        "output": {
            "message": {
                "content": [
                    {
                        "toolUse": {
                            "toolUseId": "test-id",
                            "name": "submit_evaluation",
                            "input": tool_input,
                        }
                    }
                ]
            }
        }
    }


class TestExtractToolInput:
    def test_extracts_tool_input_from_valid_response(self):
        tool_input = {"per_question_scores": [], "strengths": []}
        response = _mock_converse_response(tool_input)
        result = _extract_tool_input(response)
        assert result == tool_input

    def test_raises_on_missing_tool_use_block(self):
        response = {"output": {"message": {"content": [{"text": "No tool here"}]}}}
        with pytest.raises(EvaluationError, match="No tool_use block"):
            _extract_tool_input(response)

    def test_raises_on_invalid_structure(self):
        with pytest.raises(EvaluationError, match="Invalid Bedrock response"):
            _extract_tool_input({"bad": "structure"})


class TestInvoke:
    def test_uses_shared_sonnet_4_6_model(self):
        assert MODEL_ID == "global.anthropic.claude-sonnet-4-6"

    def test_client_timeouts_fit_the_lambda_budget(self):
        assert _client.meta.config.read_timeout == 120
        assert _client.meta.config.connect_timeout == 10

    @patch("evaluator.bedrock_client._client")
    def test_success_on_first_attempt(self, mock_client):
        tool_input = {"per_question_scores": [], "strengths": [], "improvements": [], "contextual_advice": []}
        mock_client.converse.return_value = _mock_converse_response(tool_input)

        result = invoke(
            system=[{"text": "test"}],
            messages=[{"role": "user", "content": [{"text": "test"}]}],
            tool_config={"tools": []},
        )

        assert result == tool_input
        assert mock_client.converse.call_count == 1

    @patch("evaluator.bedrock_client._client")
    def test_retries_on_first_failure(self, mock_client):
        tool_input = {"per_question_scores": [], "strengths": [], "improvements": [], "contextual_advice": []}
        mock_client.converse.side_effect = [
            Exception("Temporary failure"),
            _mock_converse_response(tool_input),
        ]

        result = invoke(
            system=[{"text": "test"}],
            messages=[{"role": "user", "content": [{"text": "test"}]}],
            tool_config={"tools": []},
        )

        assert result == tool_input
        assert mock_client.converse.call_count == 2

    @patch("evaluator.bedrock_client._client")
    def test_raises_after_all_attempts_fail(self, mock_client):
        mock_client.converse.side_effect = Exception("Persistent failure")

        with pytest.raises(EvaluationError, match="failed after 2 attempts"):
            invoke(
                system=[{"text": "test"}],
                messages=[{"role": "user", "content": [{"text": "test"}]}],
                tool_config={"tools": []},
            )

        assert mock_client.converse.call_count == MAX_ATTEMPTS

    @patch("evaluator.bedrock_client._client")
    def test_raises_immediately_on_missing_tool_use(self, mock_client):
        mock_client.converse.return_value = {
            "output": {"message": {"content": [{"text": "No tool"}]}}
        }

        with pytest.raises(EvaluationError, match="No tool_use block"):
            invoke(
                system=[{"text": "test"}],
                messages=[{"role": "user", "content": [{"text": "test"}]}],
                tool_config={"tools": []},
            )

        # Should not retry when response is valid but has no tool_use
        assert mock_client.converse.call_count == 1
