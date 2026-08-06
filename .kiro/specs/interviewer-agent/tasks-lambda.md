# Tasks: Interviewer Lambda (1 person)

## What You're Building

A Python 3.12 Lambda that receives the Analyst output, loads two S3 configs, assembles a runtime context string, and returns it. No LLM calls, no audio, no state.

**Reference docs:**
- `design.md` — full architecture, function signatures, deployment commands
- `requirements.md` — acceptance criteria and error messages
- `schemas/interview_structure.json` — what the interview covers
- `schemas/student_interview.json` — how the interviewer behaves
- `schemas/analyst_output.json` (at repo root: `schemas/`) — what you receive as input

**Environment:**
- Region: `us-east-1`
- S3 Bucket: `cic-mock-interview-configs-002859476624`
- Keys: `interview_structure.json`, `student_interview_profile.json`

---

## Tasks

### Task 1: Create package structure

- [ ] Create `interviewer/__init__.py` (empty)
- [ ] Create `interviewer/tests/__init__.py` (empty)
- [ ] Delete `interviewer/.gitkeep` if it exists

---

### Task 2: Implement `interviewer/validation.py`

- [ ] Implement `validate_input(payload)` function
- [ ] Check payload is a dict
- [ ] Check `analyst_output` key exists
- [ ] Check `analyst_output` is a non-empty dict
- [ ] Return `(analyst_output, None)` on success
- [ ] Return `(None, "analyst_output is required and must be a non-empty object")` on failure

**Interface:**
```python
def validate_input(payload: dict) -> tuple[dict | None, str | None]:
```

---

### Task 3: Implement `interviewer/config_loader.py`

- [ ] Define `ConfigLoadError(Exception)` class
- [ ] Create module-level S3 client: `boto3.client("s3", region_name=os.environ.get("AWS_REGION", "us-east-1"))`
- [ ] Implement `load_interview_structure(bucket, key)` → returns parsed dict
- [ ] Implement `load_interview_profile(bucket, key)` → returns parsed dict
- [ ] Catch `botocore.exceptions.ClientError` → raise `ConfigLoadError` (message includes config name)
- [ ] Catch `json.JSONDecodeError` → raise `ConfigLoadError` (message includes config name)

**Interface:**
```python
class ConfigLoadError(Exception):
    pass

def load_interview_structure(bucket: str, key: str) -> dict:
def load_interview_profile(bucket: str, key: str) -> dict:
```

---

### Task 4: Implement `interviewer/context_builder.py`

- [ ] Implement `build_runtime_context(analyst_output, interview_structure, interview_profile)` → returns string
- [ ] Format with sections: `[CANDIDATE DATA]`, `[INTERVIEW STRUCTURE]`, `[INTERVIEW PROFILE]`, `[BEHAVIORAL INSTRUCTIONS]`
- [ ] JSON-dump each dict with `indent=2`
- [ ] Hardcode behavioral instructions:
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

### Task 5: Implement `interviewer/handler.py`

- [ ] Implement `lambda_handler(event, context)`
- [ ] Mode detection: `event` has `body` key → parse JSON; otherwise use event as payload
- [ ] If JSON parse fails → return `{"statusCode": 400, "body": json.dumps({"success": false, "error_message": "Request body is not valid JSON"})}`
- [ ] Call `validate_input(payload)` → on error, return 200 with error
- [ ] Read env vars: `S3_BUCKET`, `INTERVIEW_STRUCTURE_KEY`, `INTERVIEW_PROFILE_KEY`
- [ ] Call `load_interview_structure` → on `ConfigLoadError`, return 200 with error (use `str(e)`)
- [ ] Call `load_interview_profile` → on `ConfigLoadError`, return 200 with error (use `str(e)`)
- [ ] Call `build_runtime_context` → get context string
- [ ] Return `{"statusCode": 200, "body": json.dumps({"success": true, "runtime_context": context_string})}`
- [ ] Wrap all in try/except → return 500 on unhandled exceptions
- [ ] Do NOT set CORS headers

---

### Task 6: Write tests

- [ ] `interviewer/tests/test_validation.py`
  - Valid payload → returns (analyst_output, None)
  - Missing key → returns (None, error)
  - Empty dict → returns (None, error)
  - Non-dict analyst_output → returns (None, error)
- [ ] `interviewer/tests/test_config_loader.py`
  - Mock boto3, valid JSON → returns dict
  - Mock NoSuchKey → raises ConfigLoadError with config name in message
  - Invalid JSON → raises ConfigLoadError
- [ ] `interviewer/tests/test_context_builder.py`
  - Output contains all 4 section headers
  - analyst_output JSON appears in output
  - Idempotent (same input → same output)
- [ ] `interviewer/tests/test_handler.py`
  - Function URL mode → 200 success
  - Invalid body → 400
  - Direct mode → 200 success
  - Validation error → 200 + success=false
  - Config error → 200 + success=false
  - Unhandled exception → 500

**Run:** `python3 -m pytest interviewer/tests/ -v`

---

### Task 7: Deploy and verify

- [ ] Package: `zip -r interviewer.zip interviewer/`
- [ ] Create Lambda (see `design.md` Deployment section for full command)
- [ ] Set env vars on the Lambda
- [ ] Enable Function URL with CORS
- [ ] Test with curl:
  ```bash
  curl -X POST <function-url> \
    -H "Content-Type: application/json" \
    -d '{"analyst_output": {"schema_version": "1.0", "candidate_profile": {"candidate_level": "student_intern"}, "target_role": {"title": "SDE Intern"}, "resume_job_alignment": {}, "interview_plan": [], "selected_experiences": [], "analysis_warnings": []}}'
  ```
- [ ] Verify: 200 response, `success: true`, non-empty `runtime_context`
- [ ] Share the Function URL with the frontend person

---

## Done Criteria

The Lambda is deployed, returns a valid runtime_context when called with analyst_output, and the Function URL is accessible. The frontend person can now call it and use the response to start a Nova Sonic session.
