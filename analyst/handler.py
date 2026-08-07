"""Lambda entry point for the analyst function."""

import json

try:
    from validation import detect_invocation_mode, validate_request
    from orchestrator import analyze
    from bedrock_client import BedrockCallFailed
    from parser import SchemaValidationError
except ImportError:
    from analyst.validation import detect_invocation_mode, validate_request
    from analyst.orchestrator import analyze
    from analyst.bedrock_client import BedrockCallFailed
    from analyst.parser import SchemaValidationError


def lambda_handler(event: dict, context) -> dict:
    """Lambda entry point for the analyst function.

    Detects invocation mode (Function URL vs Direct), validates the request,
    orchestrates resume analysis, and wraps the result in a standard
    response envelope.

    Args:
        event: Lambda event dict (Function URL mode or Direct mode).
        context: Lambda context object (unused).

    Returns:
        dict with statusCode, headers, and JSON body for Function URL
        compatibility.
    """
    # Step 1: Detect invocation mode and extract payload
    try:
        payload = detect_invocation_mode(event)
    except ValueError as exc:
        return _error_response(str(exc), 400)

    # Step 2: Validate request payload
    is_valid, error_message = validate_request(payload)
    if not is_valid:
        return _error_response(error_message, 400)

    # Step 3: Run analysis
    try:
        analyst_output = analyze(payload)
    except BedrockCallFailed as exc:
        return _error_response(f"Bedrock service error: {exc}", 502)
    except SchemaValidationError as exc:
        return _error_response(f"Response validation error: {exc}", 502)
    except Exception as exc:
        return _error_response(f"Internal error: {exc}", 500)

    # Step 4: Wrap result in success envelope
    return _success_response(analyst_output)


def _success_response(data: dict) -> dict:
    """Build a success response envelope."""
    return {
        "statusCode": 200,
        "headers": {"Content-Type": "application/json"},
        "body": json.dumps({"status": "success", "data": data}),
    }


def _error_response(message: str, status_code: int) -> dict:
    """Build an error response envelope."""
    return {
        "statusCode": status_code,
        "headers": {"Content-Type": "application/json"},
        "body": json.dumps({"status": "error", "error": message}),
    }
