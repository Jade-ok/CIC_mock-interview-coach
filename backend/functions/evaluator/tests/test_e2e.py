"""End-to-end integration test for the Evaluator agent with mocked Bedrock."""

import json
from pathlib import Path
from unittest.mock import patch

import pytest

from evaluator.lambda_handler import handler

FIXTURES_DIR = Path(__file__).parent / "fixtures"

VALID_READINESS_LABELS = [
    "Interview ready",
    "Strong foundation",
    "Developing well",
    "Needs more practice",
    "Needs clearer examples",
]

# Realistic parsed function arguments returned by the Bedrock client
MOCK_LLM_RESPONSE = {
    "per_question_scores": [
        {
            "question_text": "Can you tell me about a time you worked on a team project and what your specific role was?",
            "feedback": {"strength": "Clearly described backend ownership.", "improvement": "Quantify the project scope."},
            "scores": {
                "concrete_example": 5,
                "star_structure": 4,
                "link_to_job": 4,
                "quantifiable_outcome": 3,
            },
        },
        {
            "question_text": "What was the most challenging technical decision you had to make during that project?",
            "feedback": {"strength": "Explained a concrete technical decision.", "improvement": "Connect the decision to the target role."},
            "scores": {
                "concrete_example": 5,
                "star_structure": 5,
                "link_to_job": 4,
                "quantifiable_outcome": 5,
            },
        },
        {
            "question_text": "Describe a situation where you had to learn a new technology quickly to complete a task.",
            "feedback": {"strength": "Showed rapid learning with a specific example.", "improvement": "Clarify the personal implementation details."},
            "scores": {
                "concrete_example": 5,
                "star_structure": 4,
                "link_to_job": 3,
                "quantifiable_outcome": 4,
            },
        },
        {
            "question_text": "How did you validate that your WebSocket implementation was working correctly under load?",
            "feedback": {"strength": "Used concrete testing metrics.", "improvement": "Explain how the results changed the design."},
            "scores": {
                "concrete_example": 4,
                "star_structure": 4,
                "link_to_job": 4,
                "quantifiable_outcome": 5,
            },
        },
        {
            "question_text": "Tell me about a time you received critical feedback and how you responded to it.",
            "feedback": {"strength": "Demonstrated growth from feedback.", "improvement": "State the resulting user or team impact."},
            "scores": {
                "concrete_example": 5,
                "star_structure": 5,
                "link_to_job": 5,
                "quantifiable_outcome": 4,
            },
        },
        {
            "question_text": "What specific testing practices did you adopt after that experience?",
            "feedback": {"strength": "Named specific testing practices.", "improvement": "Tie those practices to role requirements."},
            "scores": {
                "concrete_example": 4,
                "star_structure": 4,
                "link_to_job": 5,
                "quantifiable_outcome": 4,
            },
        },
    ],
    "strengths": [
        'You gave a clear, specific example of technical leadership — "I took on the role of backend lead, designing the database schema" immediately grounds your answer in a concrete contribution.',
        'Excellent quantification throughout — the "3x faster" query performance and "500 concurrent users" demonstrate you understand the importance of measurable impact.',
        "Your feedback story shows genuine professional growth, moving from defensive to proactive about code quality.",
    ],
    "improvements": [
        "For the team project question, try to include a specific metric about the project scope (e.g., number of endpoints, team velocity improvement) to strengthen the quantifiable_outcome dimension.",
        "When discussing the hackathon, connect the WebSocket skills more explicitly to the target role's microservices requirements — this would boost your link_to_job score.",
        "Consider structuring your answers more tightly around Situation-Action-Result to avoid tangential details.",
    ],
    "keywords_covered": ["REST API", "testing", "CI/CD"],
    "keywords_not_covered": ["AWS", "Docker"],
    "contextual_advice": [
        "The job description lists Docker as a preferred skill, but none of your answers mentioned containerization. Your CI/CD experience with GitHub Actions is a natural bridge — consider mentioning how you might containerize your Flask API for consistent deployments.",
        "Your resume shows strong testing skills from the internship, but the role also requires AWS experience. Consider framing your post-hackathon Locust testing as cloud-adjacent experience if you deployed it on any cloud infrastructure.",
    ],
}


def _load_sample_input() -> dict:
    """Load the sample input fixture and wrap it as a Lambda Function URL event."""
    with open(FIXTURES_DIR / "sample_input.json") as f:
        payload = json.load(f)
    return {"body": json.dumps(payload)}


@patch("evaluator.bedrock_client.invoke")
def test_e2e_happy_path_returns_200(mock_invoke):
    """Full happy path: valid input produces a 200 response."""
    mock_invoke.return_value = MOCK_LLM_RESPONSE
    event = _load_sample_input()

    response = handler(event, None)

    assert response["statusCode"] == 200


@patch("evaluator.bedrock_client.invoke")
def test_e2e_response_has_all_required_fields(mock_invoke):
    """Response body contains all fields from evaluator_output.json schema."""
    mock_invoke.return_value = MOCK_LLM_RESPONSE
    event = _load_sample_input()

    response = handler(event, None)
    body = json.loads(response["body"])

    required_fields = [
        "per_question_scores",
        "overall_scores",
        "question_count",
        "readiness_label",
        "strengths",
        "improvements",
        "contextual_advice",
        "interview_metadata",
    ]
    for field in required_fields:
        assert field in body, f"Missing required field: {field}"


@patch("evaluator.bedrock_client.invoke")
def test_e2e_per_question_scores_has_6_entries(mock_invoke):
    """per_question_scores has one entry per conversation turn (6 turns)."""
    mock_invoke.return_value = MOCK_LLM_RESPONSE
    event = _load_sample_input()

    response = handler(event, None)
    body = json.loads(response["body"])

    assert len(body["per_question_scores"]) == 6


@patch("evaluator.bedrock_client.invoke")
def test_e2e_all_scores_are_1_to_5(mock_invoke):
    """All per-question dimension scores are integers between 1 and 5."""
    mock_invoke.return_value = MOCK_LLM_RESPONSE
    event = _load_sample_input()

    response = handler(event, None)
    body = json.loads(response["body"])

    dimensions = [
        "concrete_example",
        "star_structure",
        "link_to_job",
        "quantifiable_outcome",
    ]
    for i, question in enumerate(body["per_question_scores"]):
        for dim in dimensions:
            score = question["scores"][dim]
            assert isinstance(score, int), (
                f"Question {i} {dim}: expected int, got {type(score)}"
            )
            assert 1 <= score <= 5, (
                f"Question {i} {dim}: score {score} not in range 1-5"
            )


@patch("evaluator.bedrock_client.invoke")
def test_e2e_overall_scores_structure(mock_invoke):
    """overall_scores has dimensions dict and total float."""
    mock_invoke.return_value = MOCK_LLM_RESPONSE
    event = _load_sample_input()

    response = handler(event, None)
    body = json.loads(response["body"])

    overall = body["overall_scores"]
    assert "dimensions" in overall
    assert "total" in overall

    dimensions = [
        "concrete_example",
        "star_structure",
        "link_to_job",
        "quantifiable_outcome",
    ]
    for dim in dimensions:
        assert dim in overall["dimensions"]
        avg = overall["dimensions"][dim]
        assert 1.0 <= avg <= 5.0, f"Dimension average {dim}={avg} out of range"

    assert 1.0 <= overall["total"] <= 5.0


@patch("evaluator.bedrock_client.invoke")
def test_e2e_readiness_label_is_valid(mock_invoke):
    """readiness_label is one of the 5 valid labels."""
    mock_invoke.return_value = MOCK_LLM_RESPONSE
    event = _load_sample_input()

    response = handler(event, None)
    body = json.loads(response["body"])

    assert body["readiness_label"] in VALID_READINESS_LABELS


@patch("evaluator.bedrock_client.invoke")
def test_e2e_question_count_equals_6(mock_invoke):
    """question_count matches the number of conversation turns."""
    mock_invoke.return_value = MOCK_LLM_RESPONSE
    event = _load_sample_input()

    response = handler(event, None)
    body = json.loads(response["body"])

    assert body["question_count"] == 6


@patch("evaluator.bedrock_client.invoke")
def test_e2e_interview_metadata_passed_through(mock_invoke):
    """interview_metadata is passed through unchanged from input."""
    mock_invoke.return_value = MOCK_LLM_RESPONSE
    event = _load_sample_input()
    input_payload = json.loads(event["body"])

    response = handler(event, None)
    body = json.loads(response["body"])

    assert body["interview_metadata"] == input_payload["interview_metadata"]


@patch("evaluator.bedrock_client.invoke")
def test_e2e_strengths_and_improvements_are_nonempty_lists(mock_invoke):
    """strengths, improvements, and contextual_advice are non-empty string lists."""
    mock_invoke.return_value = MOCK_LLM_RESPONSE
    event = _load_sample_input()

    response = handler(event, None)
    body = json.loads(response["body"])

    assert isinstance(body["strengths"], list) and len(body["strengths"]) > 0
    assert isinstance(body["improvements"], list) and len(body["improvements"]) > 0
    assert isinstance(body["contextual_advice"], list) and len(body["contextual_advice"]) > 0

    for item in body["strengths"]:
        assert isinstance(item, str)
    for item in body["improvements"]:
        assert isinstance(item, str)
    for item in body["contextual_advice"]:
        assert isinstance(item, str)


@patch("evaluator.bedrock_client.invoke")
def test_e2e_per_question_entry_structure(mock_invoke):
    """Each per_question_scores entry has question_text, feedback, and scores."""
    mock_invoke.return_value = MOCK_LLM_RESPONSE
    event = _load_sample_input()

    response = handler(event, None)
    body = json.loads(response["body"])

    for i, entry in enumerate(body["per_question_scores"]):
        assert "question_text" in entry, f"Entry {i} missing question_text"
        assert "feedback" in entry, f"Entry {i} missing feedback"
        assert "scores" in entry, f"Entry {i} missing scores"
        assert isinstance(entry["question_text"], str)
        assert isinstance(entry["feedback"], dict)
        assert isinstance(entry["feedback"]["strength"], str)
        assert isinstance(entry["feedback"]["improvement"], str)
        assert isinstance(entry["scores"], dict)
