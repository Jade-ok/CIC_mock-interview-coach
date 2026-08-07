"""Input validation for the Evaluator agent."""

import json
try:
    from exceptions import ValidationError
except ImportError:
    from evaluator.exceptions import ValidationError


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

    return body
