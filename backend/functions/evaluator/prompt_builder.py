"""Prompt construction for the Evaluator agent's Bedrock Converse API call."""

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

FEEDBACK RULES:
- "strengths" MUST reference specific things the student SAID during the interview (quote or paraphrase their actual spoken answers). Do NOT praise resume content that was not discussed.
- "improvements" MUST give actionable advice about how to better ANSWER interview questions, with specific examples of what the student could have said differently.
- "contextual_advice" can reference resume experiences the student did not mention, suggesting they bring those up in future interviews.

Provide your scoring judgments only. Do NOT calculate averages or assign labels.
Use supportive, constructive, student-friendly language in all feedback."""


def build(conversation: list, analyst_output: dict) -> tuple:
    """Build the system prompt, messages, and tool config for Bedrock Converse API.

    Args:
        conversation: List of turn dicts with point_id, turn_type, question, answer.
        analyst_output: Structured JSON object from the Analyst agent.

    Returns:
        Tuple of (system, messages, tool_config) ready for Bedrock Converse API.
    """
    system = [{"text": SYSTEM_PROMPT}]
    messages = [
        {"role": "user", "content": [{"text": _format_user_message(conversation, analyst_output)}]}
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
    sections.append("## Supplementary Context (for contextual_advice only)")
    sections.append("\n### Target Role")
    sections.append(f"Title: {target_role.get('title', 'N/A')}")
    if target_role.get("required_skills"):
        sections.append(f"Required skills: {', '.join(target_role['required_skills'])}")
    if target_role.get("preferred_skills"):
        sections.append(f"Preferred skills: {', '.join(target_role['preferred_skills'])}")
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
        "Your 'strengths' MUST quote or paraphrase what the student actually said. "
        "Your 'improvements' should suggest how to answer better next time. "
        "Use 'contextual_advice' to mention resume experiences not discussed and job gaps."
    )

    return "\n".join(sections)


def _build_tool_config() -> dict:
    """Build the toolConfig dict for Bedrock Converse API with forced tool choice."""
    return {
        "tools": [
            {
                "toolSpec": EVALUATION_TOOL_SCHEMA
            }
        ],
        "toolChoice": {
            "tool": {"name": "submit_evaluation"}
        }
    }
