"""Input validation for the analyst Lambda."""

import json
import os


MAX_RESUME_TEXT_CHARS = 60_000
MAX_JOB_POSTING_TEXT_CHARS = 5_000


def _hosted_guardrails_enabled() -> bool:
    return os.getenv("HOSTED_GUARDRAILS_ENABLED", "").lower() == "true"


def detect_invocation_mode(event: dict) -> dict:
    """Detect whether the Lambda was invoked via Function URL or directly.

    If event has a 'body' key with a string value, treat as Function URL mode
    and parse the JSON string. Otherwise, return the event as-is (Direct mode).

    Args:
        event: The raw Lambda event dict.

    Returns:
        Extracted payload dict.

    Raises:
        ValueError: If the body cannot be parsed as JSON.
    """
    if "body" in event and isinstance(event["body"], str):
        try:
            return json.loads(event["body"])
        except (json.JSONDecodeError, TypeError) as e:
            raise ValueError("Failed to parse request body as JSON") from e
    return event


def validate_request(payload: dict) -> tuple[bool, str | None]:
    """Validate that the analyst request payload contains required fields.

    Checks that both resume_text and job_posting_text are present and
    non-empty strings.

    Args:
        payload: The request payload dict.

    Returns:
        Tuple of (is_valid, error_message_or_none).
    """
    missing_fields = []

    if not isinstance(payload.get("resume_text"), str) or not payload["resume_text"].strip():
        missing_fields.append("resume_text")

    if not isinstance(payload.get("job_posting_text"), str) or not payload["job_posting_text"].strip():
        missing_fields.append("job_posting_text")

    if missing_fields:
        return (False, f"Missing or empty fields: {', '.join(missing_fields)}")

    # This is a product constraint shared by the frontend, local adapter, and
    # hosted Lambda rather than a hosted-only cost guardrail.
    if len(payload["job_posting_text"]) > MAX_JOB_POSTING_TEXT_CHARS:
        return (
            False,
            f"job_posting_text exceeds {MAX_JOB_POSTING_TEXT_CHARS} characters",
        )

    if not _hosted_guardrails_enabled():
        return (True, None)

    if len(payload["resume_text"]) > MAX_RESUME_TEXT_CHARS:
        return (False, f"resume_text exceeds {MAX_RESUME_TEXT_CHARS} characters")

    return (True, None)
