"""Placeholder handler for the Polly TTS Lambda."""

import json


def lambda_handler(event, context):
    """Placeholder — returns a not-implemented response."""
    return {
        "statusCode": 501,
        "headers": {"Content-Type": "application/json"},
        "body": json.dumps({"status": "error", "error": "Polly Lambda not yet implemented"}),
    }
