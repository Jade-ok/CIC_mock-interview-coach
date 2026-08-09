"""Unit tests for the Evaluator Bedrock Mantle client."""

from unittest.mock import patch

import pytest

from evaluator.bedrock_client import (
    MAX_ATTEMPTS,
    MODEL_ID,
    REQUEST_TIMEOUT_SECONDS,
    _extract_tool_input,
    invoke,
)
from evaluator.exceptions import EvaluationError


def _mock_chat_response(tool_input: dict) -> dict:
    return {
        "choices": [
            {
                "message": {
                    "tool_calls": [
                        {
                            "id": "test-id",
                            "type": "function",
                            "function": {
                                "name": "submit_evaluation",
                                "arguments": __import__("json").dumps(tool_input),
                            },
                        }
                    ]
                }
            }
        ]
    }


class TestExtractToolInput:
    def test_extracts_tool_input_from_valid_response(self):
        tool_input = {"per_question_scores": [], "strengths": []}
        assert _extract_tool_input(_mock_chat_response(tool_input)) == tool_input

    def test_raises_on_missing_tool_call(self):
        response = {"choices": [{"message": {"content": "No tool here"}}]}
        with pytest.raises(EvaluationError, match="Invalid Bedrock Mantle response"):
            _extract_tool_input(response)

    def test_raises_on_wrong_function(self):
        response = _mock_chat_response({})
        response["choices"][0]["message"]["tool_calls"][0]["function"]["name"] = "wrong"
        with pytest.raises(EvaluationError, match="Expected submit_evaluation"):
            _extract_tool_input(response)

    def test_raises_when_function_arguments_are_not_an_object(self):
        response = _mock_chat_response({})
        response["choices"][0]["message"]["tool_calls"][0]["function"][
            "arguments"
        ] = "null"
        with pytest.raises(EvaluationError, match="must decode to a JSON object"):
            _extract_tool_input(response)


class TestInvoke:
    def test_uses_shared_gpt_oss_120b_model(self):
        assert MODEL_ID == "openai.gpt-oss-120b"

    def test_timeout_fits_lambda_budget(self):
        assert REQUEST_TIMEOUT_SECONDS == 120

    @patch("evaluator.bedrock_client._post_chat_completion")
    def test_success_on_first_attempt(self, post):
        tool_input = {
            "per_question_scores": [],
            "strengths": [],
            "improvements": [],
            "contextual_advice": [],
        }
        post.return_value = _mock_chat_response(tool_input)

        result = invoke(
            system="test",
            messages=[{"role": "user", "content": "test"}],
            tool_config={"tools": [], "tool_choice": "required"},
        )

        assert result == tool_input
        assert post.call_count == 1
        request = post.call_args.args[0]
        assert request["model"] == "openai.gpt-oss-120b"
        assert request["reasoning_effort"] == "low"

    @patch("evaluator.bedrock_client._post_chat_completion")
    def test_retries_on_first_failure(self, post):
        tool_input = {
            "per_question_scores": [],
            "strengths": [],
            "improvements": [],
            "contextual_advice": [],
        }
        post.side_effect = [Exception("Temporary failure"), _mock_chat_response(tool_input)]

        result = invoke("test", [{"role": "user", "content": "test"}], {"tools": []})

        assert result == tool_input
        assert post.call_count == 2

    @patch("evaluator.bedrock_client._post_chat_completion")
    def test_raises_after_all_attempts_fail(self, post):
        post.side_effect = Exception("Persistent failure")

        with pytest.raises(EvaluationError, match="failed after 2 attempts"):
            invoke("test", [{"role": "user", "content": "test"}], {"tools": []})

        assert post.call_count == MAX_ATTEMPTS

    @patch("evaluator.bedrock_client._post_chat_completion")
    def test_does_not_retry_malformed_success(self, post):
        post.return_value = {"choices": [{"message": {"content": "No tool"}}]}

        with pytest.raises(EvaluationError, match="Invalid Bedrock Mantle response"):
            invoke("test", [{"role": "user", "content": "test"}], {"tools": []})

        assert post.call_count == 1
