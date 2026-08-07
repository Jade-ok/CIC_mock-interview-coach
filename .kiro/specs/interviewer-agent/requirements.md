# Requirements: Interviewer Module

## Introduction

The Interviewer module has two Lambdas:

1. **Interviewer Lambda** — Builds a runtime context for Nova Sonic from the Analyst output + S3 configs. Returns it to the frontend.
2. **Signing Lambda** — Generates a presigned WebSocket URL so the frontend can connect directly to Nova Sonic without exposing AWS credentials.

The frontend connects to Nova Sonic directly using the presigned URL. There is no proxy server, no container, no AgentCore.

## Scope Boundaries

**Interviewer Lambda does:**
- Accept Analyst output from the frontend
- Load interview configs from S3
- Assemble and return a runtime context string

**Signing Lambda does:**
- Generate a SigV4-presigned WebSocket URL for Nova Sonic
- Return the URL to the frontend

**Neither component does:**
- Conduct the interview (Nova Sonic does this, connected directly from the browser)
- Score or evaluate answers
- Track session state

## Glossary

| Term | Definition |
|------|------------|
| **Analyst Output** | Structured JSON from the Analyst Lambda. Schema: `schemas/analyst_output.json` |
| **Interview Structure** | S3 JSON config defining what the interview covers. File: `interview_structure.json` |
| **Interview Profile** | S3 JSON config defining how the interviewer behaves. File: `student_interview_profile.json` |
| **Runtime Context** | Combined string returned to the frontend. Becomes Nova Sonic's system instruction. |
| **Presigned URL** | A time-limited SigV4-signed WebSocket URL that the frontend uses to connect to Nova Sonic |
| **Nova Sonic** | Amazon Nova 2 Sonic (`amazon.nova-2-sonic-v1:0`) — speech-to-speech model |

## Infrastructure

| Resource | Value |
|----------|-------|
| Region | `us-east-1` |
| S3 Bucket | `cic-mock-interview-configs-002859476624` |
| Structure Key | `interview_structure.json` |
| Profile Key | `student_interview_profile.json` |
| Lambda Runtime | Python 3.12 |
| Nova Sonic Model | `amazon.nova-2-sonic-v1:0` |
| Voice Connection | Frontend → Nova Sonic directly via presigned WSS URL |

## Requirements: Interviewer Lambda

### Requirement 1: Accept Analyst Output

#### Acceptance Criteria

1. Accept a JSON payload containing an `analyst_output` field
2. Do NOT modify the analyst_output — include it in the runtime context as-is
3. If `analyst_output` is missing/empty/not a dict → return error immediately
4. Validate presence only — do not validate schema conformance

### Requirement 2: Load S3 Configuration

#### Acceptance Criteria

1. Load interview structure JSON from S3 using env vars
2. Load interview profile JSON from S3 using env vars
3. If either S3 object is missing or not valid JSON → return error identifying which config failed
4. S3 client connects to `us-east-1`
5. No retries on S3 failures

### Requirement 3: Assemble Runtime Context

#### Acceptance Criteria

1. Produce a runtime context string combining: analyst_output, interview structure, interview profile, behavioral instructions
2. Behavioral instructions MUST include:
   - You MUST speak first — greet briefly and ask the first question immediately
   - Keep all questions and responses to 1-2 sentences maximum
   - Ask one question at a time
   - Do not explain or narrate what you are about to do
   - Follow the tone from the interview profile
   - Accept all experience types in the profile
   - Do not invent details not in the candidate data
   - Do not give feedback or score during the interview
   - Signal transitions briefly
   - Stop gracefully when session ends
3. Output is deterministic (same input → same output)

### Requirement 4: Lambda Entry Point

#### Acceptance Criteria

1. Support Function URL (`event['body']`) and direct invocation (event = payload)
2. Invalid JSON body → 400
3. Success → 200 with runtime_context
4. Unhandled exception → 500
5. No CORS headers in code

### Requirement 5: Response Shape

#### Acceptance Criteria

1. Success: `{"statusCode": 200, "body": "{\"success\": true, \"runtime_context\": \"...\"}"}`
2. Error: `{"statusCode": N, "body": "{\"success\": false, \"error_message\": \"...\"}"}`

## Nova Sonic Connection (Frontend Responsibility)

The frontend connects to Nova Sonic using `@aws-sdk/client-bedrock-runtime` with credentials from Cognito Identity Pool (`us-east-1:be3da380-d032-46f4-b4a2-85846a61bc52`). The SDK handles SigV4 WebSocket signing internally. No signing Lambda needed.

### Requirement 6: Cognito Authentication

#### Acceptance Criteria

1. A Cognito Identity Pool provides unauthenticated temporary credentials to the frontend
2. Credentials are scoped to `bedrock:InvokeModel` and `bedrock:InvokeModelWithResponseStream` on the Nova Sonic model
3. No user login is required
4. The frontend uses `fromCognitoIdentityPool()` from `@aws-sdk/credential-providers`
