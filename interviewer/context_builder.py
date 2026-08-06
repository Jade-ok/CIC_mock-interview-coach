import json


def build_runtime_context(
    analyst_output: dict,
    interview_structure: dict,
    interview_profile: dict
) -> str:
    """
    Assemble the runtime context for Nova Sonic.

    Args:
        analyst_output: Full Analyst output (included as-is, JSON-serialized).
        interview_structure: What the interview covers (from S3).
        interview_profile: How the interviewer behaves (from S3).

    Returns:
        A formatted string containing all four sections.
    """
    sections = []

    sections.append("[CANDIDATE DATA]")
    sections.append(json.dumps(analyst_output, indent=2))

    sections.append("")
    sections.append("[INTERVIEW STRUCTURE]")
    sections.append(json.dumps(interview_structure, indent=2))

    sections.append("")
    sections.append("[INTERVIEW PROFILE]")
    sections.append(json.dumps(interview_profile, indent=2))

    sections.append("")
    sections.append("[BEHAVIORAL INSTRUCTIONS]")
    sections.append("- You MUST speak first when the session starts — greet the candidate briefly and ask the first question immediately")
    sections.append("- Keep all questions and responses to 1-2 sentences maximum")
    sections.append("- Ask one question at a time (no compound questions)")
    sections.append("- Do not explain, summarize, or narrate what you are about to do")
    sections.append("- Follow the tone specified in the interview profile")
    sections.append("- Accept all experience types listed in the interview profile")
    sections.append("- Do not invent details not present in the candidate data")
    sections.append("- Do not give feedback or score answers during the interview")
    sections.append("- Do not ask the candidate to rate themselves")
    sections.append("- Signal transitions between interview points briefly (e.g. 'Great. Next question.')")
    sections.append("- Stop gracefully when the session ends")

    return "\n".join(sections)
