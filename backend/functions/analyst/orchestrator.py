"""Orchestrator for the Analyst Lambda — wires the full analysis pipeline."""

import os

try:
    from .prompt_builder import build_chat_request
    from .bedrock_client import call_chat_completion, BedrockCallFailed
    from .parser import (
        SchemaValidationError,
        check_analysis_warnings,
        parse_chat_response,
    )
except ImportError:  # Lambda loads modules from the function root.
    from prompt_builder import build_chat_request
    from bedrock_client import call_chat_completion, BedrockCallFailed
    from parser import SchemaValidationError, check_analysis_warnings, parse_chat_response


def analyze(payload: dict) -> dict:
    """Orchestrate the full resume analysis pipeline.

    Steps:
    1. Extract resume_text and job_posting_text from payload (already validated by handler)
    2. Build the Bedrock Mantle Chat Completions request
    3. Call Bedrock Mantle once (transport failures are surfaced immediately)
    4. Parse and validate the response
    5. Locally, retry once on SchemaValidationError; hosted mode returns it
    6. Check for analysis warnings (deterministic)
    7. Merge warnings into the analyst output
    8. Return the final analyst_output dict

    Args:
        payload: Validated request payload with resume_text and job_posting_text.

    Returns:
        The analyst_output dict conforming to schema v1.0.

    Raises:
        BedrockCallFailed: If a Bedrock call fails (propagates to handler).
        SchemaValidationError: If hosted validation fails, or local validation
            fails after recovery (propagates to handler).
    """
    resume_text = payload["resume_text"]
    job_posting_text = payload["job_posting_text"]

    request = build_chat_request(resume_text, job_posting_text)

    # Local development retains one schema-recovery call. Hosted requests use a
    # single bounded model call so a public request cannot multiply model cost.
    try:
        response = call_chat_completion(request)
        analyst_output = parse_chat_response(response)
    except SchemaValidationError:
        if os.getenv("HOSTED_GUARDRAILS_ENABLED", "").lower() == "true":
            raise
        # Schema validation failed — retry with a fresh Bedrock call
        response = call_chat_completion(request)
        analyst_output = parse_chat_response(response)

    # Check for data quality warnings (deterministic logic)
    warnings = check_analysis_warnings(analyst_output, resume_text, job_posting_text)

    # Replace whatever the LLM put in analysis_warnings with the deterministic result
    analyst_output["analysis_warnings"] = warnings

    return analyst_output
