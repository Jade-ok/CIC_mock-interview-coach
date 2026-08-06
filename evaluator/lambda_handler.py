"""Lambda entry point and orchestrator for the Evaluator agent."""

import json
import logging

from evaluator import validator, prompt_builder, bedrock_client, scorer, response_assembler
from evaluator.exceptions import ValidationError, EvaluationError

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)


def handler(event: dict, context) -> dict:
    """AWS Lambda handler for the Evaluator Function URL.

    Orchestrates the evaluation flow:
    1. Validate input
    2. Build evaluation prompt
    3. Call Bedrock Converse API
    4. Extract and aggregate scores
    5. Assemble response

    Args:
        event: The Lambda Function URL event dict.
        context: The Lambda context object (unused).

    Returns:
        An HTTP response dict with statusCode and JSON body.
    """
    try:
        # 1. Parse and validate input
        payload = validator.parse_and_validate(event)

        # 2. Build evaluation prompt
        system, messages, tool_config = prompt_builder.build(
            conversation=payload["conversation"],
            analyst_output=payload["analyst_output"],
        )

        # 3. Call Bedrock Converse API
        llm_response = bedrock_client.invoke(system, messages, tool_config)

        # 4. Extract and aggregate scores
        per_question_scores = scorer.extract_and_clamp(llm_response)
        overall_scores = scorer.aggregate(per_question_scores)
        readiness_label = scorer.classify(overall_scores["total"])

        # 5. Assemble response (pass through interview_metadata)
        response_body = response_assembler.build(
            per_question_scores=per_question_scores,
            overall_scores=overall_scores,
            readiness_label=readiness_label,
            llm_response=llm_response,
            interview_metadata=payload["interview_metadata"],
        )

        return {
            "statusCode": 200,
            "headers": {"Content-Type": "application/json"},
            "body": json.dumps(response_body),
        }

    except ValidationError as e:
        logger.warning("Validation error: %s", e)
        return {
            "statusCode": 400,
            "headers": {"Content-Type": "application/json"},
            "body": json.dumps({"error": "ValidationError", "message": str(e)}),
        }

    except EvaluationError as e:
        logger.error("Evaluation error: %s", e)
        return {
            "statusCode": 500,
            "headers": {"Content-Type": "application/json"},
            "body": json.dumps({"error": "EvaluationError", "message": str(e)}),
        }

    except Exception as e:
        logger.exception("Unexpected error during evaluation")
        return {
            "statusCode": 500,
            "headers": {"Content-Type": "application/json"},
            "body": json.dumps({"error": "InternalError", "message": "An unexpected error occurred"}),
        }
