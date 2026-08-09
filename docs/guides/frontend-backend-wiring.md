# Frontend–Backend Wiring Status

> Current-state guide. Last verified: 2026-08-07. This document distinguishes implemented pieces from integration work that remains.

## Hosted Architecture

```text
React/Vite browser on AWS Amplify Hosting
  ├─ HTTPS ─> PDF Parser / Analyst / Interviewer / Evaluator Lambdas
  └─ HTTPS ─> Voice Session Lambda ─> short-lived signed WSS
                                      └─ Amazon Bedrock AgentCore Runtime
                               └─ Python voice relay ─> Nova 2 Sonic

CDK ─> five Lambdas + S3 interview configuration
```

CDK defines the four pipeline Lambdas, the voice-session signer Lambda, and the S3 configuration bucket. Amplify Hosting serves the React build, while AgentCore runs the voice relay as a separate infrastructure boundary because the persistent bidirectional stream is not a good fit for a Lambda invocation.

The hosted architecture places Amplify, AgentCore, Lambda, S3, and Bedrock access in one AWS account. Account-specific identifiers and generated deployment state do not belong in version control.

AgentCore is serverless infrastructure from the application's perspective: it runs the relay as an AWS-managed container runtime, so this project does not provision or maintain an EC2 server. The relay can hold transient state for each active WebSocket session; durable interview state remains outside it.

## What Exists Today

- The CDK stack defines five Lambda Function URLs and an S3 configuration bucket.
- The Python relay runs locally and is configured for deployment with AWS's current `@aws/agentcore` CLI. Hosted runtime state and verification are environment-specific and are not tracked in this repository.
- The React frontend, HTTP clients, mock WebSocket path, and interview UI exist.
- `amplify.yml` defines the Amplify monorepo build. Environment-specific hosting state is not tracked in the repository.
- The current Function URLs use public `NONE` authentication and wildcard CORS; they must not be described as protected production APIs.
- The frontend/relay wire protocol is aligned and unit-tested; a live Nova session remains unverified.

## Runtime Modes

Local mode is the default. It always uses:

```env
http://localhost:8080/api/pdf-parser
http://localhost:8080/api/analyst
http://localhost:8080/api/interviewer
http://localhost:8080/api/evaluator
ws://localhost:8080/
```

Hosted mode reads `VITE_PDF_PARSER_URL`, `VITE_ANALYST_URL`, `VITE_INTERVIEWER_URL`, `VITE_EVALUATOR_URL`, and `VITE_VOICE_SESSION_URL` from its environment. The voice-session endpoint returns a fresh five-minute signed AgentCore WebSocket URL for each connection attempt.

### Local development workflow

Local testing requires AWS credentials with GPT OSS 120B and Nova 2 Sonic access. Configure either `AWS_PROFILE` or environment-based access keys, confirm the identity with `aws sts get-caller-identity`, and start `backend.local_server:app`. PDF parsing and interview configuration remain local; Analyst, Evaluator, and Nova calls use the displayed AWS identity.

Local mode runs the application services on the development machine. Bedrock model requests are authenticated with the active AWS identity shown by `aws sts get-caller-identity`. Never commit account identifiers or credentials.

The hosted Amplify build requests a short-lived signed WebSocket URL from the voice-session Lambda. Permanent AWS credentials are never Vite variables because `VITE_*` values are bundled into browser code.

## Implemented HTTP Pipeline

The current frontend client is `frontend/src/services/agent1Client.ts`.

### PDF Parser

Request:

```json
{
  "resume": {"content": "<base64>", "format": "pdf"},
  "job_posting": {"content": "<text>", "format": "text"}
}
```

Response envelope: `{"status": "success", "data": {...}}` or `{"status": "error", "error": "..."}`.

The frontend and backend both enforce a 4 MB PDF limit so oversized files are rejected before upload.

### Analyst

Request: `{"resume_text": "...", "job_posting_text": "..."}`.

Response envelope: `{"status": "success", "data": <analyst_output>}` or an error envelope. The output shape is defined by `schemas/analyst_output.json`.

### Interviewer

Request: `{"analyst_output": {...}}`.

Actual response body: `{"success": true, "runtime_context": "..."}` or `{"success": false, "error_message": "..."}`.

The frontend parses this Interviewer-specific envelope and retains the returned runtime context.

### Evaluator

Canonical completed-interview request shape (`schemas/interviewer_output.json`):

```json
{
  "conversation": [
    {
      "point_id": "point_1",
      "turn_type": "main_question",
      "question": "...",
      "answer": "..."
    }
  ],
  "interview_metadata": {},
  "analyst_output": {}
}
```

The Evaluator returns the feedback object directly in the Function URL body; it does not wrap success as `{status, data}`.

The frontend retains the full Analyst output, pairs the final transcript into question-answer turns, sends this canonical request, and consumes the direct feedback body.

## Voice Integration and Authentication

The implemented backend voice path is:

```text
Browser WebSocket → AgentCore FastAPI relay → Nova 2 Sonic
```

The frontend and relay share application messages shaped as `{type, payload}`. `backend/voice_agent/protocol.py` expands those messages into the Nova event lifecycle, owns Nova identifiers, emits `session_start_ack`, and translates Nova responses back into browser audio/text/tool/interruption events. Focused contract tests cover setup, audio, text, shutdown, transcript stages, output audio, interruption, credential resolution, and the FastAPI endpoint with a fake Nova manager. A live browser/Nova session remains pending.

In the hosted architecture, the public browser requests a short-lived signed AgentCore URL from the voice-session Lambda. AgentCore verifies the Lambda role's SigV4 signature during the WebSocket handshake, and long-lived AWS access keys never belong in the browser.

## Current Frontend Flow

- Upload, waiting-room, interview, audio, text-input, reconnect, and feedback-state components exist.
- The real relay is the default. Set `VITE_USE_MOCK_WEBSOCKET=true` to opt into `MockWebSocketClient`.
- `FeedbackScreen` renders successful Evaluator results through the typed `FeedbackReport` after runtime response validation.
- The submitted PDF/JD and complete Analyst output are retained in active session state for downstream calls.

The hosted flow requires live browser/Nova and authentication verification in its target environment.

## Verification Checklist

- [x] Frontend and backend both enforce a 4 MB PDF limit.
- [x] Interviewer response is parsed using `success` and `runtime_context`.
- [x] Full Analyst output remains available through the interview.
- [x] Evaluator request matches `schemas/interviewer_output.json`.
- [x] Evaluator response is treated as the returned object, not `{status, data}`.
- [x] Hosted voice sessions request fresh signed URLs through `VITE_VOICE_SESSION_URL`.
- [x] Frontend and relay share one WebSocket wire protocol with focused unit coverage.
- [ ] Real browser flow passes Upload → Waiting → Interview → Feedback.
