"""
Signing Lambda: generates a presigned WebSocket URL for Nova Sonic.

The frontend calls this Lambda, gets a time-limited signed URL, and
connects directly to Nova Sonic — no proxy needed.
"""

import json
import os
import datetime
import hashlib
import hmac
import urllib.parse


REGION = os.environ.get("SIGNING_REGION", os.environ.get("AWS_REGION", "us-east-1"))
MODEL_ID = os.environ.get("MODEL_ID", "amazon.nova-2-sonic-v1:0")
SERVICE = "bedrock"
ENDPOINT = f"bedrock-runtime.{REGION}.amazonaws.com"
URI = f"/model/{MODEL_ID}/invoke-with-bidirectional-stream"
EXPIRY_SECONDS = 300  # 5 minutes


def lambda_handler(event: dict, context) -> dict:
    """Generate a presigned WebSocket URL for Nova Sonic."""
    try:
        # Get credentials from Lambda execution environment
        access_key = os.environ.get("AWS_ACCESS_KEY_ID")
        secret_key = os.environ.get("AWS_SECRET_ACCESS_KEY")
        session_token = os.environ.get("AWS_SESSION_TOKEN")

        if not access_key or not secret_key:
            return _error_response(500, "AWS credentials not available")

        url = _create_presigned_url(
            access_key=access_key,
            secret_key=secret_key,
            session_token=session_token,
            region=REGION,
            endpoint=ENDPOINT,
            uri=URI,
            expiry=EXPIRY_SECONDS,
        )

        return {
            "statusCode": 200,
            "body": json.dumps({"url": url}),
        }

    except Exception as e:
        return _error_response(500, f"Failed to generate presigned URL: {str(e)}")


def _create_presigned_url(
    access_key: str,
    secret_key: str,
    session_token: str | None,
    region: str,
    endpoint: str,
    uri: str,
    expiry: int,
) -> str:
    """
    Create a SigV4-presigned WebSocket URL for Bedrock streaming.

    Based on the AWS SigV4 signing process for WebSocket connections.
    """
    now = datetime.datetime.utcnow()
    datestamp = now.strftime("%Y%m%d")
    amz_date = now.strftime("%Y%m%dT%H%M%SZ")
    credential_scope = f"{datestamp}/{region}/{SERVICE}/aws4_request"
    credential = f"{access_key}/{credential_scope}"

    # Query parameters (in alphabetical order for signing)
    params = {
        "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
        "X-Amz-Credential": credential,
        "X-Amz-Date": amz_date,
        "X-Amz-Expires": str(expiry),
        "X-Amz-SignedHeaders": "host",
    }
    if session_token:
        params["X-Amz-Security-Token"] = session_token

    # Canonical query string (sorted)
    canonical_querystring = "&".join(
        f"{urllib.parse.quote(k, safe='')}={urllib.parse.quote(v, safe='')}"
        for k, v in sorted(params.items())
    )

    # Canonical request
    canonical_headers = f"host:{endpoint}\n"
    signed_headers = "host"
    payload_hash = hashlib.sha256(b"").hexdigest()

    canonical_request = "\n".join([
        "GET",
        uri,
        canonical_querystring,
        canonical_headers,
        signed_headers,
        payload_hash,
    ])

    # String to sign
    string_to_sign = "\n".join([
        "AWS4-HMAC-SHA256",
        amz_date,
        credential_scope,
        hashlib.sha256(canonical_request.encode("utf-8")).hexdigest(),
    ])

    # Signing key
    signing_key = _get_signature_key(secret_key, datestamp, region, SERVICE)

    # Signature
    signature = hmac.new(
        signing_key,
        string_to_sign.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()

    # Build final URL
    signed_url = f"wss://{endpoint}{uri}?{canonical_querystring}&X-Amz-Signature={signature}"

    return signed_url


def _get_signature_key(key: str, date_stamp: str, region: str, service: str) -> bytes:
    """Derive the SigV4 signing key."""
    k_date = _sign(f"AWS4{key}".encode("utf-8"), date_stamp)
    k_region = _sign(k_date, region)
    k_service = _sign(k_region, service)
    k_signing = _sign(k_service, "aws4_request")
    return k_signing


def _sign(key: bytes, msg: str) -> bytes:
    """HMAC-SHA256 sign."""
    return hmac.new(key, msg.encode("utf-8"), hashlib.sha256).digest()


def _error_response(status: int, message: str) -> dict:
    return {
        "statusCode": status,
        "body": json.dumps({"success": False, "error_message": message}),
    }
