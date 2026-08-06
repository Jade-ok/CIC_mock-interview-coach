"""Bedrock Converse API wrapper with retry logic."""


def invoke(system: list, messages: list, tool_config: dict) -> dict:
    """Call the Bedrock Converse API with retry logic.

    Args:
        system: The system prompt blocks.
        messages: The messages array for the Converse API.
        tool_config: The tool configuration dict.

    Returns:
        The extracted tool_use input dict from the LLM response.

    Raises:
        EvaluationError: If all retry attempts fail or no tool_use block is found.
    """
    raise NotImplementedError()


def _extract_tool_input(response: dict) -> dict:
    """Extract the tool_use input from a Bedrock Converse API response.

    Args:
        response: The raw Converse API response dict.

    Returns:
        The tool input dict extracted from the tool_use block.

    Raises:
        EvaluationError: If no tool_use block is found in the response.
    """
    raise NotImplementedError()
