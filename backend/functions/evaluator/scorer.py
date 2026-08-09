"""Score clamping, aggregation, and readiness label classification."""

DIMENSIONS = [
    "concrete_example",
    "situation_action_result",
    "link_to_job",
    "quantifiable_outcome",
]

# Thresholds on the 1-5 scale, checked in descending order.
# First matching threshold wins.
READINESS_THRESHOLDS = [
    (4.3, "Interview ready"),
    (3.5, "Strong foundation"),
    (2.8, "Developing well"),
    (2.0, "Needs more practice"),
    (1.0, "Needs clearer examples"),
]


def extract_and_clamp(llm_response: dict) -> list:
    """Clamp all dimension scores to the 1-5 integer range.

    Args:
        llm_response: The parsed function-call output from the LLM containing
            per_question_scores with raw score values.

    Returns:
        The per_question_scores list with all dimension scores clamped to 1-5.
    """
    per_question = llm_response["per_question_scores"]
    for question in per_question:
        for dim in DIMENSIONS:
            raw = question["scores"][dim]
            question["scores"][dim] = max(1, min(5, int(raw)))
    return per_question


def aggregate(per_question_scores: list) -> dict:
    """Calculate dimension averages and total score over answered questions only.

    Averages are computed only from the questions present — no penalty for
    having fewer than 6 questions.

    Args:
        per_question_scores: List of score objects (already clamped).

    Returns:
        Dict with "dimensions" (per-dimension averages), "total" (overall average),
        and "question_count" (number of questions scored).
    """
    n = len(per_question_scores)
    dimension_averages = {}

    for dim in DIMENSIONS:
        total = sum(q["scores"][dim] for q in per_question_scores)
        dimension_averages[dim] = round(total / n, 1)

    total_score = round(sum(dimension_averages.values()) / len(DIMENSIONS), 1)

    return {
        "dimensions": dimension_averages,
        "total": total_score,
        "question_count": n,
    }


def classify(total_score: float) -> str:
    """Deterministically assign a readiness label based on 1-5 scale thresholds.

    Args:
        total_score: The overall average score (1.0 to 5.0).

    Returns:
        One of the five readiness label strings.
    """
    for threshold, label in READINESS_THRESHOLDS:
        if total_score >= threshold:
            return label
    return "Needs clearer examples"
