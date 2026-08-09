"""Input-size guardrail tests for the Analyst."""

from analyst.validation import (
    MAX_JOB_POSTING_TEXT_CHARS,
    MAX_RESUME_TEXT_CHARS,
    validate_request,
)


def test_accepts_text_at_the_configured_limits(monkeypatch):
    monkeypatch.setenv("HOSTED_GUARDRAILS_ENABLED", "true")
    valid, error = validate_request(
        {
            "resume_text": "r" * MAX_RESUME_TEXT_CHARS,
            "job_posting_text": "j" * MAX_JOB_POSTING_TEXT_CHARS,
        }
    )

    assert valid is True
    assert error is None


def test_rejects_resume_above_the_limit(monkeypatch):
    monkeypatch.setenv("HOSTED_GUARDRAILS_ENABLED", "true")
    valid, error = validate_request(
        {
            "resume_text": "r" * (MAX_RESUME_TEXT_CHARS + 1),
            "job_posting_text": "job",
        }
    )

    assert valid is False
    assert error == f"resume_text exceeds {MAX_RESUME_TEXT_CHARS} characters"


def test_rejects_job_posting_above_the_limit_in_hosted_mode(monkeypatch):
    monkeypatch.setenv("HOSTED_GUARDRAILS_ENABLED", "true")
    valid, error = validate_request(
        {
            "resume_text": "resume",
            "job_posting_text": "j" * (MAX_JOB_POSTING_TEXT_CHARS + 1),
        }
    )

    assert valid is False
    assert error == (
        f"job_posting_text exceeds {MAX_JOB_POSTING_TEXT_CHARS} characters"
    )


def test_rejects_job_posting_above_the_limit_in_local_mode(monkeypatch):
    monkeypatch.delenv("HOSTED_GUARDRAILS_ENABLED", raising=False)

    valid, error = validate_request(
        {
            "resume_text": "resume",
            "job_posting_text": "j" * (MAX_JOB_POSTING_TEXT_CHARS + 1),
        }
    )

    assert valid is False
    assert error == (
        f"job_posting_text exceeds {MAX_JOB_POSTING_TEXT_CHARS} characters"
    )


def test_local_mode_does_not_apply_hosted_resume_limit(monkeypatch):
    monkeypatch.delenv("HOSTED_GUARDRAILS_ENABLED", raising=False)

    valid, error = validate_request(
        {
            "resume_text": "r" * (MAX_RESUME_TEXT_CHARS + 1),
            "job_posting_text": "j" * MAX_JOB_POSTING_TEXT_CHARS,
        }
    )

    assert valid is True
    assert error is None
