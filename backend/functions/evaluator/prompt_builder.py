"""Prompt construction for the Evaluator's Bedrock Mantle request."""

try:
    from .schemas import EVALUATION_TOOL_SCHEMA
except ImportError:  # Lambda loads modules from the function root.
    from schemas import EVALUATION_TOOL_SCHEMA


SYSTEM_PROMPT = """You are an interview performance evaluator for co-op seeking students.

CRITICAL SCORING RULES:
- You are scoring a student seeking a co-op placement, NOT an experienced professional.
- School projects, course work, hackathons, and team assignments are VALID experience.
- A student who describes ANY specific project or task with some detail deserves at least a 3.
- Score based on what the student ACTUALLY SAID in their spoken answers, not what is missing.
- Do NOT penalize for missing questions if the interview ended early.
- A short but relevant answer is better than no answer — never score 1 unless the student literally did not address the dimension at all.

Score each question-answer pair on these four dimensions (1-5 integer scale):
1. concrete_example (1-5): Did the student provide a specific, real example?
2. situation_action_result (1-5): Did the answer follow SAR structure?
3. link_to_job (1-5): Did the student connect their experience to the target role?
4. quantifiable_outcome (1-5): Did the student include measurable results or impact?

Scoring guide (co-op student calibration):
- 5: Excellent for a co-op student — clear, specific, well-structured
- 4: Strong — demonstrates good understanding with minor gaps
- 3: Adequate — shows relevant experience but lacks detail or structure
- 2: Developing — vague or generic, needs more specificity
- 1: Missing — dimension was completely absent from the answer (the student said nothing relevant to this dimension)

FEEDBACK STRUCTURE:
- per_question_scores.feedback.strength: One sentence about what the student did well in THAT specific answer. Reference what they said.
- per_question_scores.feedback.improvement: One sentence with one actionable tip to improve THAT specific answer.
- "strengths": A single summary paragraph (2-3 sentences total, max 5 lines when displayed) capturing the overall patterns of strength across ALL answers. Do NOT list per-question feedback. Reflect the full interview in a concise summary.
- "improvements": A single summary paragraph (2-3 sentences total, max 5 lines when displayed) capturing the overall patterns to work on across ALL answers. Do NOT list per-question feedback. Reflect the full interview in a concise summary.
- "keywords_covered": List job-description skills the student mentioned or demonstrated.
- "keywords_not_covered": List job-description skills the student did NOT mention.
- "contextual_advice": Advice about resume experiences not discussed and job gaps.

Provide your scoring judgments only. Do NOT calculate averages or assign labels.
Use supportive, constructive, student-friendly language in all feedback."""


def build(conversation: list, analyst_output: dict) -> tuple:
    """Build the system prompt, messages, and OpenAI-compatible tool config.

    Args:
        conversation: List of turn dicts with point_id, turn_type, question, answer.
        analyst_output: Structured JSON object from the Analyst agent.

    Returns:
        Tuple of (system, messages, tool_config) for Bedrock Mantle.
    """
    system = SYSTEM_PROMPT
    messages = [
        {"role": "user", "content": _format_user_message(conversation, analyst_output)}
    ]
    tool_config = _build_tool_config()
    return system, messages, tool_config


def _format_user_message(conversation: list, analyst_output: dict) -> str:
    """Format the user message with conversation first, then supplementary context.

    The interview conversation is placed first to ensure the LLM evaluates
    the student's actual spoken answers as the primary focus. Resume and role
    context follows as supplementary reference for contextual_advice only.
    """
    target_role = analyst_output.get("target_role", {})
    alignment = analyst_output.get("resume_job_alignment", {})
    selected_experiences = analyst_output.get("selected_experiences", [])
    interview_plan = analyst_output.get("interview_plan", [])
    warnings = analyst_output.get("analysis_warnings", [])

    sections = []

    # PRIMARY: Interview conversation (what we are scoring)
    sections.append("## Interview Conversation (PRIMARY — score these answers)")
    sections.append("Below are the actual questions asked and the student's spoken responses.")
    sections.append("Your scores and strengths MUST be based on what the student said here.\n")
    for i, turn in enumerate(conversation):
        turn_label = "Main Question" if turn.get("turn_type") == "main_question" else "Follow-up"
        sections.append(f"### Turn {i + 1} ({turn_label}) [Point: {turn.get('point_id', '')}]")
        sections.append(f"**Question:** {turn.get('question', '')}")
        sections.append(f"**Answer:** {turn.get('answer', '')}\n")

    # SUPPLEMENTARY: Target role context
    sections.append("---")
    sections.append("## Supplementary Context (for keywords and contextual_advice)")
    sections.append("\n### Target Role")
    sections.append(f"Title: {target_role.get('title', 'N/A')}")
    if target_role.get("required_skills"):
        sections.append(f"Required skills: {', '.join(target_role['required_skills'])}")
    if target_role.get("preferred_skills"):
        sections.append(f"Preferred skills: {', '.join(target_role['preferred_skills'])}")
    sections.append("")
    sections.append(
        "Use the required_skills and preferred_skills above to populate "
        "keywords_covered (skills the student mentioned or demonstrated in the conversation) "
        "and keywords_not_covered (skills they did not mention)."
    )
    if target_role.get("evaluation_priorities"):
        sections.append(f"Evaluation priorities: {', '.join(target_role['evaluation_priorities'])}")

    # Interview plan (what topics were intended to be covered)
    if interview_plan:
        sections.append("\n### Interview Plan")
        for item in sorted(interview_plan, key=lambda x: x.get("priority", 99)):
            sections.append(
                f"- [Priority {item.get('priority', '?')}] "
                f"Topic: {item.get('topic', 'N/A')} | "
                f"Target skill: {item.get('target_skill', 'N/A')} | "
                f"Type: {item.get('question_type', 'N/A')}"
            )

    # Resume-job alignment
    sections.append("\n### Resume-Job Alignment")
    if alignment.get("strong_matches"):
        sections.append("Strong matches:")
        for match in alignment["strong_matches"]:
            sections.append(f"  - {match.get('resume_evidence', '')} \u2192 {match.get('job_requirement', '')}")
    if alignment.get("partial_matches"):
        sections.append("Partial matches:")
        for match in alignment["partial_matches"]:
            sections.append(f"  - {match.get('resume_evidence', '')} \u2192 {match.get('job_requirement', '')}")
    if alignment.get("areas_to_explore"):
        sections.append("Areas to explore:")
        for area in alignment["areas_to_explore"]:
            sections.append(f"  - {area.get('topic', '')}: {area.get('reason', '')}")

    # Selected experiences from resume
    sections.append("\n### Candidate's Key Experiences (from resume)")
    for exp in selected_experiences:
        org = f" ({exp.get('organization', '')})" if exp.get("organization") else ""
        sections.append(
            f"- [{exp.get('experience_type', '')}] "
            f"{exp.get('title', '')}{org}: {exp.get('summary', '')}"
        )
        if exp.get("skills_demonstrated"):
            sections.append(f"  Skills: {', '.join(exp['skills_demonstrated'])}")
        if exp.get("candidate_claims"):
            claims_str = "; ".join(f'"{c}"' for c in exp["candidate_claims"])
            sections.append(f"  Claims: {claims_str}")
        if exp.get("relevance_reason"):
            sections.append(f"  Relevance: {exp['relevance_reason']}")

    # Analysis warnings
    if warnings:
        sections.append("\n### Analysis Warnings")
        for w in warnings:
            sections.append(f"- {w}")

    sections.append("\n---")
    sections.append(
        "Score each question-answer pair from the Interview Conversation above. "
        "For each question, provide one-sentence feedback (strength + improvement). "
        "Then provide 2-3 overall summary sentences for strengths and improvements "
        "(cross-cutting patterns, NOT per-question repetitions). "
        "List which target role keywords were covered vs. not covered in the interview. "
        "Use 'contextual_advice' for resume experiences not discussed and job gaps."
    )

    return "\n".join(sections)


def _build_tool_config() -> dict:
    """Build an OpenAI-compatible forced submit_evaluation function."""
    return {
        "tools": [
            {
                "type": "function",
                "function": {
                    "name": EVALUATION_TOOL_SCHEMA["name"],
                    "description": EVALUATION_TOOL_SCHEMA["description"],
                    "parameters": EVALUATION_TOOL_SCHEMA["inputSchema"]["json"],
                },
            }
        ],
        "tool_choice": {
            "type": "function",
            "function": {"name": "submit_evaluation"},
        },
    }
