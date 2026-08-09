"""Unit tests for the Evaluator response_assembler module."""

from evaluator.response_assembler import build


def _sample_per_question_scores():
    return [
        {
            "question_text": "Tell me about a team project.",
            "feedback": {
                "strength": "Clearly described a team contribution.",
                "improvement": "Add a measurable outcome.",
            },
            "scores": {
                "concrete_example": 4,
                "situation_action_result": 3,
                "link_to_job": 4,
                "quantifiable_outcome": 2,
            },
        }
    ]


def _sample_overall_scores():
    return {
        "dimensions": {
            "concrete_example": 4.0,
            "situation_action_result": 3.0,
            "link_to_job": 4.0,
            "quantifiable_outcome": 2.0,
        },
        "total": 3.3,
        "question_count": 1,
    }


def _sample_llm_response():
    return {
        "per_question_scores": _sample_per_question_scores(),
        "strengths": ["Good specific example from SE course project."],
        "improvements": ["Include measurable outcomes next time."],
        "keywords_covered": ["Python", "Flask"],
        "keywords_not_covered": ["AWS", "Docker"],
        "contextual_advice": ["Consider mentioning your hackathon experience."],
    }


def _sample_interview_metadata():
    return {
        "candidate_level": "student_intern",
        "target_role": "Software Engineering Intern",
        "status": "completed",
        "completion_reason": "all_questions_completed",
        "main_questions_completed": 3,
        "follow_ups_completed": 3,
        "ended_early": False,
    }


class TestBuild:
    def test_returns_all_required_fields(self):
        result = build(
            per_question_scores=_sample_per_question_scores(),
            overall_scores=_sample_overall_scores(),
            readiness_label="Developing well",
            llm_response=_sample_llm_response(),
            interview_metadata=_sample_interview_metadata(),
        )

        assert "per_question_scores" in result
        assert "overall_scores" in result
        assert "question_count" in result
        assert "readiness_label" in result
        assert "strengths" in result
        assert "improvements" in result
        assert "keywords_covered" in result
        assert "keywords_not_covered" in result
        assert "contextual_advice" in result
        assert "interview_metadata" in result

    def test_per_question_scores_passed_through(self):
        pqs = _sample_per_question_scores()
        result = build(pqs, _sample_overall_scores(), "Developing well", _sample_llm_response(), _sample_interview_metadata())
        assert result["per_question_scores"] == pqs

    def test_overall_scores_structure(self):
        result = build(
            _sample_per_question_scores(),
            _sample_overall_scores(),
            "Developing well",
            _sample_llm_response(),
            _sample_interview_metadata(),
        )
        assert result["overall_scores"]["dimensions"]["concrete_example"] == 4.0
        assert result["overall_scores"]["total"] == 3.3
        assert result["question_count"] == 1

    def test_readiness_label_assigned(self):
        result = build(
            _sample_per_question_scores(),
            _sample_overall_scores(),
            "Interview ready",
            _sample_llm_response(),
            _sample_interview_metadata(),
        )
        assert result["readiness_label"] == "Interview ready"

    def test_strengths_from_llm(self):
        result = build(
            _sample_per_question_scores(),
            _sample_overall_scores(),
            "Developing well",
            _sample_llm_response(),
            _sample_interview_metadata(),
        )
        assert result["strengths"] == ["Good specific example from SE course project."]

    def test_interview_metadata_passed_through_unchanged(self):
        metadata = _sample_interview_metadata()
        result = build(
            _sample_per_question_scores(),
            _sample_overall_scores(),
            "Developing well",
            _sample_llm_response(),
            metadata,
        )
        assert result["interview_metadata"] == metadata
        assert result["interview_metadata"]["ended_early"] is False
