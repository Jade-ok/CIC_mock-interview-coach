import json
import logging
import os

try:
    from session_guard import SessionGuardError, authorize_stage, error_response
except ImportError:
    try:
        from backend.functions.shared.python.session_guard import (
            SessionGuardError, authorize_stage, error_response,
        )
    except ImportError:
        from shared.python.session_guard import (
            SessionGuardError, authorize_stage, error_response,
        )

try:
    from .validation import validate_input
    from .config_loader import (
        ConfigLoadError,
        load_interview_profile,
        load_interview_structure,
    )
    from .context_builder import build_runtime_context
except ImportError:  # Lambda loads handler.py as a top-level module.
    from validation import validate_input
    from config_loader import ConfigLoadError, load_interview_profile, load_interview_structure
    from context_builder import build_runtime_context

logger = logging.getLogger(__name__)


def lambda_handler(event: dict, context) -> dict:
    """
    Lambda entry point for the Interviewer module.

    Supports two invocation modes:
      - Function URL: event contains a 'body' key with a JSON string.
      - Direct invocation: event IS the payload dict.

    Returns:
        {"statusCode": int, "body": "<JSON string>"}
    """
    try:
        authorize_stage(event, "interviewer")
    except SessionGuardError as exc:
        return error_response(exc)

    try:
        # Mode detection
        if "body" in event:
            try:
                payload = json.loads(event["body"])
            except (json.JSONDecodeError, TypeError):
                return {
                    "statusCode": 400,
                    "body": json.dumps({
                        "success": False,
                        "error_message": "Request body is not valid JSON",
                    }),
                }
        else:
            payload = event

        # Validate input
        analyst_output, error_msg = validate_input(payload)
        if error_msg is not None:
            return {
                "statusCode": 200,
                "body": json.dumps({
                    "success": False,
                    "error_message": error_msg,
                }),
            }

        # Read env vars
        bucket = os.environ.get("S3_BUCKET", "")
        structure_key = os.environ.get("INTERVIEW_STRUCTURE_KEY", "")
        profile_key = os.environ.get("INTERVIEW_PROFILE_KEY", "")

        # Load interview structure from S3
        try:
            interview_structure = load_interview_structure(bucket, structure_key)
        except ConfigLoadError as e:
            return {
                "statusCode": 200,
                "body": json.dumps({
                    "success": False,
                    "error_message": str(e),
                }),
            }

        # Load interview profile from S3
        try:
            interview_profile = load_interview_profile(bucket, profile_key)
        except ConfigLoadError as e:
            return {
                "statusCode": 200,
                "body": json.dumps({
                    "success": False,
                    "error_message": str(e),
                }),
            }

        # Build runtime context
        context_string = build_runtime_context(
            analyst_output, interview_structure, interview_profile
        )

        return {
            "statusCode": 200,
            "body": json.dumps({
                "success": True,
                "runtime_context": context_string,
            }),
        }

    except Exception:
        logger.exception("Unexpected error building interview context")
        return {
            "statusCode": 500,
            "body": json.dumps({
                "success": False,
                "error_message": "An unexpected error occurred",
            }),
        }
