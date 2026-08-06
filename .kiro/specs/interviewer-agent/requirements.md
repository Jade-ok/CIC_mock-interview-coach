# Requirements: Interviewer Module

## Introduction

The Interviewer module is a stateless AWS Lambda (Python 3.12) that builds a runtime context for Amazon Nova Sonic. It receives the complete Analyst output, loads two configuration files from S3, combines them into a single system instruction, and returns it to the frontend. The frontend then connects directly to Nova Sonic via WebSocket and uses the runtime context as the system instruction for the spoken interview.

This Lambda makes no LLM calls, streams no audio, and scores nothing. It is a pure context-builder.

## Scope Boundaries

**What this module does:**
- Accepts the Analyst output from the frontend
- Loads interview configuration from S3
- Assembles and returns a runtime context string

**What this module does NOT do:**
- Conduct the interview (Nova Sonic does this)
- Stream or process audio
- Score or evaluate answers
- Call any LLM or Bedrock text model
- Communicate with the Evaluator Lambda
- Track session state

## Glossary

| Term | Definition |
|------|------------|
| **Analyst Output** | Structured JSON from the Analyst Lambda containing candidate profile, target role, resume-job alignment, interview plan, and selected experiences. Schema: `schemas/analyst_output.json` |
| **Interview Structure** | S3 JSON config defining what the interview covers (topics, points, follow-up guidance, number of questions). File: `interview_structure.json` in S3 |
| **Interview Profile** | S3 JSON config defining how the interviewer behaves (tone, style, rules, acceptable experience types). File: `student_interview_profile.json` in S3 |
| **Runtime Context** | The combined string returned to the frontend, built from analyst output + structure + profile + behavioral instructions. Becomes Nova Sonic's system instruction. |
| **Nova Sonic** | Amazon Nova Sonic — speech-to-speech model. The frontend connects to it directly via WebSocket. |

## Infrastructure Context

| Resource | Value |
|----------|-------|
| Region | `us-east-1` |
| S3 Bucket | `cic-mock-interview-configs-002859476624` |
| Structure Key | `interview_structure.json` |
| Profile Key | `student_interview_profile.json` |
| Runtime | Python 3.12 |
| Invocation | Lambda Function URL (HTTPS, no API Gateway) |

## Requirements

### Requirement 1: Accept Analyst Output

**User Story:** As the frontend, I send the Analyst output to the Interviewer Lambda so that the runtime context includes all candidate-specific information for Nova Sonic.

#### Acceptance Criteria

1. THE module SHALL accept a JSON payload containing an `analyst_output` field
2. THE `analyst_output` field SHALL conform to the schema defined in `schemas/analyst_output.json` (candidate_profile, target_role, resume_job_alignment, interview_plan, selected_experiences, analysis_warnings)
3. THE module SHALL NOT modify, filter, or transform the analyst_output — it is included in the runtime context as-is
4. IF `analyst_output` is missing, empty, or not a dict, THEN the module SHALL return an error immediately without attempting S3 loads
5. THE module SHALL validate presence only — it does not validate schema conformance of the analyst_output (that is the Analyst's responsibility)

### Requirement 2: Load S3 Configuration

**User Story:** As a system, I want interview structure and profile loaded from S3 so that interview format and behavior can be changed without redeploying the Lambda.

#### Acceptance Criteria

1. WHEN invoked, the module SHALL load the interview structure JSON from S3 using the bucket and key from environment variables
2. WHEN invoked, the module SHALL load the interview profile JSON from S3 using the bucket and key from environment variables
3. IF either S3 object is missing, inaccessible, or not valid JSON, THEN the module SHALL return an error identifying which config failed to load
4. THE S3 client SHALL connect to the `us-east-1` region
5. THE S3 bucket name and object keys SHALL be read from environment variables: `S3_BUCKET`, `INTERVIEW_STRUCTURE_KEY`, `INTERVIEW_PROFILE_KEY`
6. THE module SHALL NOT retry failed S3 loads — the frontend can retry the full request

### Requirement 3: Assemble Runtime Context

**User Story:** As a system, I want to combine the Analyst output with S3 configs into a single runtime context string, so the frontend can pass it directly to Nova Sonic as the system instruction.

#### Acceptance Criteria

1. THE module SHALL produce a runtime context string combining:
   - The full analyst_output (as-is, JSON-serialized)
   - The interview structure (what to ask: topics, points, follow-up guidance)
   - The interview profile (how to behave: tone, style, rules, experience types)
   - Behavioral instructions for Nova Sonic
2. THE behavioral instructions SHALL include:
   - Ask one question at a time (no compound questions)
   - Keep questions concise and use clear language
   - Follow the tone specified by the interview profile
   - Accept all experience types listed in the interview profile
   - Do not invent details not present in the candidate data
   - Do not give feedback or score answers during the interview
   - Stop gracefully when the session ends
3. THE runtime context SHALL be a single string suitable for use as Nova Sonic's system instruction
4. GIVEN the same analyst_output and the same S3 config contents, the module SHALL produce the same runtime_context every time (idempotent)

### Requirement 4: Lambda Entry Point

**User Story:** As a deployer, I want the handler to support both direct invocation and Function URL modes.

#### Acceptance Criteria

1. THE handler SHALL support two invocation modes:
   - **Function URL**: `event` contains a `body` key with a JSON string → parse `event['body']`
   - **Direct invocation**: `event` IS the payload dict → use it directly
2. IF `event` contains a `body` key that is not valid JSON, THEN return `statusCode: 400`
3. ON success, return `statusCode: 200` with the runtime context
4. ON unhandled exception, return `statusCode: 500` with an error message
5. THE handler SHALL NOT set CORS headers (CORS is configured on the Function URL, not in code)

### Requirement 5: Response Shape

**User Story:** As the frontend, I want a predictable response format so I can reliably extract the runtime context or handle errors.

#### Acceptance Criteria

1. ALL responses SHALL have this outer shape:
   ```json
   {"statusCode": <int>, "body": "<JSON string>"}
   ```
2. ON SUCCESS, the `body` JSON SHALL contain:
   ```json
   {"success": true, "runtime_context": "<assembled context string>"}
   ```
3. ON ERROR, the `body` JSON SHALL contain:
   ```json
   {"success": false, "error_message": "<human-readable description>"}
   ```
4. Validation/config errors use `statusCode: 200` (the HTTP request was well-formed, the error is semantic)
5. Malformed body uses `statusCode: 400`
6. Unhandled exceptions use `statusCode: 500`

### Requirement 6: Error Handling

**User Story:** As a developer, I want clear error messages so failures can be diagnosed quickly.

#### Acceptance Criteria

1. IF analyst_output is missing/empty → error message: `"analyst_output is required and must be a non-empty object"`
2. IF S3 interview_structure fails → error message includes the string `"interview_structure"`
3. IF S3 interview_profile fails → error message includes the string `"interview_profile"`
4. IF event body is not valid JSON → error message: `"Request body is not valid JSON"`
5. ALL error responses SHALL have `success: false` and a non-empty `error_message`
6. NO error path may return a bare exception string or empty body
