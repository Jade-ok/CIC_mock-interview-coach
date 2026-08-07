# Requirements: Interviewer and Voice Runtime

> Maintained requirements. Last verified: 2026-08-07. Cognito, a signing Lambda, and direct browser-to-Bedrock access are out of scope for the current architecture.

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
3. Define three main questions with one adaptive follow-up per main question.

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

### R6. Streaming

1. Accept browser WebSocket messages and forward valid Nova protocol events.
2. Queue audio input to provide backpressure.
3. Forward Nova audio, text, tool, content-end, and completion events to the browser.
4. Use 16 kHz mono LPCM input and 24 kHz mono LPCM output.

Current gap: the queue primitives exist, but `server.py` forwards audio through `send_event()` instead of `send_audio_chunk()`, so requirement 2 is not yet satisfied.

### R7. Integration Contract

1. One canonical WebSocket wire protocol must be shared by frontend and relay.
2. The current relay protocol is raw Nova `{"event": ...}` JSON.
3. The current frontend `{type, payload}` abstraction is not yet adapted to that protocol; this remains an open integration requirement.

## Evaluator Handoff

After the interview, the client must retain the complete Analyst output and transform the transcript into `schemas/interviewer_output.json`, including `conversation`, `interview_metadata`, and `analyst_output`.
