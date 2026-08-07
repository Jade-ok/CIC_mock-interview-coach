"""Orchestrator for the Analyst Lambda — wires the full analysis pipeline."""

from prompt_builder import build_converse_request
from bedrock_client import call_converse, BedrockCallFailed
from parser import parse_converse_response, check_analysis_warnings, SchemaValidationError


def analyze(payload: dict) -> dict:
    """Orchestrate the full resume analysis pipeline.

    Steps:
    1. Extract resume_text and job_posting_text from payload (already validated by handler)
    2. Build the Bedrock Converse API request
    3. Call Bedrock (bedrock_client handles transient retries internally)
    4. Parse and validate the response
    5. On SchemaValidationError, retry the Bedrock call ONE more time
    6. Check for analysis warnings (deterministic)
    7. Merge warnings into the analyst output
    8. Return the final analyst_output dict

    Args:
        payload: Validated request payload with resume_text and job_posting_text.

    Returns:
        The analyst_output dict conforming to schema v1.0.

    Raises:
        BedrockCallFailed: If Bedrock calls fail (propagates to handler).
        SchemaValidationError: If schema validation fails after retry (propagates to handler).
    """
    resume_text = payload["resume_text"]
    job_posting_text = payload["job_posting_text"]

    # Build the Converse API request
    request = build_converse_request(resume_text, job_posting_text)

    # Call Bedrock and parse — retry once on schema validation failure
    try:
        response = call_converse(request)
        analyst_output = parse_converse_response(response)
    except SchemaValidationError:
        # Schema validation failed — retry with a fresh Bedrock call
        response = call_converse(request)
        analyst_output = parse_converse_response(response)

    # Check for data quality warnings (deterministic logic)
    warnings = check_analysis_warnings(analyst_output, resume_text, job_posting_text)

    # Replace whatever the LLM put in analysis_warnings with the deterministic result
    analyst_output["analysis_warnings"] = warnings

    return analyst_output
