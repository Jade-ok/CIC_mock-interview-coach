# Frontend–Backend Wiring Status

> Current-state guide. Last verified: 2026-08-07. This document distinguishes implemented pieces from integration work that remains.

## Target Deployment Topology

```text
React/Vite browser on AWS Amplify Hosting
  ├─ HTTPS ─> PDF Parser / Analyst / Interviewer / Evaluator Lambdas
  └─ authenticated WSS ─> Amazon Bedrock AgentCore Runtime
                               └─ Python voice relay ─> Nova 2 Sonic

CDK ─> four Lambdas + S3 interview configuration
```

The four Lambdas and S3 configuration bucket are deployed by CDK. The React build is intended to be hosted by Amplify Hosting. The AgentCore voice relay is deployed separately from `backend/voice_agent/` because it needs a persistent bidirectional stream that is not a good fit for a Lambda invocation.

AgentCore is serverless infrastructure from the application's perspective: it runs the relay as an AWS-managed container runtime, so this project does not provision or maintain an EC2 server. The relay can hold transient state for each active WebSocket session; durable interview state remains outside it.

## What Exists Today

- The CDK stack defines the four Lambda Function URLs and S3 configuration bucket.
- The Python relay runs locally and is configured for deployment with AWS's current `@aws/agentcore` CLI. A development runtime is deployed with AWS IAM authorization, and its signed WebSocket handshake is verified.
- The React frontend, HTTP clients, mock WebSocket path, and interview UI exist.
- Amplify Hosting resources/configuration and frontend authentication are not yet implemented.
- The current Function URLs use public `NONE` authentication and wildcard CORS; they must not be described as protected production APIs.
- The frontend/relay wire protocol is aligned and unit-tested; a live Nova session remains unverified.

## Frontend Environment

The current HTTP clients read:

```env
VITE_PDF_PARSER_URL=https://...
VITE_ANALYST_URL=https://...
VITE_INTERVIEWER_URL=https://...
VITE_EVALUATOR_URL=https://...
```

CDK prints the corresponding `PdfParserUrl`, `AnalystUrl`, `InterviewerUrl`, and `EvaluatorUrl` outputs. Trim copied values. `WaitingRoom.tsx` reads the voice endpoint from `VITE_VOICE_WS_URL` and falls back to `ws://localhost:8080/`; set `VITE_USE_MOCK_WEBSOCKET=true` only when the mock is intentional.

The target Amplify build also needs an environment-driven secure WebSocket URL and authentication configuration. Exact variable names should be documented once the implementation selects its Amplify Auth/Cognito and AgentCore authorization flow; do not put permanent AWS credentials in Vite variables because `VITE_*` values are bundled into browser code.

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

For deployment, the browser-to-AgentCore connection must be authenticated with short-lived user credentials or tokens. Amplify Hosting only serves the frontend build; it does not make the WebSocket authenticated by itself. Add Amplify Auth/Cognito (or another AgentCore-supported authorization configuration), validate authorization at the runtime boundary, and never expose long-lived AWS access keys in the browser.

## Current Frontend Flow

- Upload, waiting-room, interview, audio, text-input, reconnect, and feedback-state components exist.
- The real relay is the default. Set `VITE_USE_MOCK_WEBSOCKET=true` to opt into `MockWebSocketClient`.
- `FeedbackScreen` renders successful Evaluator results through the typed `FeedbackReport` after runtime response validation.
- The submitted PDF/JD and complete Analyst output are retained in active session state for downstream calls.

Do not describe the flow as end-to-end complete until it passes a live browser/Nova session and the deployment/authentication work below is complete.

## Verification Checklist

- [x] Frontend and backend both enforce a 4 MB PDF limit.
- [x] Interviewer response is parsed using `success` and `runtime_context`.
- [x] Full Analyst output remains available through the interview.
- [x] Evaluator request matches `schemas/interviewer_output.json`.
- [x] Evaluator response is treated as the returned object, not `{status, data}`.
- [x] AgentCore endpoint is configurable through `VITE_VOICE_WS_URL`.
- [ ] React production build and environment variables are configured in Amplify Hosting.
- [ ] Browser identity and AgentCore WebSocket authorization are implemented with short-lived credentials/tokens.
- [x] Frontend and relay share one WebSocket wire protocol with focused unit coverage.
- [ ] Public Function URLs are protected or placed behind an authenticated API boundary before a public launch.
- [ ] Real browser flow passes Upload → Waiting → Interview → Feedback.
