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
    sections.append("[INTERVIEW FLOW — FOLLOW THIS EXACT TURN SEQUENCE]")
    sections.append("You will have exactly 7 speaking turns. Follow this script precisely:")
    sections.append("")
    sections.append("YOUR TURN 1: Greet briefly. Ask the MAIN question for Point 1 (from interview_points[0]). Target the experience from selected_experiences with highest relevance_score.")
    sections.append("  (candidate answers)")
    sections.append("YOUR TURN 2: Ask ONE follow-up referencing their answer. Use follow_up_topics from Point 1.")
    sections.append("  (candidate answers)")
    sections.append("YOUR TURN 3: Say 'Great, let me ask about something different.' Ask the MAIN question for Point 2 (from interview_points[1]). Target a DIFFERENT experience from selected_experiences than Point 1.")
    sections.append("  (candidate answers)")
    sections.append("YOUR TURN 4: Ask ONE follow-up referencing their answer. Use follow_up_topics from Point 2.")
    sections.append("  (candidate answers)")
    sections.append("YOUR TURN 5: Say 'Last question.' Ask the MAIN question for Point 3 (from interview_points[2]). Target a DIFFERENT experience from selected_experiences than Points 1 and 2.")
    sections.append("  (candidate answers)")
    sections.append("YOUR TURN 6: Ask ONE follow-up referencing their answer. Use follow_up_topics from Point 3.")
    sections.append("  (candidate answers)")
    sections.append("YOUR TURN 7: Say 'That wraps up our interview. Thanks for your time!' and STOP. Do not ask anything else.")
    sections.append("")
    sections.append("CRITICAL: Never skip a turn. Never combine turns. Never ask more than what is listed for each turn.")
    sections.append("CRITICAL: When asking about a new point, ALWAYS name the specific experience from selected_experiences by title and organization. NEVER say 'that project or another experience'.")
    sections.append("")
    sections.append("[BEHAVIORAL INSTRUCTIONS]")
    sections.append("- You MUST speak first when the session starts — greet the candidate briefly and ask the first main question immediately")
    sections.append("- Keep all questions and responses to 1-2 sentences maximum")
    sections.append("- Ask one question at a time (no compound questions)")
    sections.append("- Each follow-up MUST reference something the candidate just said in their answer")
    sections.append("- Do not explain, summarize, or narrate what you are about to do")
    sections.append("- Follow the tone specified in the interview profile")
    sections.append("- Accept all experience types listed in the interview profile")
    sections.append("- Do not invent details not present in the candidate data")
    sections.append("- Do not give feedback or score answers during the interview")
    sections.append("- Do not ask the candidate to rate themselves")
    sections.append("- Signal transitions between points briefly (e.g. 'Great. Moving on.')")
    sections.append("- After the final follow-up answer, end with a brief positive closing and stop")
    sections.append("- After speaking the closing, call the end_interview tool exactly once")

    return "\n".join(sections)
