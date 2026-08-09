"""Unit tests for evaluator.validator module."""

import json
import pytest
from evaluator.validator import (
    MAX_ANALYST_OUTPUT_CHARS,
    MAX_CONVERSATION_TEXT_CHARS,
    parse_and_validate,
)
from evaluator.exceptions import ValidationError


def _make_turn(point_id="point_1", turn_type="main_question", question="Q?", answer="A."):
    return {
        "point_id": point_id,
        "turn_type": turn_type,
        "question": question,
        "answer": answer,
    }


def _make_event(body_dict):
    """Wrap a body dict into a Lambda Function URL event."""
    return {"body": json.dumps(body_dict)}


def _valid_payload(num_turns=6):
    """Generate a valid payload with the given number of turns."""
    return {
        "conversation": [_make_turn(point_id=f"point_{i}") for i in range(num_turns)],
        "interview_metadata": {
            "candidate_level": "student_intern",
            "target_role": "Software Engineering Intern",
            "status": "completed",
        },
        "analyst_output": {
            "schema_version": "1.0",
            "candidate_profile": {"candidate_level": "student_intern"},
        },
    }


class TestValidInput:
    def test_full_6_turn_conversation(self):
        event = _make_event(_valid_payload(num_turns=6))
        result = parse_and_validate(event)
        assert len(result["conversation"]) == 6
        assert "interview_metadata" in result
        assert "analyst_output" in result

    def test_single_turn_conversation(self):
        event = _make_event(_valid_payload(num_turns=1))
        result = parse_and_validate(event)
        assert len(result["conversation"]) == 1


class TestMissingBody:
    def test_missing_body_key(self):
        with pytest.raises(ValidationError, match="Request body is empty"):
            parse_and_validate({})

    def test_empty_body_string(self):
        with pytest.raises(ValidationError, match="Request body is empty"):
            parse_and_validate({"body": ""})


class TestInvalidJSON:
    def test_malformed_json(self):
        with pytest.raises(ValidationError, match="Invalid JSON"):
            parse_and_validate({"body": "not json{{"})


class TestMissingRequiredFields:
    def test_missing_conversation(self):
        payload = _valid_payload()
        del payload["conversation"]
        with pytest.raises(ValidationError, match="conversation"):
            parse_and_validate(_make_event(payload))

    def test_missing_interview_metadata(self):
        payload = _valid_payload()
        del payload["interview_metadata"]
        with pytest.raises(ValidationError, match="interview_metadata"):
            parse_and_validate(_make_event(payload))

    def test_missing_resume_analysis(self):
        payload = _valid_payload()
        del payload["analyst_output"]
        with pytest.raises(ValidationError, match="analyst_output"):
            parse_and_validate(_make_event(payload))


class TestConversationLength:
    def test_empty_conversation(self):
        payload = _valid_payload()
        payload["conversation"] = []
        with pytest.raises(ValidationError, match="conversation"):
            parse_and_validate(_make_event(payload))

    def test_more_than_6_turns(self):
        payload = _valid_payload(num_turns=7)
        with pytest.raises(ValidationError, match="max 6"):
            parse_and_validate(_make_event(payload))

    def test_rejects_conversation_text_above_character_limit(self, monkeypatch):
        monkeypatch.setenv("HOSTED_GUARDRAILS_ENABLED", "true")
        payload = _valid_payload(num_turns=1)
        payload["conversation"][0]["answer"] = "a" * (
            MAX_CONVERSATION_TEXT_CHARS + 1
        )
        with pytest.raises(ValidationError, match="Conversation exceeds"):
            parse_and_validate(_make_event(payload))

    def test_rejects_oversized_analyst_output(self, monkeypatch):
        monkeypatch.setenv("HOSTED_GUARDRAILS_ENABLED", "true")
        payload = _valid_payload(num_turns=1)
        payload["analyst_output"]["padding"] = "x" * MAX_ANALYST_OUTPUT_CHARS
        with pytest.raises(ValidationError, match="analyst_output exceeds"):
            parse_and_validate(_make_event(payload))

    def test_local_mode_does_not_apply_hosted_character_limits(self, monkeypatch):
        monkeypatch.delenv("HOSTED_GUARDRAILS_ENABLED", raising=False)
        payload = _valid_payload(num_turns=1)
        payload["conversation"][0]["answer"] = "a" * (
            MAX_CONVERSATION_TEXT_CHARS + 1
        )

        assert parse_and_validate(_make_event(payload)) == payload


class TestTurnFieldValidation:
    def test_missing_point_id(self):
        payload = _valid_payload(num_turns=1)
        del payload["conversation"][0]["point_id"]
        with pytest.raises(ValidationError, match="point_id"):
            parse_and_validate(_make_event(payload))

    def test_missing_turn_type(self):
        payload = _valid_payload(num_turns=1)
        del payload["conversation"][0]["turn_type"]
        with pytest.raises(ValidationError, match="turn_type"):
            parse_and_validate(_make_event(payload))

    def test_missing_question(self):
        payload = _valid_payload(num_turns=1)
        del payload["conversation"][0]["question"]
        with pytest.raises(ValidationError, match="question"):
            parse_and_validate(_make_event(payload))

    def test_missing_answer(self):
        payload = _valid_payload(num_turns=1)
        del payload["conversation"][0]["answer"]
        with pytest.raises(ValidationError, match="answer"):
            parse_and_validate(_make_event(payload))
