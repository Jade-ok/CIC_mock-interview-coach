"""Regression tests for flexible Analyst experience categories."""

import json

import pytest

from analyst.parser import SchemaValidationError, parse_chat_response


def _response(experience_type):
    output = {
        "schema_version": "1.0",
        "candidate_profile": {
            "experience_types_available": [experience_type],
        },
        "target_role": {},
        "resume_job_alignment": {},
        "interview_plan": [],
        "selected_experiences": [
            {
                "experience_type": experience_type,
                "relevance_score": 0.8,
            }
        ],
        "analysis_warnings": [],
    }
    return {
        "choices": [
            {
                "message": {
                    "tool_calls": [
                        {
                            "function": {
                                "name": "analyst_output",
                                "arguments": json.dumps(output),
                            }
                        }
                    ]
                }
            }
        ]
    }


@pytest.mark.parametrize(
    ("model_value", "canonical_value"),
    [
        ("work", "work_experience"),
        ("Employment", "work_experience"),
        ("part-time work", "work_experience"),
        ("co-op", "internship"),
        ("research project", "research"),
        ("volunteer work", "volunteering"),
        ("school project", "academic_project"),
    ],
)
def test_known_aliases_are_normalized(model_value, canonical_value):
    result = parse_chat_response(_response(model_value))

    assert result["selected_experiences"][0]["experience_type"] == canonical_value
    assert result["candidate_profile"]["experience_types_available"] == [
        canonical_value
    ]


def test_unfamiliar_string_category_falls_back_to_other():
    result = parse_chat_response(_response("community leadership program"))

    assert result["selected_experiences"][0]["experience_type"] == "other"
    assert result["candidate_profile"]["experience_types_available"] == ["other"]


@pytest.mark.parametrize("model_value", [None, "", "   ", {"type": "work"}])
def test_missing_or_malformed_category_still_fails_validation(model_value):
    with pytest.raises(
        SchemaValidationError,
        match=r"selected_experiences\[0\]\.experience_type must be a non-empty string",
    ):
        parse_chat_response(_response(model_value))
