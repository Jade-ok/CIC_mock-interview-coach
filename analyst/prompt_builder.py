"""Prompt construction for the Analyst agent's Bedrock Converse API call."""

MODEL_ID = "us.anthropic.claude-sonnet-4-6"

SYSTEM_PROMPT = """You are a resume analyst for a mock behavioral interview coaching application \
designed for university students and new graduates.

Your task is to analyze a candidate's resume against a target job posting and produce a \
structured analysis that will be used to prepare personalized behavioral interview questions.

IMPORTANT CALIBRATION:
- The candidates are students or new graduates seeking internships or entry-level positions.
- Do NOT expect senior-level experience, large-scale production ownership, or formal management experience.
- Valid experience types include: internships, coursework, academic projects, personal projects, \
hackathons, and student clubs.
- Treat school projects, course work, hackathons, team assignments, and volunteer work as legitimate experience.
- Score relevance generously when students demonstrate learning, initiative, and growth.

ANALYSIS INSTRUCTIONS:
1. Identify the candidate's level (student_intern or new_grad) based on their resume.
2. Summarize their education background, overall experience, and relevant skills.
3. Extract target role details from the job posting (title, company, seniority, requirements).
4. Map resume evidence to job requirements — identify strong matches, partial matches, and areas to explore.
5. Select up to 5 of the candidate's strongest experiences relevant to the target role.
6. For each selected experience, identify candidate claims, skills demonstrated, and details worth clarifying in an interview.
7. Propose an interview plan with up to 5 prioritized topics for behavioral interview questions.
8. Flag any data quality issues in analysis_warnings (e.g., very short resume, missing job details, no alignment found).

RULES:
- Always set schema_version to "1.0".
- candidate_level must be either "student_intern" or "new_grad".
- experience_type must be one of: "internship", "coursework", "academic_project", "personal_project", "hackathon", "student_club".
- relevance_score must be a number between 0.0 and 1.0.
- interview_plan must have at most 5 entries.
- selected_experiences must have at most 5 entries.
- If you cannot find relevant experiences, return an empty selected_experiences list and add a warning.
- Do NOT invent information that is not in the resume or job posting."""


def build_converse_request(resume_text: str, job_posting_text: str) -> dict:
    """Construct the Bedrock Converse API request for analyst analysis.

    Builds a complete request dict with system prompt, user message containing
    resume and job posting text, and toolConfig forcing structured JSON output
    via the analyst_output tool definition.

    Args:
        resume_text: Extracted text content from the candidate's resume.
        job_posting_text: Extracted text content from the target job posting.

    Returns:
        dict ready to pass to boto3 bedrock-runtime client.converse(**request).
        Contains modelId, system, messages, toolConfig, and inferenceConfig.
    """
    user_message = (
        "## Candidate Resume\n\n"
        f"{resume_text}\n\n"
        "## Target Job Posting\n\n"
        f"{job_posting_text}\n\n"
        "---\n"
        "Analyze this resume against the job posting. "
        "Identify the candidate's strongest experiences, map them to job requirements, "
        "and propose behavioral interview topics. Use the analyst_output tool to provide "
        "your structured analysis."
    )

    return {
        "modelId": MODEL_ID,
        "system": [{"text": SYSTEM_PROMPT}],
        "messages": [
            {
                "role": "user",
                "content": [{"text": user_message}],
            }
        ],
        "toolConfig": _build_tool_config(),
        "inferenceConfig": {
            "maxTokens": 8192,
            "temperature": 0.0,
        },
    }


def _build_tool_config() -> dict:
    """Build the toolConfig dict with analyst_output tool schema and forced tool choice."""
    return {
        "tools": [
            {
                "toolSpec": {
                    "name": "analyst_output",
                    "description": (
                        "Produce a structured analysis of the candidate's resume "
                        "against the job posting for behavioral interview preparation."
                    ),
                    "inputSchema": {
                        "json": _analyst_output_schema()
                    },
                }
            }
        ],
        "toolChoice": {"tool": {"name": "analyst_output"}},
    }


def _analyst_output_schema() -> dict:
    """Return the analyst_output JSON Schema mirroring schemas/analyst_output.json."""
    return {
        "type": "object",
        "required": [
            "schema_version",
            "candidate_profile",
            "target_role",
            "resume_job_alignment",
            "interview_plan",
            "selected_experiences",
            "analysis_warnings",
        ],
        "properties": {
            "schema_version": {
                "type": "string",
                "const": "1.0",
                "description": "Schema version identifier, always '1.0'.",
            },
            "candidate_profile": {
                "type": "object",
                "description": "Summary of the candidate's background derived from the resume.",
                "required": [
                    "candidate_level",
                    "education_summary",
                    "experience_summary",
                    "relevant_skills",
                    "experience_types_available",
                ],
                "properties": {
                    "candidate_level": {
                        "type": "string",
                        "enum": ["student_intern", "new_grad"],
                        "description": "The candidate's career level.",
                    },
                    "education_summary": {
                        "type": "string",
                        "description": "Summary of the candidate's education background.",
                    },
                    "experience_summary": {
                        "type": "string",
                        "description": "Summary of the candidate's overall experience.",
                    },
                    "relevant_skills": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "List of skills relevant to the target role.",
                    },
                    "experience_types_available": {
                        "type": "array",
                        "items": {
                            "type": "string",
                            "enum": [
                                "internship",
                                "coursework",
                                "academic_project",
                                "personal_project",
                                "hackathon",
                                "student_club",
                            ],
                        },
                        "description": "Types of experience the candidate has.",
                    },
                },
            },
            "target_role": {
                "type": "object",
                "description": "Details about the target job extracted from the posting.",
                "required": [
                    "title",
                    "company",
                    "seniority",
                    "role_summary",
                    "required_skills",
                    "preferred_skills",
                    "key_responsibilities",
                    "evaluation_priorities",
                ],
                "properties": {
                    "title": {
                        "type": "string",
                        "description": "Job title from the posting.",
                    },
                    "company": {
                        "type": "string",
                        "description": "Company name from the posting.",
                    },
                    "seniority": {
                        "type": "string",
                        "description": "Seniority level of the role (e.g., intern, new_grad, junior).",
                    },
                    "role_summary": {
                        "type": "string",
                        "description": "One-line summary of the role.",
                    },
                    "required_skills": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "Skills required by the job posting.",
                    },
                    "preferred_skills": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "Skills preferred but not required by the job posting.",
                    },
                    "key_responsibilities": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "Main responsibilities of the role.",
                    },
                    "evaluation_priorities": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "What the interviewer should prioritize evaluating.",
                    },
                },
            },
            "resume_job_alignment": {
                "type": "object",
                "description": "Mapping of resume evidence to job requirements.",
                "required": ["strong_matches", "partial_matches", "areas_to_explore"],
                "properties": {
                    "strong_matches": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "required": ["resume_evidence", "job_requirement", "match_reason"],
                            "properties": {
                                "resume_evidence": {
                                    "type": "string",
                                    "description": "What the resume says.",
                                },
                                "job_requirement": {
                                    "type": "string",
                                    "description": "What the job needs.",
                                },
                                "match_reason": {
                                    "type": "string",
                                    "description": "Why this is a strong match.",
                                },
                            },
                        },
                        "description": "Clear matches between resume and job requirements.",
                    },
                    "partial_matches": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "required": ["resume_evidence", "job_requirement", "match_reason"],
                            "properties": {
                                "resume_evidence": {
                                    "type": "string",
                                    "description": "What the resume says.",
                                },
                                "job_requirement": {
                                    "type": "string",
                                    "description": "What the job needs.",
                                },
                                "match_reason": {
                                    "type": "string",
                                    "description": "Why this is a partial match.",
                                },
                            },
                        },
                        "description": "Partial or indirect matches.",
                    },
                    "areas_to_explore": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "required": ["topic", "reason"],
                            "properties": {
                                "topic": {
                                    "type": "string",
                                    "description": "Gap or unclear area to explore.",
                                },
                                "reason": {
                                    "type": "string",
                                    "description": "Why this needs probing in the interview.",
                                },
                            },
                        },
                        "description": "Gaps or areas that need further exploration.",
                    },
                },
            },
            "interview_plan": {
                "type": "array",
                "maxItems": 5,
                "items": {
                    "type": "object",
                    "required": [
                        "topic",
                        "priority",
                        "question_type",
                        "target_skill",
                        "source_experience_id",
                    ],
                    "properties": {
                        "topic": {
                            "type": "string",
                            "description": "What to ask about.",
                        },
                        "priority": {
                            "type": "integer",
                            "description": "Priority ordering, 1 is highest.",
                        },
                        "question_type": {
                            "type": "string",
                            "description": "Type of interview question (behavioral).",
                        },
                        "target_skill": {
                            "type": "string",
                            "description": "Skill being assessed.",
                        },
                        "source_experience_id": {
                            "type": ["string", "null"],
                            "description": "Links to selected_experiences.experience_id, or null.",
                        },
                    },
                },
                "description": "Prioritized list of interview topics (max 5).",
            },
            "selected_experiences": {
                "type": "array",
                "maxItems": 5,
                "items": {
                    "type": "object",
                    "required": [
                        "experience_id",
                        "title",
                        "experience_type",
                        "organization",
                        "summary",
                        "candidate_claims",
                        "skills_demonstrated",
                        "job_requirements_supported",
                        "relevance_score",
                        "relevance_reason",
                        "details_to_clarify",
                    ],
                    "properties": {
                        "experience_id": {
                            "type": "string",
                            "description": "Unique identifier (e.g., exp_1, exp_2).",
                        },
                        "title": {
                            "type": "string",
                            "description": "Title of the experience.",
                        },
                        "experience_type": {
                            "type": "string",
                            "enum": [
                                "internship",
                                "coursework",
                                "academic_project",
                                "personal_project",
                                "hackathon",
                                "student_club",
                            ],
                            "description": "Category of the experience.",
                        },
                        "organization": {
                            "type": "string",
                            "description": "Organization where the experience took place.",
                        },
                        "summary": {
                            "type": "string",
                            "description": "Brief description of the experience.",
                        },
                        "candidate_claims": {
                            "type": "array",
                            "items": {"type": "string"},
                            "description": "Claims made by the candidate in their resume.",
                        },
                        "skills_demonstrated": {
                            "type": "array",
                            "items": {"type": "string"},
                            "description": "Skills demonstrated in this experience.",
                        },
                        "job_requirements_supported": {
                            "type": "array",
                            "items": {"type": "string"},
                            "description": "Job requirements this experience supports.",
                        },
                        "relevance_score": {
                            "type": "number",
                            "minimum": 0.0,
                            "maximum": 1.0,
                            "description": "Relevance score between 0.0 and 1.0.",
                        },
                        "relevance_reason": {
                            "type": "string",
                            "description": "Why this experience is relevant to the role.",
                        },
                        "details_to_clarify": {
                            "type": "array",
                            "items": {"type": "string"},
                            "description": "What the interviewer should probe further.",
                        },
                    },
                },
                "description": "Up to 5 prioritized experiences relevant to the role.",
            },
            "analysis_warnings": {
                "type": "array",
                "items": {"type": "string"},
                "description": "Data quality issues found during analysis. Empty list if none.",
            },
        },
    }
