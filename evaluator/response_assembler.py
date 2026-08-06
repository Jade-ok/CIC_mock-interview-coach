"""Final JSON response construction for the Evaluator agent."""


def build(
    per_question_scores: list,
    overall_scores: dict,
    readiness_label: str,
    llm_response: dict,
    interview_metadata: dict,
) -> dict:
    """Assemble the final feedback report response body.

    Args:
        per_question_scores: List of per-question score dicts.
        overall_scores: Dict with dimension averages and total score.
        readiness_label: The classified readiness label string.
        llm_response: The full LLM tool_use output (for strengths, improvements, etc.).
        interview_metadata: The pass-through interview metadata dict.

    Returns:
        The complete feedback report dict matching the response schema.
    """
    raise NotImplementedError()
