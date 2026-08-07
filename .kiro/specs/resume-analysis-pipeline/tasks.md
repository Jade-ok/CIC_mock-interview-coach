# Implementation Plan: Resume Analysis Pipeline

> These completed tasks cover the Lambda implementation. Amplify frontend hosting and authenticated AgentCore voice deployment are tracked in the frontend/interviewer specs and must not be inferred as complete from this file.

> Historical implementation record. Last reconciled with the refactored paths on 2026-08-07.

## Overview

Two independent Lambda functions — `pdf_parser` and `analyst` — built in Python 3.12. The pdf_parser extracts text from base64 PDFs and passes through plain-text job postings. The analyst calls Bedrock Converse API with tool_use (model: `global.anthropic.claude-sonnet-5`, region: `us-east-1`) to produce structured JSON conforming to `schemas/analyst_output.json`. Both support dual invocation modes and share the same response envelope pattern.

The original hackathon build used standalone test events. The repository now uses pytest through the root `pytest.ini`, and each Lambda folder still includes a `test_event.json` for manual invocation.

## Tasks

- [x] 1. Commit schema, README, and spec docs to main
  - [x] 1.1 Stage and commit shared artifacts to main branch
    - Stage `schemas/analyst_output.json`, `README.md`, and `.kiro/specs/resume-analysis-pipeline/` directory
    - Commit with message: `feat: add analyst_output schema contract + spec docs for resume-analysis-pipeline`
    - Push to `main` so teammates (interviewer, evaluator, frontend) can access the schema immediately
    - _Requirements: 6.1, 6.2_

- [x] 2. Implement pdf_parser — validation and invocation mode detection
  - [x] 2.1 Create `backend/functions/pdf_parser/validation.py`
    - Implement `detect_invocation_mode(event)` — if `event` has `body` key with string value, parse JSON from it; otherwise return event as-is
    - Implement `validate_request(payload)` — check at least one document present, base64 size ≤ 4 MB, format flag is `"pdf"` or `"text"` for job_posting, required fields present
    - Return `(is_valid, error_message_or_none)` tuple
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 11.1, 11.2_

- [x] 3. Implement pdf_parser — PDF text extraction
  - [x] 3.1 Create `backend/functions/pdf_parser/parser.py`
    - Implement `extract_text_from_pdf(base64_content: str) -> str`
    - Decode base64, open with `pypdf.PdfReader` via `io.BytesIO`
    - Concatenate text from all pages
    - Raise `ValueError` for invalid base64 or non-PDF content
    - Define and raise custom `EmptyDocumentError` when PDF yields zero text
    - _Requirements: 1.1, 1.3, 1.4, 2.1_

- [x] 4. Implement pdf_parser — orchestrator and handler
  - [x] 4.1 Create `backend/functions/pdf_parser/orchestrator.py`
    - Implement `process_documents(payload: dict) -> dict`
    - Handle resume (always PDF), job_posting (PDF or text based on format flag)
    - Support combined requests: both documents, resume-only, job-posting-only
    - Implement partial success: if one doc fails in combined request, return success for the other plus error entry
    - Plain text job postings pass through without processing
    - _Requirements: 2.1, 2.2, 3.1, 3.2, 3.3, 3.4_

  - [x] 4.2 Create `backend/functions/pdf_parser/handler.py` entry point
    - Implement `lambda_handler(event, context) -> dict`
    - Call `detect_invocation_mode` → `validate_request` → `process_documents`
    - Wrap all responses in standard envelope: `{"status": "success", "data": {...}}` or `{"status": "error", "error": "..."}`
    - Catch unexpected exceptions and return 500 error envelope
    - _Requirements: 12.1, 12.2, 11.1, 11.2_

  - [x] 4.3 Add `backend/functions/pdf_parser/test_event.json` sample payloads
    - Create `backend/functions/pdf_parser/test_event.json` with two example events:
      - Direct mode: `{"resume": {"content": "<short base64 PDF>", "format": "pdf"}}`
      - Function URL mode: `{"body": "{\"resume\": {\"content\": \"<short base64 PDF>\", \"format\": \"pdf\"}}"}`
    - Include a comment/note at top explaining usage: `aws lambda invoke --function-name pdf_parser --payload file://backend/functions/pdf_parser/test_event.json out.json`

- [x] 5. Implement analyst — validation and invocation mode detection
  - [x] 5.1 Create `backend/functions/analyst/validation.py`
    - Implement `detect_invocation_mode(event)` — same dual-mode pattern as pdf_parser
    - Implement `validate_request(payload)` — check `resume_text` and `job_posting_text` are present and non-empty strings
    - Return `(is_valid, error_message_or_none)` with specific field names in error
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 11.3, 11.4_

- [x] 6. Implement analyst — prompt_builder
  - [x] 6.1 Create `backend/functions/analyst/prompt_builder.py`
    - Define `MODEL_ID = "global.anthropic.claude-sonnet-5"`
    - Implement `build_converse_request(resume_text, job_posting_text) -> dict`
    - Build system prompt with analyst persona and instructions for behavioral interview context
    - Build user message combining resume_text and job_posting_text
    - Build `toolConfig` with `analyst_output` tool spec mirroring `schemas/analyst_output.json` as JSON Schema
    - Set `toolChoice: {"tool": {"name": "analyst_output"}}` to force structured output
    - _Requirements: 5.1, 6.4, 7.1, 7.2, 7.3_

- [x] 7. Implement analyst — bedrock_client
  - [x] 7.1 Create `backend/functions/analyst/bedrock_client.py`
    - Define `REGION = "us-east-1"` and `MAX_ATTEMPTS = 2`
    - Create boto3 bedrock-runtime client for us-east-1
    - Implement `call_converse(request: dict) -> dict`
    - Retry on: `ReadTimeoutError`, `ThrottlingException`, 5xx errors, invalid/unparseable response
    - Raise `BedrockCallFailed` after 2 failed attempts with reason
    - _Requirements: 7.1, 9.1, 9.2, 9.3_

- [x] 8. Implement analyst — parser (response parsing + schema validation + warnings)
  - [x] 8.1 Create `backend/functions/analyst/parser.py`
    - Implement `parse_converse_response(response: dict) -> dict`
      - Extract tool_use result from `response["output"]["message"]["content"][0]["toolUse"]["input"]`
      - Validate all top-level keys present (`candidate_profile`, `target_role`, `resume_job_alignment`, `selected_experiences`, `analysis_warnings`, `schema_version`, `interview_plan`)
      - Validate `schema_version == "1.0"`
      - Validate `experience_type` values in allowed enum set
      - Validate `relevance_score` in [0.0, 1.0]
      - Validate `interview_plan` has max 5 entries
    - Implement `check_analysis_warnings(analyst_output, resume_text, job_posting_text) -> list[str]`
      - `resume_text` < 50 words → warning
      - `job_posting_text` < 30 words → warning
      - `selected_experiences` empty → warning
      - Empty list if no issues
    - Raise `SchemaValidationError` on non-conforming output
    - _Requirements: 5.2, 5.3, 5.4, 5.5, 5.6, 6.1, 6.2, 6.3, 6.5, 6.6, 10.1, 10.2, 10.3, 10.4_

- [x] 9. Implement analyst — orchestrator and handler
  - [x] 9.1 Create `backend/functions/analyst/orchestrator.py`
    - Implement `analyze(payload: dict) -> dict`
    - Pipeline: validate → build prompt → call Bedrock (with retry) → parse response → check warnings → inject warnings into output
    - On `SchemaValidationError` from parser, trigger retry in bedrock_client
    - Return success envelope with full analyst_output, or error envelope with descriptive message
    - _Requirements: 5.1, 6.4, 6.5, 6.6, 9.1_

  - [x] 9.2 Create `backend/functions/analyst/handler.py` entry point
    - Implement `lambda_handler(event, context) -> dict`
    - Call `detect_invocation_mode` → `validate_request` → `analyze`
    - Wrap all responses in standard envelope
    - Catch unexpected exceptions and return 500 error envelope
    - _Requirements: 12.3, 12.4, 11.3, 11.4_

  - [x] 9.3 Add `backend/functions/analyst/test_event.json` sample payload
    - Create `backend/functions/analyst/test_event.json` with two example events:
      - Direct mode: `{"resume_text": "Jane Doe, Software Engineering student...", "job_posting_text": "Software Engineer at Acme Corp..."}`
      - Function URL mode: `{"body": "{\"resume_text\": \"Jane Doe...\", \"job_posting_text\": \"Software Engineer at Acme Corp...\"}"}`
    - Include a comment/note explaining usage: `aws lambda invoke --function-name analyst --payload file://backend/functions/analyst/test_event.json out.json`

## Notes

- Task 1 (git commit) should be done first to unblock teammates working on interviewer/evaluator/frontend
- `backend/functions/pdf_parser` (tasks 2–4) and `backend/functions/analyst` (tasks 5–9) are independent and can be built in parallel after task 1
- Model is `global.anthropic.claude-sonnet-5` in `us-east-1`
- `boto3` is available in the Lambda runtime — do NOT bundle it. Only bundle `pypdf` for `backend/functions/pdf_parser`.
- Each Lambda asset is packaged independently with its module files at the ZIP root.
- Handler path format for these flat assets: `handler.lambda_handler`
- CORS is handled at the Function URL config level, not in code
- Pytest is configured at the repository root; `test_event.json` files remain available for manual Lambda invocation.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["2.1", "5.1"] },
    { "id": 2, "tasks": ["3.1", "6.1"] },
    { "id": 3, "tasks": ["4.1", "4.2", "7.1"] },
    { "id": 4, "tasks": ["4.3", "8.1"] },
    { "id": 5, "tasks": ["9.1", "9.2"] },
    { "id": 6, "tasks": ["9.3"] }
  ]
}
```
