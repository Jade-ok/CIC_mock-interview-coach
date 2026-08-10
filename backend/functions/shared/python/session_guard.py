"""Hosted interview admission and per-stage abuse controls.

Pure local execution bypasses these controls. Hosted callers receive an opaque
token that is stored only as a SHA-256 digest, bound to the trusted CloudFront
viewer address, and consumed through bounded stage attempts.
"""

from __future__ import annotations

import hashlib
import ipaddress
import json
import logging
import os
import secrets
import time
from datetime import datetime, timezone
from typing import Any

import boto3
from botocore.exceptions import ClientError

logger = logging.getLogger(__name__)

LOCAL_SESSION_TOKEN = "local-development"
SESSION_TTL_SECONDS = 2 * 60 * 60
COUNTER_TTL_SECONDS = 3 * 24 * 60 * 60
MAX_TOKEN_LENGTH = 256

STAGE_ATTEMPT_LIMITS = {
    "pdf_parser": 2,
    "analyst": 2,
    "interviewer": 2,
    "evaluator": 2,
    "voice_session": 3,
}

_dynamodb_client = None


class SessionGuardError(Exception):
    """Safe, user-facing hosted session error."""

    def __init__(self, message: str, status_code: int, code: str):
        super().__init__(message)
        self.status_code = status_code
        self.code = code


class DailyLimitReached(SessionGuardError):
    def __init__(self):
        super().__init__(
            "The demo has reached its interview limit for today. Please try again tomorrow.",
            429,
            "DAILY_INTERVIEW_LIMIT_REACHED",
        )


class ViewerLimitReached(SessionGuardError):
    def __init__(self):
        super().__init__(
            "This network has reached its interview limit for today. Please try again tomorrow.",
            429,
            "VIEWER_INTERVIEW_LIMIT_REACHED",
        )


class InvalidSession(SessionGuardError):
    def __init__(self):
        super().__init__(
            "Your interview session is missing or expired. Please start a new interview.",
            401,
            "INVALID_INTERVIEW_SESSION",
        )


class StageLimitReached(SessionGuardError):
    def __init__(self):
        super().__init__(
            "This interview step has reached its retry limit. Please start a new interview.",
            429,
            "INTERVIEW_STAGE_LIMIT_REACHED",
        )


def hosted_guardrails_enabled() -> bool:
    return os.environ.get("HOSTED_GUARDRAILS_ENABLED", "false").lower() == "true"


def _client():
    global _dynamodb_client
    if _dynamodb_client is None:
        _dynamodb_client = boto3.client("dynamodb")
    return _dynamodb_client


def _table_name() -> str:
    name = os.environ.get("HOSTED_SESSION_TABLE", "").strip()
    if not name:
        raise SessionGuardError(
            "Interview admission is temporarily unavailable.", 503, "SESSION_GUARD_UNAVAILABLE"
        )
    return name


def _positive_int_env(name: str, default: int) -> int:
    try:
        value = int(os.environ.get(name, str(default)))
    except ValueError as exc:
        raise SessionGuardError(
            "Interview admission is temporarily unavailable.", 503, "SESSION_GUARD_UNAVAILABLE"
        ) from exc
    if value < 1:
        raise SessionGuardError(
            "Interview admission is temporarily unavailable.", 503, "SESSION_GUARD_UNAVAILABLE"
        )
    return value


def _headers(event: dict[str, Any]) -> dict[str, str]:
    return {str(key).lower(): str(value) for key, value in (event.get("headers") or {}).items()}


def _viewer_ip(event: dict[str, Any]) -> str:
    """Read CloudFront's immutable viewer address and remove the source port."""
    address = _headers(event).get("cloudfront-viewer-address", "").strip()
    if not address:
        raise SessionGuardError(
            "Interview admission must be requested through the hosted application.",
            403,
            "UNTRUSTED_INTERVIEW_REQUEST",
        )

    candidate = address
    if address.startswith("[") and "]:" in address:
        candidate = address[1 : address.rfind("]")]
    else:
        host, separator, port = address.rpartition(":")
        if separator and port.isdigit():
            candidate = host

    try:
        return ipaddress.ip_address(candidate).compressed
    except ValueError as exc:
        raise SessionGuardError(
            "Interview admission must be requested through the hosted application.",
            403,
            "UNTRUSTED_INTERVIEW_REQUEST",
        ) from exc


def _digest(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def _payload(event: dict[str, Any]) -> dict[str, Any]:
    body = event.get("body")
    if isinstance(body, str):
        try:
            parsed = json.loads(body)
        except json.JSONDecodeError as exc:
            raise InvalidSession() from exc
        return parsed if isinstance(parsed, dict) else {}
    return event if isinstance(event, dict) else {}


def start_interview_session(event: dict[str, Any]) -> dict[str, Any]:
    """Atomically reserve one global and one per-viewer daily interview slot."""
    if not hosted_guardrails_enabled():
        return {
            "session_token": LOCAL_SESSION_TOKEN,
            "expires_in": SESSION_TTL_SECONDS,
        }

    viewer_hash = _digest(_viewer_ip(event))
    token = secrets.token_urlsafe(32)
    token_hash = _digest(token)
    now = int(time.time())
    day = datetime.fromtimestamp(now, timezone.utc).strftime("%Y-%m-%d")
    global_limit = _positive_int_env("HOSTED_DAILY_INTERVIEW_LIMIT", 100)
    viewer_limit = _positive_int_env("HOSTED_DAILY_VIEWER_LIMIT", 100)
    table_name = _table_name()
    global_key = f"daily#{day}"
    viewer_key = f"viewer#{day}#{viewer_hash}"
    session_key = f"session#{token_hash}"

    update_names = {"#count": "count", "#expires": "expires_at"}
    try:
        _client().transact_write_items(
            TransactItems=[
                {
                    "Update": {
                        "TableName": table_name,
                        "Key": {"pk": {"S": global_key}},
                        "UpdateExpression": (
                            "SET #count = if_not_exists(#count, :zero) + :one, "
                            "#expires = :expires"
                        ),
                        "ConditionExpression": (
                            "attribute_not_exists(#count) OR #count < :limit"
                        ),
                        "ExpressionAttributeNames": update_names,
                        "ExpressionAttributeValues": {
                            ":zero": {"N": "0"},
                            ":one": {"N": "1"},
                            ":limit": {"N": str(global_limit)},
                            ":expires": {"N": str(now + COUNTER_TTL_SECONDS)},
                        },
                    }
                },
                {
                    "Update": {
                        "TableName": table_name,
                        "Key": {"pk": {"S": viewer_key}},
                        "UpdateExpression": (
                            "SET #count = if_not_exists(#count, :zero) + :one, "
                            "#expires = :expires"
                        ),
                        "ConditionExpression": (
                            "attribute_not_exists(#count) OR #count < :limit"
                        ),
                        "ExpressionAttributeNames": update_names,
                        "ExpressionAttributeValues": {
                            ":zero": {"N": "0"},
                            ":one": {"N": "1"},
                            ":limit": {"N": str(viewer_limit)},
                            ":expires": {"N": str(now + COUNTER_TTL_SECONDS)},
                        },
                    }
                },
                {
                    "Put": {
                        "TableName": table_name,
                        "Item": {
                            "pk": {"S": session_key},
                            "viewer_hash": {"S": viewer_hash},
                            "created_at": {"N": str(now)},
                            "expires_at": {"N": str(now + SESSION_TTL_SECONDS)},
                        },
                        "ConditionExpression": "attribute_not_exists(pk)",
                    }
                },
            ]
        )
    except ClientError as exc:
        if exc.response.get("Error", {}).get("Code") == "TransactionCanceledException":
            global_count = _read_counter(table_name, global_key)
            viewer_count = _read_counter(table_name, viewer_key)
            if global_count >= global_limit:
                raise DailyLimitReached() from exc
            if viewer_count >= viewer_limit:
                raise ViewerLimitReached() from exc
        logger.exception("Unable to create hosted interview session")
        raise SessionGuardError(
            "Interview admission is temporarily unavailable.", 503, "SESSION_GUARD_UNAVAILABLE"
        ) from exc

    return {
        "session_token": token,
        "expires_in": SESSION_TTL_SECONDS,
    }


def _read_counter(table_name: str, key: str) -> int:
    try:
        response = _client().get_item(
            TableName=table_name,
            Key={"pk": {"S": key}},
            ConsistentRead=True,
            ProjectionExpression="#count",
            ExpressionAttributeNames={"#count": "count"},
        )
        return int(response.get("Item", {}).get("count", {}).get("N", "0"))
    except (ClientError, TypeError, ValueError):
        return 0


def authorize_stage(event: dict[str, Any], stage: str) -> None:
    """Validate a hosted token and atomically claim one stage attempt."""
    if not hosted_guardrails_enabled():
        return
    if stage not in STAGE_ATTEMPT_LIMITS:
        raise ValueError(f"Unknown guarded stage: {stage}")

    token = _payload(event).get("session_token")
    if not isinstance(token, str) or not token or len(token) > MAX_TOKEN_LENGTH:
        raise InvalidSession()

    viewer_hash = _digest(_viewer_ip(event))
    now = int(time.time())
    attempt_attribute = f"{stage}_attempts"
    table_name = _table_name()
    key = {"pk": {"S": f"session#{_digest(token)}"}}
    try:
        _client().update_item(
            TableName=table_name,
            Key=key,
            UpdateExpression="SET #attempts = if_not_exists(#attempts, :zero) + :one",
            ConditionExpression=(
                "attribute_exists(pk) AND #expires > :now AND #viewer = :viewer "
                "AND (attribute_not_exists(#attempts) OR #attempts < :limit)"
            ),
            ExpressionAttributeNames={
                "#attempts": attempt_attribute,
                "#expires": "expires_at",
                "#viewer": "viewer_hash",
            },
            ExpressionAttributeValues={
                ":zero": {"N": "0"},
                ":one": {"N": "1"},
                ":now": {"N": str(now)},
                ":viewer": {"S": viewer_hash},
                ":limit": {"N": str(STAGE_ATTEMPT_LIMITS[stage])},
            },
        )
    except ClientError as exc:
        if exc.response.get("Error", {}).get("Code") == "ConditionalCheckFailedException":
            item = _read_session(table_name, key)
            if (
                not item
                or int(item.get("expires_at", {}).get("N", "0")) <= now
                or item.get("viewer_hash", {}).get("S") != viewer_hash
            ):
                raise InvalidSession() from exc
            raise StageLimitReached() from exc
        logger.exception("Unable to authorize hosted interview stage")
        raise SessionGuardError(
            "Interview admission is temporarily unavailable.", 503, "SESSION_GUARD_UNAVAILABLE"
        ) from exc


def _read_session(table_name: str, key: dict[str, dict[str, str]]) -> dict[str, Any]:
    try:
        return _client().get_item(
            TableName=table_name,
            Key=key,
            ConsistentRead=True,
        ).get("Item", {})
    except ClientError:
        return {}


def error_response(error: SessionGuardError) -> dict[str, Any]:
    return {
        "statusCode": error.status_code,
        "headers": {"Content-Type": "application/json"},
        "body": json.dumps({"status": "error", "error": str(error), "code": error.code}),
    }
