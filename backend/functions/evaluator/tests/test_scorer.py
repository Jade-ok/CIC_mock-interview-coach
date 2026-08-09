"""Unit tests for the Evaluator scorer module."""

import pytest
from evaluator.scorer import (
    extract_and_clamp,
    aggregate,
    classify,
    DIMENSIONS,
    READINESS_THRESHOLDS,
)


def _make_scores(ce=3, sar=3, ltj=3, qo=3):
    """Helper to create a score dict."""
    return {
        "concrete_example": ce,
        "situation_action_result": sar,
        "link_to_job": ltj,
        "quantifiable_outcome": qo,
    }


def _make_question(scores_dict):
    """Helper to wrap scores into a question object."""
    return {
        "question_text": "Test question?",
        "feedback": {"strength": "Clear answer.", "improvement": "Add detail."},
        "scores": scores_dict,
    }


class TestExtractAndClamp:
    def test_clamps_below_minimum_to_1(self):
        llm_response = {
            "per_question_scores": [_make_question(_make_scores(ce=0, sar=-1, ltj=1, qo=1))]
        }
        result = extract_and_clamp(llm_response)
        assert result[0]["scores"]["concrete_example"] == 1
        assert result[0]["scores"]["situation_action_result"] == 1

    def test_clamps_above_maximum_to_5(self):
        llm_response = {
            "per_question_scores": [_make_question(_make_scores(ce=6, sar=10, ltj=5, qo=5))]
        }
        result = extract_and_clamp(llm_response)
        assert result[0]["scores"]["concrete_example"] == 5
        assert result[0]["scores"]["situation_action_result"] == 5

    def test_valid_scores_unchanged(self):
        llm_response = {
            "per_question_scores": [_make_question(_make_scores(ce=3, sar=4, ltj=2, qo=5))]
        }
        result = extract_and_clamp(llm_response)
        assert result[0]["scores"]["concrete_example"] == 3
        assert result[0]["scores"]["situation_action_result"] == 4
        assert result[0]["scores"]["link_to_job"] == 2
        assert result[0]["scores"]["quantifiable_outcome"] == 5

    def test_converts_float_to_int(self):
        llm_response = {
            "per_question_scores": [_make_question(_make_scores(ce=3.7, sar=2.1, ltj=4.9, qo=1.1))]
        }
        result = extract_and_clamp(llm_response)
        # int() truncates toward zero
        assert result[0]["scores"]["concrete_example"] == 3
        assert result[0]["scores"]["situation_action_result"] == 2
        assert result[0]["scores"]["link_to_job"] == 4
        assert result[0]["scores"]["quantifiable_outcome"] == 1


class TestAggregate:
    def test_single_question(self):
        scores = [_make_question(_make_scores(ce=4, sar=3, ltj=5, qo=2))]
        result = aggregate(scores)
        assert result["dimensions"]["concrete_example"] == 4.0
        assert result["dimensions"]["situation_action_result"] == 3.0
        assert result["dimensions"]["link_to_job"] == 5.0
        assert result["dimensions"]["quantifiable_outcome"] == 2.0
        assert result["total"] == 3.5
        assert result["question_count"] == 1

    def test_three_questions(self):
        scores = [
            _make_question(_make_scores(ce=4, sar=3, ltj=5, qo=2)),
            _make_question(_make_scores(ce=3, sar=4, ltj=3, qo=3)),
            _make_question(_make_scores(ce=5, sar=5, ltj=4, qo=4)),
        ]
        result = aggregate(scores)
        assert result["question_count"] == 3
        assert result["dimensions"]["concrete_example"] == 4.0
        assert result["dimensions"]["situation_action_result"] == 4.0
        assert result["dimensions"]["link_to_job"] == 4.0
        assert result["dimensions"]["quantifiable_outcome"] == 3.0
        assert result["total"] == 3.8

    def test_six_questions(self):
        scores = [_make_question(_make_scores(ce=3, sar=3, ltj=3, qo=3)) for _ in range(6)]
        result = aggregate(scores)
        assert result["question_count"] == 6
        assert result["total"] == 3.0

    def test_rounding_to_one_decimal(self):
        scores = [
            _make_question(_make_scores(ce=4, sar=3, ltj=4, qo=3)),
            _make_question(_make_scores(ce=3, sar=4, ltj=3, qo=4)),
            _make_question(_make_scores(ce=5, sar=2, ltj=5, qo=2)),
        ]
        result = aggregate(scores)
        # Each dimension: (4+3+5)/3=4.0, (3+4+2)/3=3.0, (4+3+5)/3=4.0, (3+4+2)/3=3.0
        assert result["total"] == 3.5


class TestClassify:
    def test_interview_ready(self):
        assert classify(5.0) == "Interview ready"
        assert classify(4.3) == "Interview ready"

    def test_strong_foundation(self):
        assert classify(4.2) == "Strong foundation"
        assert classify(3.5) == "Strong foundation"

    def test_developing_well(self):
        assert classify(3.4) == "Developing well"
        assert classify(2.8) == "Developing well"

    def test_needs_more_practice(self):
        assert classify(2.7) == "Needs more practice"
        assert classify(2.0) == "Needs more practice"

    def test_needs_clearer_examples(self):
        assert classify(1.9) == "Needs clearer examples"
        assert classify(1.0) == "Needs clearer examples"

    def test_boundary_precision(self):
        # Just below each threshold
        assert classify(4.29) == "Strong foundation"
        assert classify(3.49) == "Developing well"
        assert classify(2.79) == "Needs more practice"
        assert classify(1.99) == "Needs clearer examples"
