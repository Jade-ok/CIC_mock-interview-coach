"""Bedrock Converse API wrapper with retry logic for the Analyst Lambda."""

import boto3
from botocore.exceptions import ClientError, ReadTimeoutError

REGION = "us-east-1"
MAX_ATTEMPTS = 2

# Module-level client for Lambda container reuse
_client = boto3.client("bedrock-runtime", region_name=REGION)


class BedrockCallFailed(Exception):
    """Raised when all retry attempts to call Bedrock have been exhausted."""

    pass


def call_converse(request: dict) -> dict:
    """Call the Bedrock Converse API with retry logic.

    Extracts modelId from the request dict and passes remaining keys as kwargs
    to client.converse(). Retries on transient errors (timeout, throttling, 5xx).

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

    raise BedrockCallFailed(f"Bedrock API call failed after {MAX_ATTEMPTS} attempts: {last_error}")
