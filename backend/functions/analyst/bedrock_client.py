"""Bedrock Converse API wrapper for the Analyst Lambda."""

import boto3
from botocore.config import Config
from botocore.exceptions import ClientError, ReadTimeoutError

REGION = "us-east-1"
MAX_ATTEMPTS = 1

# A complete resume analysis can take longer than botocore's default read
# timeout. Keep one transport attempt per call and disable SDK retries so the
# orchestrator's optional schema-recovery call fits predictably in 300 seconds.
_bedrock_config = Config(
    read_timeout=120,
    connect_timeout=10,
    retries={"max_attempts": 0},
)

# Module-level client for Lambda container reuse
_client = boto3.client("bedrock-runtime", region_name=REGION, config=_bedrock_config)


class BedrockCallFailed(Exception):
    """Raised when all retry attempts to call Bedrock have been exhausted."""

    pass


def call_converse(request: dict) -> dict:
    """Call the Bedrock Converse API with the configured transport-attempt limit.

    Extracts modelId from the request dict and passes remaining keys as kwargs
    to client.converse(). Transient errors are eligible for another loop attempt,
    but MAX_ATTEMPTS is currently one so they are surfaced immediately. The
    orchestrator separately makes one recovery call for schema-invalid output.

    Args:
        request: Converse API request dict from prompt_builder.build_converse_request().
            Expected shape: {"modelId": ..., "system": [...], "messages": [...],
                             "toolConfig": {...}, "inferenceConfig": {...}}

    Returns:
        Raw Converse API response dict.

    Raises:
        BedrockCallFailed: After MAX_ATTEMPTS failures, with the last error message.
    """
    last_error = None

    for _ in range(MAX_ATTEMPTS):
        try:
            response = _client.converse(
                modelId=request["modelId"],
                messages=request["messages"],
                system=request["system"],
                toolConfig=request["toolConfig"],
                inferenceConfig=request["inferenceConfig"],
            )
            return response
        except ReadTimeoutError as e:
            last_error = str(e)
        except ClientError as e:
            error_code = e.response.get("Error", {}).get("Code", "")
            status_code = e.response.get("ResponseMetadata", {}).get(
                "HTTPStatusCode", 0
            )
            # Retry on throttling or 5xx server errors
            if error_code == "ThrottlingException" or status_code >= 500:
                last_error = str(e)
            else:
                # Non-retryable client error — fail immediately
                raise BedrockCallFailed(str(e)) from e

    attempt_word = "attempt" if MAX_ATTEMPTS == 1 else "attempts"
    raise BedrockCallFailed(
        f"Bedrock API call failed after {MAX_ATTEMPTS} {attempt_word}: {last_error}"
    )
