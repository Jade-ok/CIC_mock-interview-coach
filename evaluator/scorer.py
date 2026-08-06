"""Score clamping, aggregation, and readiness label classification."""


def extract_and_clamp(llm_response: dict) -> list:
    """Clamp all dimension scores to 1-5 integer range.

    Args:
        llm_response: The parsed LLM tool_use output containing per_question_scores.

    Returns:
        The per_question_scores list with all scores clamped to 1-5.
    """
    raise NotImplementedError()


def aggregate(per_question_scores: list) -> dict:
    """Calculate dimension averages and total score over answered questions.

    Args:
        per_question_scores: List of per-question score dicts.

    Returns:
        A dict with dimension averages, total score, and question_count.
    """
    raise NotImplementedError()


def classify(total_score: float) -> str:
    """Deterministically assign a readiness label based on total score.

    Args:
        total_score: The overall average score on the 1-5 scale.

    Returns:
        The readiness label string.
    """
    raise NotImplementedError()
