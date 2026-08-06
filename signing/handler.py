"""
Signing Lambda: generates a presigned WebSocket URL for Nova Sonic.

The frontend calls this Lambda, gets a time-limited signed URL, and
connects directly to Nova Sonic — no proxy needed.

Uses botocore's SigV4 request signer for correctness.
"""

import json
import os
import datetime

from botocore.auth import SigV4Auth
from botocore.awsrequest import AWSRequest
from botocore.credentials import Credentials
from urllib.parse import urlencode


REGION = os.environ.get("SIGNING_REGION", os.environ.get("AWS_REGION", "us-east-1"))
MODEL_ID = os.environ.get("MODEL_ID", "amazon.nova-2-sonic-v1:0")
SERVICE = "bedrock-runtime"
ENDPOINT = f"https://bedrock-runtime.{REGION}.amazonaws.com"
PATH = f"/model/{MODEL_ID}/invoke-with-bidirectional-stream"


def lambda_handler(event: dict, context) -> dict:
    """Generate a presigned WebSocket URL for Nova Sonic."""
    try:
        access_key = os.environ.get("AWS_ACCESS_KEY_ID")
        secret_key = os.environ.get("AWS_SECRET_ACCESS_KEY")
        session_token = os.environ.get("AWS_SESSION_TOKEN")

        if not access_key or not secret_key:
            return _error_response(500, "AWS credentials not available")

        credentials = Credentials(access_key, secret_key, session_token)

        url = _presign_url(credentials)

        return {
            "statusCode": 200,
            "body": json.dumps({"url": url}),
        }

    except Exception as e:
        return _error_response(500, f"Failed to generate presigned URL: {str(e)}")


def _presign_url(credentials: Credentials) -> str:
    """
    Create a SigV4-presigned WebSocket URL for Bedrock bidirectional streaming.

    Uses botocore's SigV4Auth to properly sign the request.
    """
    # Build the request URL
    request_url = f"{ENDPOINT}{PATH}"

    # Create an AWSRequest for signing
    request = AWSRequest(method="GET", url=request_url)
    request.headers["host"] = f"bedrock-runtime.{REGION}.amazonaws.com"

    # Sign the request using SigV4 with query string signing
    SigV4Auth(credentials, SERVICE, REGION).add_auth(request)

    # Convert signed headers into a presigned URL
    # The SigV4Auth adds Authorization header - we need query string params instead
    # Let's use the presign approach directly
    now = datetime.datetime.utcnow()
    datestamp = now.strftime("%Y%m%d")
    amz_date = now.strftime("%Y%m%dT%H%M%SZ")

    credential_scope = f"{datestamp}/{REGION}/{SERVICE}/aws4_request"

    params = {
        "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
        "X-Amz-Credential": f"{credentials.access_key}/{credential_scope}",
        "X-Amz-Date": amz_date,
        "X-Amz-Expires": "300",
        "X-Amz-SignedHeaders": "host",
    }
    if credentials.token:
        params["X-Amz-Security-Token"] = credentials.token

    # Canonical query string (sorted by key)
    canonical_querystring = "&".join(
        f"{_uri_encode(k)}={_uri_encode(v)}"
        for k, v in sorted(params.items())
    )

    # Canonical request
    canonical_request = (
        f"GET\n"
        f"{PATH}\n"
        f"{canonical_querystring}\n"
        f"host:bedrock-runtime.{REGION}.amazonaws.com\n"
        f"\n"
        f"host\n"
        f"e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
    )

    # String to sign
    import hashlib
    string_to_sign = (
        f"AWS4-HMAC-SHA256\n"
        f"{amz_date}\n"
        f"{credential_scope}\n"
        f"{hashlib.sha256(canonical_request.encode('utf-8')).hexdigest()}"
    )

    # Signing key
    import hmac
    def _sign(key, msg):
        return hmac.new(key, msg.encode("utf-8"), hashlib.sha256).digest()

    k_date = _sign(f"AWS4{credentials.secret_key}".encode("utf-8"), datestamp)
    k_region = _sign(k_date, REGION)
    k_service = _sign(k_region, SERVICE)
    k_signing = _sign(k_service, "aws4_request")

    signature = hmac.new(
        k_signing, string_to_sign.encode("utf-8"), hashlib.sha256
    ).hexdigest()

    # Build final WSS URL
    wss_url = (
        f"wss://bedrock-runtime.{REGION}.amazonaws.com{PATH}"
        f"?{canonical_querystring}"
        f"&X-Amz-Signature={signature}"
    )

    return wss_url


def _uri_encode(value: str) -> str:
    """URI-encode a value per AWS SigV4 rules."""
    import urllib.parse
    return urllib.parse.quote(value, safe="~")


def _error_response(status: int, message: str) -> dict:
    return {
        "statusCode": status,
        "body": json.dumps({"success": False, "error_message": message}),
    }
