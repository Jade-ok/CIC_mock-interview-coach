"""Tool-use schema definitions for the Evaluator agent."""

EVALUATION_TOOL_SCHEMA: dict = {
    "name": "submit_evaluation",
    "description": "Submit the interview evaluation with per-question scores and qualitative feedback for a co-op student.",
    "inputSchema": {
        "json": {
            "type": "object",
            "required": ["per_question_scores", "strengths", "improvements", "contextual_advice"],
            "properties": {
                "per_question_scores": {
                    "type": "array",
                    "description": "One score object per question-answer pair in the conversation.",
                    "items": {
                        "type": "object",
                        "required": ["question_text", "answer_summary", "scores"],
                        "properties": {
                            "question_text": {
                                "type": "string",
                                "description": "The interview question that was asked."
                            },
                            "answer_summary": {
                                "type": "string",
                                "description": "A brief summary of the student's answer."
                            },
                            "scores": {
                                "type": "object",
                                "required": [
                                    "concrete_example",
                                    "situation_action_result",
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
                                    "situation_action_result": {
                                        "type": "integer",
                                        "minimum": 1,
                                        "maximum": 5,
                                        "description": "Did the answer follow SAR structure? (1-5)"
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
                    "description": "Specific praise with direct quotes or references from the conversation."
                },
                "improvements": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "Specific, actionable improvement advice tied to scoring dimensions."
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
