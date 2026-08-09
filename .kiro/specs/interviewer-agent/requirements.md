# Requirements: Interviewer and Voice Runtime

> Maintained requirements. Last verified: 2026-08-09. Direct browser-to-Bedrock access is retired. Amplify hosting and short-lived signed browser-to-AgentCore WSS are hosted-environment requirements.

## Interviewer Lambda

### R1. Accept Analyst Output

1. Accept a payload containing a non-empty dictionary under `analyst_output`.
2. Preserve the Analyst output when embedding it in the runtime context.
3. Reject a missing, empty, or non-dictionary Analyst output with a descriptive error.
4. Validate presence and basic type only; the Analyst owns contract conformance.

### R2. Load Configuration

1. Read the S3 bucket and object keys from `S3_BUCKET`, `INTERVIEW_STRUCTURE_KEY`, and `INTERVIEW_PROFILE_KEY`.
2. Load and parse both JSON objects.
3. Identify the failed configuration in missing-object or invalid-JSON errors.
4. Use `us-east-1` unless explicitly configured otherwise.

### R3. Build Runtime Context

1. Combine Analyst output, interview structure, interview profile, and behavioral instructions into one deterministic string.
2. Instruct Nova to speak first, ask one concise question at a time, use the configured tone, accept student experiences, avoid inventing details, avoid feedback/scoring, transition clearly, and stop gracefully.
3. Prompt Nova to ask three main questions with one adaptive follow-up per main question; application state does not currently guarantee model compliance with this sequence.

### R4. Lambda Interface

1. Support direct payloads and Function URL bodies.
2. Return HTTP 400 for malformed JSON.
3. Return a success body shaped as `{"success": true, "runtime_context": "..."}`.
4. Return errors with `success: false` and `error_message`.
5. Leave CORS to the CDK Function URL configuration.

## AgentCore Voice Relay

### R5. Runtime and Model

1. Run as the containerized FastAPI service in `backend/voice_agent/`.
2. Open the Nova bidirectional stream with `amazon.nova-2-sonic-v1:0` in `us-east-1`.
3. Hold only transient connection/session state.
4. Close Nova resources when the browser disconnects or ends the session.
5. Run on the AWS-managed serverless AgentCore Runtime; no project-managed EC2 instance or always-on application server is required.

### R6. Streaming

1. Accept browser WebSocket messages and forward valid Nova protocol events.
2. Queue audio input to provide backpressure.
3. Forward Nova audio, text, tool, content-end, and completion events to the browser.
4. Use 16 kHz mono LPCM input and 24 kHz mono LPCM output.

Current implementation: `server.py` forwards browser audio through `send_audio_chunk()`, and the session manager drains the bounded queue into the Nova stream.

### R7. Integration Contract

1. The frontend and relay share the canonical application-level `{type, payload}` protocol.
2. The relay must own Nova-specific prompt/content identifiers and event ordering rather than exposing them to the browser.
3. The adapter must translate session, audio, text, transcript, tool-use, interruption, and completion events; the hosted path is deployed, while reconnection and session-restoration edge cases remain explicit verification requirements.

### R8. Hosted Access Boundary

1. Host the production React/Vite client on AWS Amplify Hosting.
2. Create five-minute SigV4-signed `wss://` URLs through a Lambda role scoped to the configured AgentCore runtime.
3. Do not expose long-lived AWS credentials or direct Bedrock Nova invocation permissions to browser code.
4. Supply one CloudFront API base URL through hosted environment configuration; its routes target private IAM-protected Function URLs through OAC.
5. The application intentionally has no end-user login; hosted operation must use invocation/error/throttle alarms, an AWS cost budget, an emergency shutdown switch, and targeted browser verification. Optional normal concurrency caps depend on the target account quota.
6. Hosted Nova sessions must have an eight-minute application limit. Pure local voice sessions must not enable that hosted limit.
7. Hosted voice-session requests must require the current opaque interview token, verify its trusted viewer-IP binding and expiry, and allow no more than three signed-URL attempts per admitted interview.
8. Hosted admission must default to 100 interviews globally and 5 per trusted viewer IP per UTC day. Pure local voice operation must bypass this hosted admission layer.

## Evaluator Handoff

After the interview, the client must retain the complete Analyst output and transform the transcript into `schemas/interviewer_output.json`, including `conversation`, `interview_metadata`, and `analyst_output`.
