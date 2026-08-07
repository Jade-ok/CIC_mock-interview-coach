from __future__ import annotations


def validate_input(payload: dict) -> tuple[dict | None, str | None]:
    """
    Check that the payload contains a non-empty analyst_output.

    Args:
        payload: The parsed request payload dict.

    Returns:
        (analyst_output, None) on success.
        (None, error_message) on failure.

    Validation rules:
        - payload must be a dict
        - payload must contain 'analyst_output' key
        - analyst_output must be a non-empty dict

    Does NOT validate the internal schema of analyst_output.
    """
    error_message = "analyst_output is required and must be a non-empty object"

    if not isinstance(payload, dict):
        return (None, error_message)

    if "analyst_output" not in payload:
        return (None, error_message)

    analyst_output = payload["analyst_output"]

    if not isinstance(analyst_output, dict) or not analyst_output:
        return (None, error_message)

    return (analyst_output, None)
