# Tasks

> Historical implementation record. Paths and field names were refreshed on 2026-08-08; check current code and tests for implementation status. Amplify Hosting, the Lambda backend, and the signed AgentCore WSS path are deployed; this checklist remains scoped to Evaluator implementation work.

## Task 1: Project Setup and Module Scaffolding

- [x] Create the `backend/functions/evaluator/` directory structure with all module files
- [x] Create `backend/functions/evaluator/__init__.py`
- [x] Create `backend/functions/evaluator/lambda_handler.py` with handler stub
- [x] Create `backend/functions/evaluator/validator.py` with empty function stubs
- [x] Create `backend/functions/evaluator/prompt_builder.py` with empty function stubs
- [x] Create `backend/functions/evaluator/bedrock_client.py` with empty function stubs
- [x] Create `backend/functions/evaluator/scorer.py` with empty function stubs
- [x] Create `backend/functions/evaluator/response_assembler.py` with empty function stubs
- [x] Create `backend/functions/evaluator/exceptions.py` with ValidationError and EvaluationError classes
- [x] Create `backend/functions/evaluator/schemas.py` with tool schema definition placeholder

## Task 2: Implement Input Validation

- [x] Implement `validator.parse_and_validate(event)` to parse JSON body from Function URL event
- [x] Validate presence of required fields: conversation, interview_metadata, analyst_output
- [x] Validate conversation length (1-6 pairs)
- [x] Validate each turn contains point_id, turn_type, question, answer
- [x] Raise `ValidationError` with descriptive messages on failure
- [x] Write unit tests for validator with valid input, missing fields, empty conversation, >6 turns, and missing turn fields

## Task 3: Implement Prompt Builder

- [x] Define `SYSTEM_PROMPT` constant with co-op calibration, 1-5 scoring dimensions, and tone directive
- [x] Implement `_format_user_message(conversation, analyst_output)` to format the user message, extracting target_role and resume_job_alignment from the structured analyst_output object
- [x] Implement `_build_tool_config()` returning the OpenAI-compatible submit_evaluation function and forced tool choice
- [x] Implement `build(conversation, analyst_output)` returning (system, messages, tool_config) tuple
- [x] Define `EVALUATION_TOOL_SCHEMA` in schemas.py with per-question feedback and scores, overall summaries, keyword coverage, and contextual advice
- [x] Write unit tests verifying prompt structure, system prompt content, and tool schema completeness

## Task 4: Implement Bedrock Client

- [x] Implement SigV4-signed Bedrock Mantle Chat Completions requests in us-east-1
- [x] Implement `invoke(system, messages, tool_config)` with retry logic (max 2 attempts)
- [x] Implement `_extract_tool_input(response)` to parse the forced function arguments from Chat Completions
- [x] Raise `EvaluationError` on total failure or missing function call
- [x] Write unit tests with mocked Mantle HTTP responses: success, retry, terminal failure, and malformed output

## Task 5: Implement Scorer

- [x] Define `DIMENSIONS` list and `READINESS_THRESHOLDS` list (1-5 scale)
- [x] Implement `extract_and_clamp(llm_response)` — clamp each dimension score to 1-5 integer
- [x] Implement `aggregate(per_question_scores)` — compute dimension averages and total, round to 1 decimal
- [x] Implement `classify(total_score)` — deterministic readiness label from thresholds
- [x] Write unit tests: clamping edge cases (0→1, 6→5), variable-length averaging (1, 3, 6 questions), all threshold boundaries

## Task 6: Implement Response Assembler

- [x] Implement `build(per_question_scores, overall_scores, readiness_label, llm_response, interview_metadata)`
- [x] Ensure output matches the defined response schema (per_question_scores, overall_scores, question_count, readiness_label, strengths, improvements, keywords_covered, keywords_not_covered, contextual_advice, interview_metadata)
- [x] Write unit tests verifying correct field mapping and interview_metadata pass-through

## Task 7: Implement Lambda Handler (Orchestrator)

- [x] Import all modules and wire together the orchestration flow
- [x] Implement `handler(event, context)` following the validation → prompt → API → score → response sequence
- [x] Handle `ValidationError` → 400 response with error JSON
- [x] Handle `EvaluationError` → 500 response with error JSON
- [x] Handle unexpected exceptions → 500 response with generic error
- [x] Write integration test with mocked Bedrock client testing full happy path
- [x] Write integration tests for error paths (invalid input, API failure)

## Task 8: Local End-to-End Testing and Packaging

- [x] Create a sample test payload matching the actual Interviewer output format
- [x] Run full integration test locally with mocked Bedrock response
- [x] Verify response JSON matches the defined output schema
- [x] Add requirements.txt or pyproject.toml with boto3 dependency
- [x] Keep the infrastructure template aligned with the Lambda runtime configuration (300s timeout, Python 3.12 runtime)
- [x] Document credential-chain behavior and model-scoped Bedrock Mantle IAM permissions
