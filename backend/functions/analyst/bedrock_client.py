"""SigV4 client for Amazon Bedrock Mantle Chat Completions."""

import json
import urllib.error
import urllib.request

import boto3
from botocore.auth import SigV4Auth
from botocore.awsrequest import AWSRequest

REGION = "us-east-1"
ENDPOINT = f"https://bedrock-mantle.{REGION}.api.aws/v1/chat/completions"
MAX_ATTEMPTS = 1
REQUEST_TIMEOUT_SECONDS = 120

_session = boto3.Session()


class BedrockCallFailed(Exception):
    """Raised when a Bedrock Mantle request cannot be completed."""


def call_chat_completion(request: dict) -> dict:
    """Call Bedrock Mantle with one predictable transport attempt.

    The orchestrator separately makes one recovery call when a successful model
    response does not satisfy the Analyst output schema.
    """
    last_error: Exception | None = None

    for _ in range(MAX_ATTEMPTS):
        try:
            return _post_chat_completion(request)
        except urllib.error.HTTPError as error:
            details = error.read().decode("utf-8", errors="replace")
            failure = BedrockCallFailed(
                f"Bedrock Mantle returned HTTP {error.code}: {details}"
            )
            if error.code != 429 and error.code < 500:
                raise failure from error
            last_error = failure
        except (urllib.error.URLError, TimeoutError, OSError) as error:
            last_error = error
        except BedrockCallFailed:
            raise
        except Exception as error:
            last_error = error

    attempt_word = "attempt" if MAX_ATTEMPTS == 1 else "attempts"
    raise BedrockCallFailed(
        f"Bedrock Mantle call failed after {MAX_ATTEMPTS} {attempt_word}: {last_error}"
    ) from last_error


def _post_chat_completion(payload: dict) -> dict:
    """Sign and send one Chat Completions request with the active AWS identity."""
    credentials = _session.get_credentials()
    if credentials is None:
        raise BedrockCallFailed("No AWS credentials are available")

    body = json.dumps(payload).encode("utf-8")
    aws_request = AWSRequest(
        method="POST",
        url=ENDPOINT,
        data=body,
        headers={"Content-Type": "application/json"},
    )
    SigV4Auth(
        credentials.get_frozen_credentials(), "bedrock-mantle", REGION
    ).add_auth(aws_request)

    request = urllib.request.Request(
        ENDPOINT,
        data=body,
        method="POST",
        headers=dict(aws_request.headers.items()),
    )
    with urllib.request.urlopen(request, timeout=REQUEST_TIMEOUT_SECONDS) as response:
        return json.load(response)
