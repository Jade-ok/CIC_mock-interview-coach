# Tasks: Interviewer Lambda (1 person)

> Historical implementation record for the context-builder Lambda. Paths were refreshed on 2026-08-07; use `tasks-nova-sonic-conversation.md` for active voice integration work.

## What You're Building

A Python 3.12 Lambda that receives the Analyst output, loads two S3 configs, assembles a runtime context string, and returns it. No LLM calls, no audio, no state.

**Reference docs:**
- `design.md` — full architecture, function signatures, deployment commands
- `requirements.md` — acceptance criteria and error messages
- `backend/config/interview_structure.json` — what the interview covers
- `backend/config/student_interview_profile.json` — how the interviewer behaves
- `schemas/analyst_output.json` — what you receive as input

**Environment:**
- Region: `us-east-1`
- S3 Bucket: `cic-mock-interview-configs-002859476624`
- Keys: `interview_structure.json`, `student_interview_profile.json`

---

## Tasks

### Task 1: Create package structure

- [x] Create `backend/functions/interviewer/__init__.py` (empty)
- [x] Create `backend/functions/interviewer/tests/__init__.py` (empty)
- [x] Delete `backend/functions/interviewer/.gitkeep` if it exists

---

### Task 2: Implement `backend/functions/interviewer/validation.py`

- [x] Implement `validate_input(payload)` function
- [x] Check payload is a dict
- [x] Check `analyst_output` key exists
- [x] Check `analyst_output` is a non-empty dict
- [x] Return `(analyst_output, None)` on success
- [x] Return `(None, "analyst_output is required and must be a non-empty object")` on failure

**Interface:**
```python
def validate_input(payload: dict) -> tuple[dict | None, str | None]:
```

---

### Task 3: Implement `backend/functions/interviewer/config_loader.py`

- [x] Define `ConfigLoadError(Exception)` class
- [x] Create module-level S3 client: `boto3.client("s3", region_name=os.environ.get("AWS_REGION", "us-east-1"))`
- [x] Implement `load_interview_structure(bucket, key)` → returns parsed dict
- [x] Implement `load_interview_profile(bucket, key)` → returns parsed dict
- [x] Catch `botocore.exceptions.ClientError` → raise `ConfigLoadError` (message includes config name)
- [x] Catch `json.JSONDecodeError` → raise `ConfigLoadError` (message includes config name)

**Interface:**
```python
class ConfigLoadError(Exception):
    pass

def load_interview_structure(bucket: str, key: str) -> dict:
def load_interview_profile(bucket: str, key: str) -> dict:
```

---

### Task 4: Implement `backend/functions/interviewer/context_builder.py`

- [x] Implement `build_runtime_context(analyst_output, interview_structure, interview_profile)` → returns string
- [x] Format with sections: `[CANDIDATE DATA]`, `[INTERVIEW STRUCTURE]`, `[INTERVIEW PROFILE]`, `[BEHAVIORAL INSTRUCTIONS]`
- [x] JSON-dump each dict with `indent=2`
- [x] Hardcode behavioral instructions:
  - Ask one question at a time (no compound questions)
  - Keep questions concise and use clear language
  - Follow the tone specified in the interview profile
  - Accept all experience types listed in the interview profile
  - Do not invent details not present in the candidate data
  - Do not give feedback or score answers during the interview
  - Do not ask the candidate to rate themselves
  - Signal transitions between interview points
  - Stop gracefully when the session ends

**Interface:**
```python
def build_runtime_context(analyst_output: dict, interview_structure: dict, interview_profile: dict) -> str:
```

---

### Task 5: Implement `backend/functions/interviewer/handler.py`

- [x] Implement `lambda_handler(event, context)`
- [x] Mode detection: `event` has `body` key → parse JSON; otherwise use event as payload
- [x] If JSON parse fails → return `{"statusCode": 400, "body": json.dumps({"success": false, "error_message": "Request body is not valid JSON"})}`
- [x] Call `validate_input(payload)` → on error, return 200 with error
- [x] Read env vars: `S3_BUCKET`, `INTERVIEW_STRUCTURE_KEY`, `INTERVIEW_PROFILE_KEY`
- [x] Call `load_interview_structure` → on `ConfigLoadError`, return 200 with error (use `str(e)`)
- [x] Call `load_interview_profile` → on `ConfigLoadError`, return 200 with error (use `str(e)`)
- [x] Call `build_runtime_context` → get context string
- [x] Return `{"statusCode": 200, "body": json.dumps({"success": true, "runtime_context": context_string})}`
- [x] Wrap all in try/except → return 500 on unhandled exceptions
- [x] Do NOT set CORS headers

---

### Task 6: Write tests

- [x] `backend/functions/interviewer/tests/test_validation.py`
  - Valid payload → returns (analyst_output, None)
  - Missing key → returns (None, error)
  - Empty dict → returns (None, error)
  - Non-dict analyst_output → returns (None, error)
- [x] `backend/functions/interviewer/tests/test_config_loader.py`
  - Mock boto3, valid JSON → returns dict
  - Mock NoSuchKey → raises ConfigLoadError with config name in message
  - Invalid JSON → raises ConfigLoadError
- [x] `backend/functions/interviewer/tests/test_context_builder.py`
  - Output contains all 4 section headers
  - analyst_output JSON appears in output
  - Idempotent (same input → same output)
- [x] `backend/functions/interviewer/tests/test_handler.py`
  - Function URL mode → 200 success
  - Invalid body → 400
  - Direct mode → 200 success
  - Validation error → 200 + success=false
  - Config error → 200 + success=false
  - Unhandled exception → 500

**Run:** `python3 -m pytest backend/functions/interviewer/tests/ -v`

---

### Task 7: Deploy and verify

- [x] Package the contents of `backend/functions/interviewer/` at the ZIP root
- [x] Create Lambda (see `design.md` Deployment section for full command)
- [x] Set env vars on the Lambda
- [x] Enable Function URL with CORS
- [x] Test with curl:
  ```bash
  curl -X POST <function-url> \
    -H "Content-Type: application/json" \
    -d '{"analyst_output": {"schema_version": "1.0", "candidate_profile": {"candidate_level": "student_intern"}, "target_role": {"title": "SDE Intern"}, "resume_job_alignment": {}, "interview_plan": [], "selected_experiences": [], "analysis_warnings": []}}'
  ```
- [x] Verify: 200 response, `success: true`, non-empty `runtime_context`
- [x] Share the Function URL with the frontend person

---

## Done Criteria

The Lambda is deployed, returns a valid runtime_context when called with analyst_output, and the Function URL is accessible. The other person can now use this runtime_context as the system instruction for their Voice Agent Server on AgentCore Runtime.
