# Design: Interviewer and Voice Runtime

> Maintained design. Last verified: 2026-08-07. This replaces the retired direct browser-to-Bedrock and signing-Lambda designs. Amplify hosting and authenticated browser-to-AgentCore WSS are the target deployment and remain unimplemented.

## Overview

The interview capability has two backend components:

1. The Interviewer Lambda builds a Nova runtime-context string from Analyst output and two S3 configuration objects.
2. The AgentCore-hosted voice relay owns the transient bidirectional connection to Amazon Nova 2 Sonic. AgentCore is an AWS-managed serverless container runtime; it is not an application server or EC2 instance that the project operates.

The browser retains UI state and transcript data. No persistent interview session database is used.

## Target Architecture and Current Status

```text
React browser client (target: Amplify Hosting)
  ├─ POST analyst_output ──> Interviewer Function URL
  │                           └─ reads interview configs from S3
  │<─ {success, runtime_context}
  │
  ├─ authenticated WSS ─────> AgentCore serverless voice relay
  │                            └─ bidirectional stream to Nova 2 Sonic
  │<─ audio/text Nova events
  │
  └─ POST evaluator input ──> Evaluator Function URL
```

There is no signing Lambda or direct browser-to-Bedrock connection in the current repository. The React client, relay container, Lambdas, S3 configuration, and CDK backend stack exist; Amplify resources, authentication integration, deployment environment values, and a verified authenticated WSS connection do not yet exist. The final identity provider may use Amplify Auth/Cognito, but this document does not claim that choice is implemented.

## Interviewer Lambda

Source: `backend/functions/interviewer/`

```text
handler.py          Function URL/direct-invocation entry point
validation.py       validates analyst_output presence
config_loader.py    loads both JSON objects from S3
context_builder.py  assembles the Nova system context
```

### Input and Output

Input payload: `{"analyst_output": {}}`

Success body: `{"success": true, "runtime_context": "..."}`

Error bodies use `success: false` and `error_message`. This envelope differs from the Analyst and Evaluator envelopes and must be handled explicitly by clients.

### Configuration

CDK creates the bucket, uploads `backend/config/`, grants the Lambda read access, and supplies:

- `S3_BUCKET`
- `INTERVIEW_STRUCTURE_KEY=interview_structure.json`
- `INTERVIEW_PROFILE_KEY=student_interview_profile.json`

Do not document or depend on a generated physical bucket name.

## Voice Relay

Source: `backend/voice_agent/`

- `server.py` exposes the FastAPI/AgentCore entry point and WebSocket relay.
- `protocol.py` translates the browser contract to and from Nova events.
- `s2s_session_manager.py` owns the Nova bidirectional stream and transient queues.
- `s2s_events.py` builds Nova protocol events.
- `.bedrock_agentcore.yaml` stores AgentCore deployment configuration.
- `Dockerfile` packages the relay.

The relay accepts the frontend's `{type, payload}` messages, owns Nova prompt/content identifiers and lifecycle sequencing, emits `session_start_ack`, sends audio through the bounded queue, and translates Nova output into the frontend event union. The adapter is covered by focused unit tests. A live browser session against Nova remains unverified.

The production boundary is browser → authenticated `wss://` → AgentCore relay → Nova. The browser must not receive long-lived AWS credentials or invoke Nova directly.

## Nova Configuration

| Setting | Value |
|---|---|
| Region | `us-east-1` |
| Model | `amazon.nova-2-sonic-v1:0` |
| Input audio | 16 kHz, 16-bit, mono LPCM |
| Output audio | 24 kHz, 16-bit, mono LPCM |

The context builder instructs Nova to conduct three main questions with one adaptive follow-up per main question, stay concise and supportive, accept student-level experience, avoid scoring during the interview, and stop gracefully.

## Deployment

- Amplify Hosting will publish the React/Vite static frontend; this deployment is planned.
- CDK deploys the four backend Lambdas (PDF Parser, Analyst, Interviewer context builder, and Evaluator) plus S3 configuration.
- Run AgentCore deployment from `backend/voice_agent/`; this managed serverless runtime is separate from Amplify Hosting.
- Configure the Amplify build with the deployed HTTPS Lambda endpoints and authenticated AgentCore WSS endpoint; no account-specific endpoint should be hard-coded.
- `scripts/deploy.sh` is a targeted/manual Interviewer + voice workflow, not the canonical deployment for all Lambdas.

## Remaining Integration Gaps

The production AgentCore endpoint and authentication flow are not configured, and the adapter has not completed a live browser/Nova session. The frontend now reads `VITE_VOICE_WS_URL` and uses the real relay by default; `VITE_USE_MOCK_WEBSOCKET=true` explicitly enables the mock.
