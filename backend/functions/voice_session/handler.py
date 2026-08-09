"""Create short-lived, browser-safe AgentCore WebSocket URLs."""

import json
import os
import uuid
from urllib.parse import quote, urlencode, urlparse

import boto3
from botocore.auth import SigV4QueryAuth
from botocore.awsrequest import AWSRequest


URL_TTL_SECONDS = 300
SESSION_ID_PARAMETER = "X-Amzn-Bedrock-AgentCore-Runtime-Session-Id"


def generate_presigned_websocket_url() -> str:
    """Sign an AgentCore WebSocket handshake with the Lambda execution role."""
    runtime_arn = os.environ["AGENTCORE_RUNTIME_ARN"]
    region = os.environ.get("AWS_REGION", "us-east-1")
    credentials = boto3.Session(region_name=region).get_credentials()
    if credentials is None:
        raise RuntimeError("AWS credentials are unavailable")

    query = urlencode({SESSION_ID_PARAMETER: str(uuid.uuid4())})
    encoded_arn = quote(runtime_arn, safe="")
    https_url = (
        f"https://bedrock-agentcore.{region}.amazonaws.com/"
        f"runtimes/{encoded_arn}/ws?{query}"
    )
    request = AWSRequest(
        method="GET",
        url=https_url,
        headers={"host": urlparse(https_url).hostname},
    )
    SigV4QueryAuth(
        credentials.get_frozen_credentials(),
        "bedrock-agentcore",
        region,
        expires=URL_TTL_SECONDS,
    ).add_auth(request)
    return request.url.replace("https://", "wss://", 1)


def lambda_handler(_event, _context):
    """Return a fresh signed URL without logging it or its query parameters."""
    try:
        url = generate_presigned_websocket_url()
        return {
            "statusCode": 200,
            "headers": {"Content-Type": "application/json"},
            "body": json.dumps({"url": url, "expires_in": URL_TTL_SECONDS}),
        }
    except (KeyError, RuntimeError) as exc:
        return {
            "statusCode": 500,
            "headers": {"Content-Type": "application/json"},
            "body": json.dumps({"error": str(exc)}),
        }
