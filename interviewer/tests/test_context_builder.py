import json

from interviewer.context_builder import build_runtime_context


# Sample inputs used across tests
ANALYST_OUTPUT = {"candidate_profile": {"name": "Test"}, "target_role": {"title": "SDE"}}
STRUCTURE = {"main_question_count": 3, "interview_points": []}
PROFILE = {"tone": "supportive_professional"}


def test_output_contains_all_section_headers():
    result = build_runtime_context(ANALYST_OUTPUT, STRUCTURE, PROFILE)
    assert "[CANDIDATE DATA]" in result
    assert "[INTERVIEW STRUCTURE]" in result
    assert "[INTERVIEW PROFILE]" in result
    assert "[BEHAVIORAL INSTRUCTIONS]" in result


def test_analyst_output_json_appears_in_output():
    result = build_runtime_context(ANALYST_OUTPUT, STRUCTURE, PROFILE)
    expected_json = json.dumps(ANALYST_OUTPUT, indent=2)
    assert expected_json in result


def test_idempotent_same_input_same_output():
    result1 = build_runtime_context(ANALYST_OUTPUT, STRUCTURE, PROFILE)
    result2 = build_runtime_context(ANALYST_OUTPUT, STRUCTURE, PROFILE)
    assert result1 == result2


def test_output_is_non_empty_string():
    result = build_runtime_context(ANALYST_OUTPUT, STRUCTURE, PROFILE)
    assert isinstance(result, str)
    assert len(result) > 0


def test_behavioral_instructions_contain_key_phrases():
    result = build_runtime_context(ANALYST_OUTPUT, STRUCTURE, PROFILE)
    assert "Ask one question at a time" in result
    assert "Do not invent details" in result
    assert "Do not give feedback" in result
