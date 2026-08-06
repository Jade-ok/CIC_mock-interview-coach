"""Final JSON response construction for the Evaluator agent."""


def build(
    per_question_scores: list,
    overall_scores: dict,
    readiness_label: str,
    llm_response: dict,
    interview_metadata: dict,
) -> dict:
    """Construct the final Feedback Report JSON response body.

    Args:
        per_question_scores: List of per-question score objects (clamped).
        overall_scores: Dict with dimensions, total, and question_count.
        readiness_label: The deterministic readiness label string.
        llm_response: The full LLM tool_use output (for strengths/improvements/advice).
        interview_metadata: Metadata passed through unchanged from input.

    Returns:
        The complete Feedback Report dict matching schemas/evaluator_output.json.
    """
    return {
        "per_question_scores": per_question_scores,
        "overall_scores": {
            "dimensions": overall_scores["dimensions"],
            "total": overall_scores["total"],
        },
        "question_count": overall_scores["question_count"],
        "readiness_label": readiness_label,
        "strengths": llm_response["strengths"],
        "improvements": llm_response["improvements"],
        "contextual_advice": llm_response["contextual_advice"],
        "interview_metadata": interview_metadata,
    }
