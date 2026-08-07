"""Response parsing, schema validation, and warning generation for the Analyst Lambda."""

from __future__ import annotations

# Module-level constants
SCHEMA_VERSION = "1.0"
ALLOWED_EXPERIENCE_TYPES = [
    "internship",
    "coursework",
    "academic_project",
    "personal_project",
    "hackathon",
    "student_club",
]
REQUIRED_TOP_LEVEL_KEYS = [
    "schema_version",
    "candidate_profile",
    "target_role",
    "resume_job_alignment",
    "interview_plan",
    "selected_experiences",
    "analysis_warnings",
]
MIN_RESUME_WORDS = 50
MIN_JOB_POSTING_WORDS = 30
MAX_INTERVIEW_PLAN_ENTRIES = 5
MAX_SELECTED_EXPERIENCES = 5


class SchemaValidationError(Exception):
    """Raised when the analyst output does not conform to the expected schema."""

    pass


def parse_converse_response(response: dict) -> dict:
    """Extract and validate the tool_use result from a Bedrock Converse API response.

    Navigates the response structure to find the tool_use block, then validates
    the extracted dict against the analyst_output schema constraints.

    Args:
        response: Raw Converse API response dict.

    Returns:
        Validated analyst_output dict.

    Raises:
        SchemaValidationError: If the response structure is unexpected or the
            extracted output does not conform to the schema.
    """
    # Extract tool_use result from response
    try:
        content = response["output"]["message"]["content"]
        if not content:
            raise SchemaValidationError("Response contains no content blocks")
        block = content[0]
        if "toolUse" not in block:
            raise SchemaValidationError(
                "First content block is not a toolUse block"
            )
        result = block["toolUse"]["input"]
    except (KeyError, IndexError, TypeError) as e:
        raise SchemaValidationError(
            f"Failed to extract tool_use result from response: {e}"
        )

    # Validate all required top-level keys are present
    missing_keys = [key for key in REQUIRED_TOP_LEVEL_KEYS if key not in result]
    if missing_keys:
        raise SchemaValidationError(
            f"Missing required top-level keys: {', '.join(missing_keys)}"
        )

    # Validate schema_version
    if result["schema_version"] != SCHEMA_VERSION:
        raise SchemaValidationError(
            f"Invalid schema_version: expected '{SCHEMA_VERSION}', "
            f"got '{result['schema_version']}'"
        )

    # Validate selected_experiences count
    selected_experiences = result["selected_experiences"]
    if len(selected_experiences) > MAX_SELECTED_EXPERIENCES:
        raise SchemaValidationError(
            f"selected_experiences has {len(selected_experiences)} entries, "
            f"maximum is {MAX_SELECTED_EXPERIENCES}"
        )

    # Validate each experience
    for i, exp in enumerate(selected_experiences):
        # Validate experience_type
        exp_type = exp.get("experience_type")
        if exp_type not in ALLOWED_EXPERIENCE_TYPES:
            raise SchemaValidationError(
                f"selected_experiences[{i}].experience_type '{exp_type}' "
                f"is not in allowed set: {ALLOWED_EXPERIENCE_TYPES}"
            )

        # Validate relevance_score
        score = exp.get("relevance_score")
        if not isinstance(score, (int, float)):
            raise SchemaValidationError(
                f"selected_experiences[{i}].relevance_score must be a number, "
                f"got {type(score).__name__}"
            )
        if score < 0.0 or score > 1.0:
            raise SchemaValidationError(
                f"selected_experiences[{i}].relevance_score {score} "
                f"is outside valid range [0.0, 1.0]"
            )

    # Validate interview_plan count
    interview_plan = result["interview_plan"]
    if len(interview_plan) > MAX_INTERVIEW_PLAN_ENTRIES:
        raise SchemaValidationError(
            f"interview_plan has {len(interview_plan)} entries, "
            f"maximum is {MAX_INTERVIEW_PLAN_ENTRIES}"
        )

    return result


def check_analysis_warnings(
    analyst_output: dict, resume_text: str, job_posting_text: str
) -> list[str]:
    """Check for data quality issues and build a warnings list.

    Examines input text lengths and analysis results to detect conditions
    that downstream consumers should be aware of.

    Args:
        analyst_output: The validated analyst output dict.
        resume_text: The original resume text provided to the analyst.
        job_posting_text: The original job posting text provided to the analyst.

    Returns:
        List of warning strings. Empty list if no issues detected.
    """
    warnings = []

    # Check resume word count
    resume_words = len(resume_text.split())
    if resume_words < MIN_RESUME_WORDS:
        warnings.append("Insufficient resume content")

    # Check job posting word count
    job_posting_words = len(job_posting_text.split())
    if job_posting_words < MIN_JOB_POSTING_WORDS:
        warnings.append("Insufficient job posting content")

    # Check for low alignment
    selected_experiences = analyst_output.get("selected_experiences", [])
    if not selected_experiences:
        warnings.append("Low alignment between resume and job posting")

    return warnings
