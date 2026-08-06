# Requirements: Interviewer Module

## Introduction

The Interviewer module has two components:

1. **Interviewer Lambda** — A stateless Python 3.12 Lambda that builds a runtime context for Nova Sonic. It receives the Analyst output, loads two S3 config files, combines them into a system instruction string, and returns it to the frontend.

2. **Voice Agent Server** — A Python WebSocket server deployed on Bedrock AgentCore Runtime. It acts as a managed relay between the browser and Nova Sonic, proxying bidirectional audio and events. The frontend connects to AgentCore's SigV4-authenticated WebSocket endpoint.

Neither component conducts the interview directly — Nova Sonic does. The Lambda builds the instruction, the server relays the audio, and Nova Sonic generates questions and understands answers.

## Scope Boundaries

**Interviewer Lambda does:**
- Accept Analyst output from the frontend
- Load interview configs from S3
- Assemble and return a runtime context string

**Voice Agent Server does:**
- Accept WebSocket connections from the frontend (via AgentCore Runtime)
- Open a bidirectional stream to Nova Sonic
- Relay all events between the frontend and Nova Sonic
- Handle large event splitting and backpressure

**Neither component does:**
- Score or evaluate answers
- Call any text LLM (Bedrock Converse API)
- Track session state (frontend owns this)
- Communicate with the Evaluator

## Glossary

| Term | Definition |
|------|------------|
| **Analyst Output** | Structured JSON from the Analyst Lambda. Schema: `schemas/analyst_output.json` |
| **Interview Structure** | S3 JSON config defining what the interview covers. File: `interview_structure.json` |
| **Interview Profile** | S3 JSON config defining how the interviewer behaves. File: `student_interview_profile.json` |
| **Runtime Context** | Combined string returned to the frontend. Becomes Nova Sonic's system instruction. |
| **Voice Agent Server** | Python WebSocket server on AgentCore Runtime that relays events between browser and Nova Sonic |
| **AgentCore Runtime** | AWS managed service that handles WebSocket proxy, scaling, and SigV4 auth for AI agents |
| **Nova Sonic** | Amazon Nova 2 Sonic (`amazon.nova-2-sonic-v1:0`) — speech-to-speech model |

## Infrastructure Context

| Resource | Value |
|----------|-------|
| Region | `us-east-1` |
| S3 Bucket | `cic-mock-interview-configs-002859476624` |
| Structure Key | `interview_structure.json` |
| Profile Key | `student_interview_profile.json` |
| Lambda Runtime | Python 3.12 |
| Lambda Invocation | Function URL (no API Gateway) |
| Voice Server | Python (FastAPI), Docker container on AgentCore Runtime |
| Nova Sonic Model | `amazon.nova-2-sonic-v1:0` |
| Voice WebSocket | AgentCore Runtime managed endpoint (SigV4 auth) |

## Requirements: Interviewer Lambda

### Requirement 1: Accept Analyst Output

**User Story:** As the frontend, I send the Analyst output to the Interviewer Lambda so that the runtime context includes all candidate-specific information for Nova Sonic.

#### Acceptance Criteria

1. THE module SHALL accept a JSON payload containing an `analyst_output` field
2. THE `analyst_output` field SHALL conform to the schema defined in `schemas/analyst_output.json`
3. THE module SHALL NOT modify, filter, or transform the analyst_output — it is included in the runtime context as-is
4. IF `analyst_output` is missing, empty, or not a dict, THEN the module SHALL return an error immediately without attempting S3 loads
5. THE module SHALL validate presence only — it does not validate schema conformance of the analyst_output

### Requirement 2: Load S3 Configuration

**User Story:** As a system, I want interview structure and profile loaded from S3 so that interview format and behavior can be changed without redeploying.

#### Acceptance Criteria

1. WHEN invoked, the module SHALL load the interview structure JSON from S3 using env vars
2. WHEN invoked, the module SHALL load the interview profile JSON from S3 using env vars
3. IF either S3 object is missing, inaccessible, or not valid JSON, THEN return an error identifying which config failed
4. THE S3 client SHALL connect to `us-east-1`
5. THE S3 bucket and keys SHALL be read from: `S3_BUCKET`, `INTERVIEW_STRUCTURE_KEY`, `INTERVIEW_PROFILE_KEY`
6. THE module SHALL NOT retry failed S3 loads

### Requirement 3: Assemble Runtime Context

**User Story:** As a system, I want to combine the Analyst output with S3 configs into a runtime context string for Nova Sonic.

#### Acceptance Criteria

1. THE module SHALL produce a runtime context string combining:
   - The full analyst_output (JSON-serialized, unchanged)
   - The interview structure
   - The interview profile
   - Behavioral instructions for Nova Sonic
2. THE behavioral instructions SHALL include:
   - Ask one question at a time
   - Keep questions concise and use clear language
   - Follow the tone from the interview profile
   - Accept all experience types listed in the profile
   - Do not invent details not present in the candidate data
   - Do not give feedback or score answers during the interview
   - Stop gracefully when the session ends
3. THE output SHALL be deterministic (same input → same output)

### Requirement 4: Lambda Entry Point

#### Acceptance Criteria

1. Support two modes: Function URL (`event['body']` JSON string) and direct invocation (event = payload)
2. Invalid JSON body → `statusCode: 400`
3. Success → `statusCode: 200` with runtime_context
4. Unhandled exception → `statusCode: 500`
5. No CORS headers in code (configured on Function URL)

### Requirement 5: Response Shape

#### Acceptance Criteria

1. All responses: `{"statusCode": int, "body": "<JSON string>"}`
2. Success body: `{"success": true, "runtime_context": "<string>"}`
3. Error body: `{"success": false, "error_message": "<string>"}`
4. Validation/config errors → statusCode 200
5. Malformed body → statusCode 400
6. Unhandled exceptions → statusCode 500

### Requirement 6: Error Messages

#### Acceptance Criteria

1. Missing analyst_output → `"analyst_output is required and must be a non-empty object"`
2. S3 structure fails → message includes `"interview_structure"`
3. S3 profile fails → message includes `"interview_profile"`
4. Invalid JSON body → `"Request body is not valid JSON"`

## Requirements: Voice Agent Server

### Requirement 7: WebSocket Relay

**User Story:** As the frontend, I connect to AgentCore Runtime's WebSocket endpoint and communicate with Nova Sonic through the voice agent server.

#### Acceptance Criteria

1. THE server SHALL accept WebSocket connections from AgentCore Runtime
2. THE server SHALL open a bidirectional stream to Nova Sonic (`amazon.nova-2-sonic-v1:0`) for each client connection
3. THE server SHALL relay all client events to Nova Sonic without modification
4. THE server SHALL relay all Nova Sonic responses back to the client
5. THE server SHALL split large events (>10KB) at base64 boundaries before forwarding to the client
6. THE server SHALL handle audio backpressure by queuing input chunks (max 100, drop oldest if full)

### Requirement 8: Session Lifecycle

#### Acceptance Criteria

1. ON client connect: open bidirectional stream to Nova Sonic
2. ON client disconnect: close the Nova Sonic stream
3. ON Nova Sonic stream close (8-min timeout): notify client and close WebSocket
4. THE server SHALL NOT store any session state beyond the current connection
5. Credentials SHALL be provided by AgentCore Runtime's IAM role (no manual credential management)

### Requirement 9: Event Protocol Transparency

#### Acceptance Criteria

1. THE server SHALL forward the Nova Sonic event protocol without interpreting or modifying event content
2. THE server SHALL support all Nova Sonic events: sessionStart, promptStart, contentStart, textInput, audioInput, contentEnd, promptEnd, sessionEnd
3. THE server SHALL forward all response events: audioOutput, textOutput, contentStart/End with role metadata
4. THE server is a transparent relay — all intelligence is in Nova Sonic (driven by the runtime_context system instruction)

### Requirement 10: Deployment on AgentCore Runtime

#### Acceptance Criteria

1. THE server SHALL be packaged as a Docker container
2. THE container SHALL run a FastAPI application with a WebSocket endpoint
3. THE container SHALL be deployable via the `bedrock-agentcore-starter-toolkit`
4. AgentCore Runtime SHALL handle: scaling, SigV4 authentication, WebSocket proxy, IAM roles
5. THE frontend SHALL connect to AgentCore's managed WebSocket endpoint (not directly to the server)
