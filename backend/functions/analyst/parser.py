"""Response parsing, schema validation, and warning generation for the Analyst."""

import json

# Module-level constants
SCHEMA_VERSION = "1.0"
ALLOWED_EXPERIENCE_TYPES = [
    "internship",
    "coursework",
    "academic_project",
    "personal_project",
    "hackathon",
    "student_club",
    "research",
    "volunteering",
    "work_experience",
    "other",
]
EXPERIENCE_TYPE_ALIASES = {
    "class_project": "academic_project",
    "club": "student_club",
    "club_work": "student_club",
    "co_op": "internship",
    "coop": "internship",
    "course_work": "coursework",
    "employment": "work_experience",
    "extracurricular": "student_club",
    "part_time_work": "work_experience",
    "professional_experience": "work_experience",
    "professional_project": "work_experience",
    "research_experience": "research",
    "research_project": "research",
    "school_project": "academic_project",
    "side_project": "personal_project",
    "student_organization": "student_club",
    "volunteer": "volunteering",
    "volunteer_work": "volunteering",
    "work": "work_experience",
}
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


def normalize_experience_type(value):
    """Map a model-provided experience label to a stable category.

    Forced tool schemas reduce output variation but do not guarantee that a
    model will always honor an enum. Known synonyms map to canonical values;
    unfamiliar non-empty strings become ``other`` so one label cannot fail the
    entire analysis.
    """
    if not isinstance(value, str) or not value.strip():
        raise SchemaValidationError(
            "experience_type must be a non-empty string"
        )

    normalized = value.strip().lower().replace("-", "_").replace(" ", "_")
    canonical = EXPERIENCE_TYPE_ALIASES.get(normalized, normalized)
    return canonical if canonical in ALLOWED_EXPERIENCE_TYPES else "other"


def parse_chat_response(response: dict) -> dict:
    """Extract and validate an analyst_output function call.

    Navigates the response structure to find the forced function call, then
    validates its arguments against the analyst_output schema constraints.

    Args:
        response: Raw Bedrock Mantle Chat Completions response.

    Returns:
        Validated analyst_output dict.

    Raises:
        SchemaValidationError: If the response structure is unexpected or the
            extracted output does not conform to the schema.
    """
    # Extract the first structured function call.
    try:
        tool_calls = response["choices"][0]["message"]["tool_calls"]
        if not tool_calls:
            raise SchemaValidationError("Response contains no function calls")
        function = tool_calls[0]["function"]
        if function["name"] != "analyst_output":
            raise SchemaValidationError("First function call is not analyst_output")
        arguments = function["arguments"]
        result = json.loads(arguments) if isinstance(arguments, str) else arguments
    except (KeyError, IndexError, TypeError, json.JSONDecodeError) as e:
        raise SchemaValidationError(
            f"Failed to extract analyst_output function call: {e}"
        )

    if not isinstance(result, dict):
        raise SchemaValidationError(
            "analyst_output function arguments must decode to a JSON object"
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
        # Normalize model synonyms while preserving a stable downstream enum.
        try:
            exp_type = normalize_experience_type(exp.get("experience_type"))
        except SchemaValidationError as exc:
            raise SchemaValidationError(
                f"selected_experiences[{i}].{exc}"
            ) from exc
        exp["experience_type"] = exp_type

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

    # Keep the profile summary consistent when it contains the same aliases.
    candidate_profile = result.get("candidate_profile")
    if isinstance(candidate_profile, dict):
        available_types = candidate_profile.get("experience_types_available")
        if isinstance(available_types, list):
            candidate_profile["experience_types_available"] = [
                normalize_experience_type(value)
                for value in available_types
                if isinstance(value, str) and value.strip()
            ]

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
