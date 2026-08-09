"""Input validation for the pdf_parser Lambda."""

import json

# 4 MB in bytes. Base64 encodes each three-byte block as four characters.
MAX_PDF_SIZE_BYTES = 4_194_304
MAX_BASE64_LENGTH = 4 * ((MAX_PDF_SIZE_BYTES + 2) // 3)
MAX_JOB_POSTING_TEXT_CHARS = 5_000

VALID_JOB_POSTING_FORMATS = ("pdf", "text")


def _base64_content_exceeds_limit(content: str) -> bool:
    """Return whether base64 content represents more than 4 MB of bytes."""
    padding = len(content) - len(content.rstrip("="))
    decoded_size = (len(content) * 3) // 4 - padding
    return len(content) > MAX_BASE64_LENGTH or decoded_size > MAX_PDF_SIZE_BYTES


def detect_invocation_mode(event: dict) -> dict:
    """Detect whether the Lambda was invoked via Function URL or directly.

    If event has a 'body' key with a string value, this is Function URL mode:
    parse JSON from event['body'] and return the resulting dict.
    Otherwise, return event as-is (Direct mode).

    Returns:
        Extracted payload dict.

    Raises:
        ValueError: If event['body'] is present but contains invalid JSON.
    """
    body = event.get("body")
    if isinstance(body, str):
        try:
            return json.loads(body)
        except (json.JSONDecodeError, TypeError) as exc:
            raise ValueError("Failed to parse request body as JSON") from exc
    return event


def validate_request(payload: dict) -> tuple[bool, str | None]:
    """Validate the pdf_parser request payload.

    Checks:
    - At least one document present (resume or job_posting)
    - Decoded PDF content size <= 4 MiB per document
    - Plain-text job postings <= 5,000 characters
    - Required fields present for each document type
    - Format flag is valid ("pdf" or "text") for job_posting

    Args:
        payload: The request payload dict.

    Returns:
        (is_valid, error_message_or_none) tuple.
    """
    resume = payload.get("resume")
    job_posting = payload.get("job_posting")

    # At least one document must be present
    if resume is None and job_posting is None:
        return False, "Request must contain at least one document (resume or job_posting)"

    # Validate resume if present
    if resume is not None:
        valid, error = _validate_document(resume, "resume")
        if not valid:
            return False, error

    # Validate job_posting if present
    if job_posting is not None:
        valid, error = _validate_job_posting(job_posting)
        if not valid:
            return False, error

    return True, None


def _validate_document(doc: dict, doc_type: str) -> tuple[bool, str | None]:
    """Validate a single document entry (resume or job_posting base fields).

    Checks required fields and base64 size limit.
    """
    if not isinstance(doc, dict):
        return False, f"'{doc_type}' must be an object"

    # Check required 'content' field
    if "content" not in doc:
        return False, f"Missing required fields: {doc_type}.content"

    content = doc["content"]
    if not isinstance(content, str):
        return False, f"'{doc_type}.content' must be a string"

    # Adjacent decoded sizes can share one base64 length because encoding uses
    # 3-byte blocks, so the padding-aware decoded estimate is also required.
    if _base64_content_exceeds_limit(content):
        return False, f"{doc_type} exceeds the 4 MB size limit"

    return True, None


def _validate_job_posting(doc: dict) -> tuple[bool, str | None]:
    """Validate job_posting-specific fields including format flag."""
    if not isinstance(doc, dict):
        return False, "'job_posting' must be an object"

    # Check required fields
    missing_fields = []
    if "content" not in doc:
        missing_fields.append("job_posting.content")
    if "format" not in doc:
        missing_fields.append("job_posting.format")

    if missing_fields:
        return False, f"Missing required fields: {', '.join(missing_fields)}"

    content = doc["content"]
    if not isinstance(content, str):
        return False, "'job_posting.content' must be a string"

    # Validate format flag
    format_flag = doc["format"]
    if format_flag not in VALID_JOB_POSTING_FORMATS:
        return False, f"Invalid format flag: '{format_flag}'. Must be 'pdf' or 'text'"

    if format_flag == "pdf":
        too_large = _base64_content_exceeds_limit(content)
        error = "job_posting exceeds the 4 MB size limit"
    else:
        too_large = len(content) > MAX_JOB_POSTING_TEXT_CHARS
        error = (
            f"job_posting exceeds the {MAX_JOB_POSTING_TEXT_CHARS}-character limit"
        )

    if too_large:
        return False, error

    return True, None
