"""Amazon Bedrock Mantle client for the Evaluator agent."""

import json
import urllib.error
import urllib.request

import boto3
from botocore.auth import SigV4Auth
from botocore.awsrequest import AWSRequest

try:
    from .exceptions import EvaluationError
except ImportError:  # Lambda loads modules from the function root.
    from exceptions import EvaluationError

MODEL_ID = "openai.gpt-oss-120b"
REGION = "us-east-1"
ENDPOINT = f"https://bedrock-mantle.{REGION}.api.aws/v1/chat/completions"
MAX_ATTEMPTS = 2
REQUEST_TIMEOUT_SECONDS = 120

_session = boto3.Session()


def invoke(system: str, messages: list, tool_config: dict) -> dict:
    """Call GPT OSS 120B through Bedrock Mantle and return tool arguments."""
    request = {
        "model": MODEL_ID,
        "messages": [{"role": "system", "content": system}, *messages],
        **tool_config,
        "max_tokens": 8192,
        "temperature": 0.0,
        "reasoning_effort": "low",
    }

    last_error: Exception | None = None
    for attempt in range(MAX_ATTEMPTS):
        try:
            return _extract_tool_input(_post_chat_completion(request))
        except EvaluationError:
            raise
        except urllib.error.HTTPError as error:
            details = error.read().decode("utf-8", errors="replace")
            last_error = EvaluationError(
                f"Bedrock Mantle returned HTTP {error.code}: {details}"
            )
            if error.code != 429 and error.code < 500:
                raise last_error from error
        except (urllib.error.URLError, TimeoutError, OSError) as error:
            last_error = error
        except Exception as error:
            last_error = error

        if attempt == MAX_ATTEMPTS - 1:
            raise EvaluationError(
                f"Bedrock Mantle call failed after {MAX_ATTEMPTS} attempts: {last_error}"
            ) from last_error

    raise EvaluationError(f"Bedrock Mantle call failed: {last_error}")


def _post_chat_completion(payload: dict) -> dict:
    """Sign and send one Chat Completions request with the active AWS identity."""
    credentials = _session.get_credentials()
    if credentials is None:
        raise EvaluationError("No AWS credentials are available")

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


def _extract_tool_input(response: dict) -> dict:
    """Extract and decode the forced submit_evaluation function arguments."""
    try:
        tool_calls = response["choices"][0]["message"]["tool_calls"]
        if not tool_calls:
            raise EvaluationError("No tool call found in Bedrock Mantle response")
        function = tool_calls[0]["function"]
        if function["name"] != "submit_evaluation":
            raise EvaluationError(
                "Expected submit_evaluation tool call in Bedrock Mantle response"
            )
        arguments = function["arguments"]
        result = json.loads(arguments) if isinstance(arguments, str) else arguments
        if not isinstance(result, dict):
            raise EvaluationError(
                "submit_evaluation function arguments must decode to a JSON object"
            )
        return result
    except EvaluationError:
        raise
    except (KeyError, IndexError, TypeError, json.JSONDecodeError) as error:
        raise EvaluationError(
            "Invalid Bedrock Mantle response structure: missing tool call"
        ) from error
