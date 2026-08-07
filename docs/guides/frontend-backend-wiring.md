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
- The Python relay can run locally and has AgentCore deployment configuration.
- The React frontend, HTTP clients, mock WebSocket path, and interview UI exist.
- Amplify Hosting resources/configuration and frontend authentication are not yet implemented.
- The current Function URLs use public `NONE` authentication and wildcard CORS; they must not be described as protected production APIs.
- The frontend/relay wire protocols remain incompatible, as detailed below.

## Frontend Environment

The current HTTP clients read:

```env
VITE_PDF_PARSER_URL=https://...
VITE_ANALYST_URL=https://...
VITE_INTERVIEWER_URL=https://...
VITE_EVALUATOR_URL=https://...
```

CDK prints the corresponding `PdfParserUrl`, `AnalystUrl`, `InterviewerUrl`, and `EvaluatorUrl` outputs. Trim copied values. The voice endpoint is not currently environment-driven: `WaitingRoom.tsx` uses `ws://localhost:8080`, and development mode selects a mock WebSocket client.

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

The backend decoded-content limit is 4 MB. The frontend currently allows 10 MB, so client-side validation is not yet aligned.

### Analyst

Request: `{"resume_text": "...", "job_posting_text": "..."}`.

Response envelope: `{"status": "success", "data": <analyst_output>}` or an error envelope. The output shape is defined by `schemas/analyst_output.json`.

### Interviewer

Request: `{"analyst_output": {...}}`.

Actual response body: `{"success": true, "runtime_context": "..."}` or `{"success": false, "error_message": "..."}`.

The current frontend incorrectly expects the Analyst-style `{status, data}` envelope here. That mismatch must be fixed before the real waiting-room pipeline can complete.

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

The current `agent3Client.ts` instead sends `transcript` and `competency_guides`, expects `{status, data}`, and the current session state does not retain full Analyst output. These are open integration tasks.

## Voice Integration and Authentication

The implemented backend voice path is:

```text
Browser WebSocket → AgentCore FastAPI relay → Nova 2 Sonic
```

The relay forwards raw Nova `{"event": ...}` JSON. The frontend WebSocket client currently sends and expects application messages shaped as `{type, payload}` and waits for a synthetic `session_start_ack` that the relay does not send.

Before connecting the real endpoint, choose one adapter direction:

1. translate app-level messages to/from Nova events in the relay; or
2. change the frontend client to speak raw Nova events.

Then add a contract test covering session start, context injection, one audio turn, transcript output, and session end.

For deployment, the browser-to-AgentCore connection must be authenticated with short-lived user credentials or tokens. Amplify Hosting only serves the frontend build; it does not make the WebSocket authenticated by itself. Add Amplify Auth/Cognito (or another AgentCore-supported authorization configuration), validate authorization at the runtime boundary, and never expose long-lived AWS access keys in the browser.

## Current Frontend Flow

- Upload, waiting-room, interview, audio, text-input, reconnect, and feedback-state components exist.
- Development mode uses `MockWebSocketClient`.
- `FeedbackReport` components exist, but `FeedbackScreen` still renders raw feedback JSON.
- `WaitingRoom` currently falls back to an empty placeholder PDF/JD instead of reliably reading the submitted upload from session state.

Do not describe the flow as end-to-end complete until the HTTP envelopes, Evaluator request, voice wire protocol, and upload handoff above are aligned.

## Verification Checklist

- [ ] Frontend PDF limit matches the backend 4 MB limit.
- [ ] Interviewer response is parsed using `success` and `runtime_context`.
- [ ] Full Analyst output remains available through the interview.
- [ ] Evaluator request matches `schemas/interviewer_output.json`.
- [ ] Evaluator response is treated as the returned object, not `{status, data}`.
- [ ] AgentCore endpoint is configurable outside source code.
- [ ] React production build and environment variables are configured in Amplify Hosting.
- [ ] Browser identity and AgentCore WebSocket authorization are implemented with short-lived credentials/tokens.
- [ ] Frontend and relay share one WebSocket wire protocol.
- [ ] Public Function URLs are protected or placed behind an authenticated API boundary before a public launch.
- [ ] Real browser flow passes Upload → Waiting → Interview → Feedback.
