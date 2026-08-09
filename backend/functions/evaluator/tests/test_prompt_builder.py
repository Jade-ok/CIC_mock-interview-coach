"""Unit tests for the Evaluator prompt builder and tool schema."""

from evaluator.prompt_builder import build, SYSTEM_PROMPT, _format_user_message, _build_tool_config
from evaluator.schemas import EVALUATION_TOOL_SCHEMA


# --- Test fixtures ---

def _sample_conversation():
    return [
        {
            "point_id": "point_1",
            "turn_type": "main_question",
            "question": "Tell me about a project where you led a team.",
            "answer": "I led a team of 4 in my SE course to build a REST API."
        },
        {
            "point_id": "point_1",
            "turn_type": "follow_up",
            "question": "What was the most challenging part?",
            "answer": "Coordinating schedules and resolving merge conflicts in Git."
        },
    ]


def _sample_analyst_output():
    return {
        "target_role": {
            "title": "Software Engineering Intern",
            "required_skills": ["Python", "testing", "teamwork"],
            "evaluation_priorities": ["technical understanding", "learning ability"]
        },
        "resume_job_alignment": {
            "strong_matches": [
                {"resume_evidence": "Built REST API in SE course", "job_requirement": "API development"}
            ],
            "partial_matches": [
                {"resume_evidence": "Used pytest in hackathon", "job_requirement": "testing"}
            ],
            "areas_to_explore": [
                {"topic": "cloud deployment", "reason": "No evidence of cloud experience"}
            ]
        },
        "interview_plan": [
            {
                "topic": "team leadership",
                "priority": 1,
                "question_type": "behavioral",
                "target_skill": "teamwork",
                "source_experience_id": "exp_1",
            }
        ],
        "selected_experiences": [
            {
                "experience_id": "exp_1",
                "title": "REST API Course Project",
                "experience_type": "academic_project",
                "organization": "University of Victoria",
                "summary": "Built a REST API with Flask for a course project.",
                "skills_demonstrated": ["Python", "Flask", "testing"],
                "candidate_claims": ["Reduced response time by 40%", "Achieved 95% test coverage"],
                "relevance_reason": "Directly demonstrates API development skills required for the role.",
            }
        ],
        "analysis_warnings": ["Limited evidence of production deployment experience."]
    }


# --- Tests ---

def test_build_returns_tuple_of_three():
    """Verify build() returns a tuple of (system, messages, tool_config)."""
    result = build(_sample_conversation(), _sample_analyst_output())

    assert isinstance(result, tuple)
    assert len(result) == 3

    system, messages, tool_config = result
    assert isinstance(system, str)
    assert isinstance(messages, list)
    assert isinstance(tool_config, dict)


def test_system_prompt_contains_calibration():
    """Verify SYSTEM_PROMPT mentions co-op, 1-5, and all four scoring dimensions."""
    assert "co-op" in SYSTEM_PROMPT
    assert "1-5" in SYSTEM_PROMPT
    assert "concrete_example" in SYSTEM_PROMPT
    assert "star_structure" in SYSTEM_PROMPT
    assert "link_to_job" in SYSTEM_PROMPT
    assert "quantifiable_outcome" in SYSTEM_PROMPT


def test_system_prompt_contains_scoring_guide():
    """Verify all 5 scoring levels (5, 4, 3, 2, 1) are described in the system prompt."""
    assert "- 5:" in SYSTEM_PROMPT
    assert "- 4:" in SYSTEM_PROMPT
    assert "- 3:" in SYSTEM_PROMPT
    assert "- 2:" in SYSTEM_PROMPT
    assert "- 1:" in SYSTEM_PROMPT


def test_user_message_contains_conversation():
    """Verify the question and answer text appear in the formatted user message."""
    conversation = _sample_conversation()
    analyst_output = _sample_analyst_output()

    message = _format_user_message(conversation, analyst_output)

    assert "Tell me about a project where you led a team." in message
    assert "I led a team of 4 in my SE course to build a REST API." in message
    assert "What was the most challenging part?" in message
    assert "Coordinating schedules and resolving merge conflicts in Git." in message


def test_user_message_contains_target_role():
    """Verify target_role title appears in the formatted user message."""
    conversation = _sample_conversation()
    analyst_output = _sample_analyst_output()

    message = _format_user_message(conversation, analyst_output)

    assert "Software Engineering Intern" in message


def test_user_message_contains_alignment():
    """Verify resume_job_alignment data appears in the formatted user message."""
    conversation = _sample_conversation()
    analyst_output = _sample_analyst_output()

    message = _format_user_message(conversation, analyst_output)

    # Strong match data
    assert "Built REST API in SE course" in message
    assert "API development" in message
    # Partial match data
    assert "Used pytest in hackathon" in message
    assert "testing" in message
    # Areas to explore
    assert "cloud deployment" in message
    assert "No evidence of cloud experience" in message


def test_user_message_contains_interview_plan():
    """Verify interview_plan data appears in the formatted user message."""
    conversation = _sample_conversation()
    analyst_output = _sample_analyst_output()

    message = _format_user_message(conversation, analyst_output)

    assert "team leadership" in message
    assert "Priority 1" in message
    assert "teamwork" in message
    assert "behavioral" in message


def test_user_message_contains_candidate_claims():
    """Verify candidate_claims appear in the formatted user message."""
    conversation = _sample_conversation()
    analyst_output = _sample_analyst_output()

    message = _format_user_message(conversation, analyst_output)

    assert "Reduced response time by 40%" in message
    assert "Achieved 95% test coverage" in message


def test_user_message_contains_organization():
    """Verify organization name appears in the formatted user message."""
    conversation = _sample_conversation()
    analyst_output = _sample_analyst_output()

    message = _format_user_message(conversation, analyst_output)

    assert "University of Victoria" in message


def test_tool_config_has_forced_choice():
    """Verify tool_choice forces submit_evaluation."""
    tool_config = _build_tool_config()

    assert tool_config["tool_choice"] == {
        "type": "function",
        "function": {"name": "submit_evaluation"},
    }


def test_schema_has_required_fields():
    """Verify EVALUATION_TOOL_SCHEMA has all required top-level output fields."""
    schema = EVALUATION_TOOL_SCHEMA
    assert schema["name"] == "submit_evaluation"

    input_schema = schema["inputSchema"]["json"]
    required_fields = input_schema["required"]

    assert "per_question_scores" in required_fields
    assert "strengths" in required_fields
    assert "improvements" in required_fields
    assert "keywords_covered" in required_fields
    assert "keywords_not_covered" in required_fields
    assert "contextual_advice" in required_fields
