"""Tests for PDF parser request validation."""

import json

import pytest

from pdf_parser.validation import detect_invocation_mode, validate_request


def test_detects_function_url_mode():
    event = {"body": json.dumps({"resume": {"content": "abc", "format": "pdf"}})}

    assert detect_invocation_mode(event) == {
        "resume": {"content": "abc", "format": "pdf"}
    }


def test_detects_direct_mode():
    event = {"resume": {"content": "abc", "format": "pdf"}}

    assert detect_invocation_mode(event) == event


def test_rejects_invalid_function_url_json():
    with pytest.raises(ValueError, match="Failed to parse request body as JSON"):
        detect_invocation_mode({"body": "not-json"})


@pytest.mark.parametrize(
    ("payload", "expected_error"),
    [
        ({}, "at least one document"),
        (
            {"job_posting": {"content": "data", "format": "docx"}},
            "Invalid format flag",
        ),
        ({"resume": {}}, "Missing required fields"),
    ],
)
def test_rejects_invalid_requests(payload, expected_error):
    valid, error = validate_request(payload)

    assert valid is False
    assert expected_error in error


@pytest.mark.parametrize(
    "payload",
    [
        {"resume": {"content": "base64data"}},
        {"job_posting": {"content": "data", "format": "pdf"}},
    ],
)
def test_accepts_valid_requests(payload):
    valid, error = validate_request(payload)

    assert valid is True
    assert error is None


def test_rejects_oversized_document():
    valid, error = validate_request({"resume": {"content": "A" * 6_000_000}})

    assert valid is False
    assert "4 MB size limit" in error


def test_missing_job_posting_format_names_required_field():
    valid, error = validate_request({"job_posting": {"content": "data"}})

    assert valid is False
    assert "format" in error
