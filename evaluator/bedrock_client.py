"""Bedrock Converse API client wrapper for the Evaluator agent."""

import boto3
from botocore.config import Config

from evaluator.exceptions import EvaluationError

MODEL_ID = "global.anthropic.claude-fable-5"
REGION = "us-east-1"
MAX_ATTEMPTS = 2

# Disable botocore's built-in retry — we handle retries manually
_client = boto3.client(
    "bedrock-runtime",
    region_name=REGION,
    config=Config(retries={"max_attempts": 0}),
)


def invoke(system: list, messages: list, tool_config: dict) -> dict:
    """Call the Bedrock Converse API with retry logic.

    Args:
        system: System prompt blocks for the Converse API.
        messages: Messages array for the Converse API.
        tool_config: Tool configuration dict with schema and forced tool choice.

    Returns:
        The parsed tool_use input dict from the LLM response.

    Raises:
        EvaluationError: If all attempts fail or no tool_use block is found.
    """
    last_error = None
    for attempt in range(MAX_ATTEMPTS):
        try:
            response = _client.converse(
                modelId=MODEL_ID,
                system=system,
                messages=messages,
                toolConfig=tool_config,
            )
            return _extract_tool_input(response)
        except EvaluationError:
            raise
        except Exception as e:
            last_error = e
            if attempt == MAX_ATTEMPTS - 1:
                raise EvaluationError(
                    f"Bedrock API call failed after {MAX_ATTEMPTS} attempts: {last_error}"
                )
    # Should not reach here, but satisfy linter
    raise EvaluationError(f"Bedrock API call failed: {last_error}")


def _extract_tool_input(response: dict) -> dict:
    """Extract the tool_use input from a Bedrock Converse API response.

    Args:
        response: The raw Converse API response dict.

    Returns:
        The input dict from the tool_use content block.

    Raises:
        EvaluationError: If no tool_use block is found in the response.
    """
    try:
        content_blocks = response["output"]["message"]["content"]
    except (KeyError, TypeError):
        raise EvaluationError("Invalid Bedrock response structure: missing content blocks")

    for block in content_blocks:
        if "toolUse" in block:
            return block["toolUse"]["input"]

    raise EvaluationError("No tool_use block found in Bedrock response")
