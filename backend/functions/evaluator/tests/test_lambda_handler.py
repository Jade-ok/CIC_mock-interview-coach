"""Integration tests for the Evaluator lambda_handler."""

import json
from unittest.mock import patch

from evaluator.lambda_handler import handler


def _make_turn(point_id="point_1", turn_type="main_question", question="Q?", answer="A."):
    return {"point_id": point_id, "turn_type": turn_type, "question": question, "answer": answer}


def _valid_event(num_turns=2):
    """Create a valid Lambda Function URL event."""
    body = {
        "conversation": [_make_turn(point_id=f"point_{i}") for i in range(num_turns)],
        "interview_metadata": {
            "candidate_level": "student_intern",
            "target_role": "Software Engineering Intern",
            "status": "completed",
            "completion_reason": "all_questions_completed",
            "main_questions_completed": 1,
            "follow_ups_completed": 1,
            "ended_early": False,
        },
        "analyst_output": {
            "schema_version": "1.0",
            "candidate_profile": {"candidate_level": "student_intern"},
            "target_role": {
                "title": "Software Engineering Intern",
                "required_skills": ["Python"],
                "evaluation_priorities": ["technical understanding"],
            },
            "resume_job_alignment": {
                "strong_matches": [],
                "partial_matches": [],
                "areas_to_explore": [],
            },
            "interview_plan": [],
            "selected_experiences": [],
            "analysis_warnings": [],
        },
    }
    return {"body": json.dumps(body)}


def _mock_llm_response(num_questions=2):
    """Create mock parsed LLM function arguments."""
    return {
        "per_question_scores": [
            {
                "question_text": f"Question {i}?",
                "feedback": {
                    "strength": f"Good answer {i}.",
                    "improvement": f"Add detail {i}.",
                },
                "scores": {
                    "concrete_example": 4,
                    "situation_action_result": 3,
                    "link_to_job": 4,
                    "quantifiable_outcome": 2,
                },
            }
            for i in range(num_questions)
        ],
        "strengths": ["Good example provided."],
        "improvements": ["Add more measurable outcomes."],
        "keywords_covered": ["Python", "Flask"],
        "keywords_not_covered": ["AWS"],
        "contextual_advice": ["Consider mentioning your hackathon project."],
    }


class TestHappyPath:
    @patch("evaluator.bedrock_client.invoke")
    def test_full_evaluation_flow(self, mock_invoke):
        mock_invoke.return_value = _mock_llm_response(num_questions=2)

        response = handler(_valid_event(num_turns=2), None)

        assert response["statusCode"] == 200
        body = json.loads(response["body"])
        assert body["readiness_label"] in [
            "Interview ready", "Strong foundation", "Developing well",
            "Needs more practice", "Needs clearer examples",
        ]
        assert body["question_count"] == 2
        assert len(body["per_question_scores"]) == 2
        assert "dimensions" in body["overall_scores"]
        assert "total" in body["overall_scores"]
        assert body["strengths"] == ["Good example provided."]
        assert body["improvements"] == ["Add more measurable outcomes."]
        assert body["contextual_advice"] == ["Consider mentioning your hackathon project."]
        assert body["interview_metadata"]["candidate_level"] == "student_intern"


class TestValidationErrors:
    def test_missing_body_returns_400(self):
        response = handler({}, None)
        assert response["statusCode"] == 400
        body = json.loads(response["body"])
        assert body["error"] == "ValidationError"

    def test_empty_conversation_returns_400(self):
        event = _valid_event()
        payload = json.loads(event["body"])
        payload["conversation"] = []
        event["body"] = json.dumps(payload)

        response = handler(event, None)
        assert response["statusCode"] == 400

    def test_missing_analyst_output_returns_400(self):
        event = _valid_event()
        payload = json.loads(event["body"])
        del payload["analyst_output"]
        event["body"] = json.dumps(payload)

        response = handler(event, None)
        assert response["statusCode"] == 400
        body = json.loads(response["body"])
        assert "analyst_output" in body["message"]


class TestEvaluationErrors:
    @patch("evaluator.bedrock_client.invoke")
    def test_bedrock_failure_returns_500(self, mock_invoke):
        from evaluator.exceptions import EvaluationError
        mock_invoke.side_effect = EvaluationError("Bedrock API failed after 2 attempts")

        response = handler(_valid_event(), None)
        assert response["statusCode"] == 500
        body = json.loads(response["body"])
        assert body["error"] == "EvaluationError"
        assert "Bedrock" in body["message"]


class TestUnexpectedErrors:
    @patch("evaluator.bedrock_client.invoke")
    def test_unexpected_exception_returns_500_generic(self, mock_invoke):
        mock_invoke.side_effect = RuntimeError("Something unexpected")

        response = handler(_valid_event(), None)
        assert response["statusCode"] == 500
        body = json.loads(response["body"])
        assert body["error"] == "InternalError"
        assert "unexpected" in body["message"].lower()
