"""Tool-use schema definitions for the Evaluator agent."""

EVALUATION_TOOL_SCHEMA: dict = {
    "name": "submit_evaluation",
    "description": "Submit the interview evaluation with per-question scores, per-question feedback, overall summaries, keyword coverage, and contextual advice for a co-op student.",
    "inputSchema": {
        "json": {
            "type": "object",
            "required": [
                "per_question_scores",
                "strengths",
                "improvements",
                "keywords_covered",
                "keywords_not_covered",
                "contextual_advice",
            ],
            "properties": {
                "per_question_scores": {
                    "type": "array",
                    "description": "One score object per question-answer pair in the conversation.",
                    "items": {
                        "type": "object",
                        "required": ["question_text", "feedback", "scores"],
                        "properties": {
                            "question_text": {
                                "type": "string",
                                "description": "The interview question that was asked."
                            },
                            "feedback": {
                                "type": "object",
                                "required": ["strength", "improvement"],
                                "description": "Per-question qualitative feedback about the student's answer.",
                                "properties": {
                                    "strength": {
                                        "type": "string",
                                        "description": "One sentence: what the student did well in THIS specific answer. Reference what they actually said."
                                    },
                                    "improvement": {
                                        "type": "string",
                                        "description": "One sentence: one actionable tip to improve THIS specific answer next time."
                                    }
                                }
                            },
                            "scores": {
                                "type": "object",
                                "required": [
                                    "concrete_example",
                                    "star_structure",
                                    "link_to_job",
                                    "quantifiable_outcome"
                                ],
                                "properties": {
                                    "concrete_example": {
                                        "type": "integer",
                                        "minimum": 1,
                                        "maximum": 5,
                                        "description": "Did the student provide a specific, real example? (1-5)"
                                    },
                                    "star_structure": {
                                        "type": "integer",
                                        "minimum": 1,
                                        "maximum": 5,
                                        "description": "Did the answer follow STAR structure (Situation, Task, Action, Result)? (1-5)"
                                    },
                                    "link_to_job": {
                                        "type": "integer",
                                        "minimum": 1,
                                        "maximum": 5,
                                        "description": "Did the student connect their experience to the target role? (1-5)"
                                    },
                                    "quantifiable_outcome": {
                                        "type": "integer",
                                        "minimum": 1,
                                        "maximum": 5,
                                        "description": "Did the student include measurable results or impact? (1-5)"
                                    }
                                }
                            }
                        }
                    }
                },
                "strengths": {
                    "type": "array",
                    "items": {"type": "string"},
                    "minItems": 1,
                    "maxItems": 3,
                    "description": "2-3 sentences of OVERALL interview summary: what patterns of strength appeared across ALL answers as a whole. Do NOT repeat per-question feedback. Write as a cohesive paragraph-style summary."
                },
                "improvements": {
                    "type": "array",
                    "items": {"type": "string"},
                    "minItems": 1,
                    "maxItems": 3,
                    "description": "2-3 sentences of OVERALL improvement summary: what cross-cutting patterns to work on across ALL answers. Do NOT repeat per-question feedback. Write as a cohesive paragraph-style summary."
                },
                "keywords_covered": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "Job-description keywords/skills that the student DID mention or demonstrate during the interview (from the required_skills and preferred_skills in the target role)."
                },
                "keywords_not_covered": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "Job-description keywords/skills that the student did NOT mention during the interview but are listed in required_skills or preferred_skills."
                },
                "contextual_advice": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "Advice referencing unused resume experiences or job competency gaps."
                }
            }
        }
    }
}
