"""Input validation for the Evaluator agent."""

import json
import os
try:
    from .exceptions import ValidationError
except ImportError:  # Lambda loads modules from the function root.
    from exceptions import ValidationError


MAX_CONVERSATION_TEXT_CHARS = 60_000
MAX_ANALYST_OUTPUT_CHARS = 120_000


def _hosted_guardrails_enabled() -> bool:
    return os.getenv("HOSTED_GUARDRAILS_ENABLED", "").lower() == "true"


def parse_and_validate(event: dict) -> dict:
    """Parse and validate the incoming Lambda Function URL event.

    Args:
        event: The raw Lambda Function URL event dict.

    Returns:
        The validated payload dict containing conversation, interview_metadata,
        and analyst_output.

    Raises:
        ValidationError: If any required field is missing, empty, or malformed.
    """
    body_str = event.get("body")
    if not body_str:
        raise ValidationError("Request body is empty")

    try:
        body = json.loads(body_str)
    except (json.JSONDecodeError, TypeError) as e:
        raise ValidationError(f"Invalid JSON in request body: {e}")

    required_fields = ["conversation", "interview_metadata", "analyst_output"]
    for field in required_fields:
        if not body.get(field):
            raise ValidationError(f"Missing or empty required field: {field}")

    conversation = body["conversation"]
    if not isinstance(conversation, list):
        raise ValidationError("conversation must be an array")

    if len(conversation) < 1:
        raise ValidationError(
            "Conversation must contain at least one question-answer pair"
        )
    if len(conversation) > 6:
        raise ValidationError(
            "Conversation exceeds expected interview length (max 6 question-answer pairs)"
        )

    required_turn_fields = ["point_id", "turn_type", "question", "answer"]
    for i, turn in enumerate(conversation):
        for field in required_turn_fields:
            if field not in turn:
                raise ValidationError(
                    f"Conversation turn {i} missing required field: {field}"
                )

    if not _hosted_guardrails_enabled():
        return body

    conversation_chars = sum(
        len(str(turn.get("question", ""))) + len(str(turn.get("answer", "")))
        for turn in conversation
    )
    if conversation_chars > MAX_CONVERSATION_TEXT_CHARS:
        raise ValidationError(
            f"Conversation exceeds {MAX_CONVERSATION_TEXT_CHARS} characters"
        )

    analyst_output_chars = len(
        json.dumps(body["analyst_output"], ensure_ascii=False, separators=(",", ":"))
    )
    if analyst_output_chars > MAX_ANALYST_OUTPUT_CHARS:
        raise ValidationError(
            f"analyst_output exceeds {MAX_ANALYST_OUTPUT_CHARS} characters"
        )

    return body
