# Design: Interviewer and Voice Runtime

> Maintained design. Last verified: 2026-08-08. This replaces direct browser-to-Bedrock access. Amplify hosting and short-lived signed browser-to-AgentCore WSS are deployed parts of the hosted architecture.

## Overview

The interview capability has two backend components:

1. The Interviewer Lambda builds a Nova runtime-context string from Analyst output and two S3 configuration objects.
2. The AgentCore-hosted voice relay owns the transient bidirectional connection to Amazon Nova 2 Sonic. AgentCore is an AWS-managed serverless container runtime; it is not an application server or EC2 instance that the project operates.

The browser retains UI state and transcript data. No persistent interview session database is used.

## Target Architecture and Current Status

```text
React browser client on Amplify Hosting
  ├─ POST analyst_output ──> Interviewer Function URL
  │                           └─ reads interview configs from S3
  │<─ {success, runtime_context}
  │
  ├─ POST voice session ────> Voice Session Lambda
  │<─ five-minute signed WSS URL
  ├─ signed WSS ────────────> AgentCore serverless voice relay
  │                            └─ bidirectional stream to Nova 2 Sonic
  │<─ audio/text Nova events
  │
  └─ POST evaluator input ──> Evaluator Function URL
```

There is no direct browser-to-Bedrock connection. The Voice Session Lambda signs five-minute AgentCore URLs with its resource-scoped execution role, allowing the public browser to connect without storing AWS credentials or requiring an end-user login. The React client, relay container, Lambdas, S3 configuration, CDK backend stack, and Amplify-hosted path are deployed; account-specific identifiers remain environment configuration.

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
- `agentcore/agentcore.json` defines the current CLI/CDK project. `agentcore/aws-targets.example.json` documents the shape of ignored environment-specific target data. `.bedrock_agentcore.yaml` is ignored legacy Starter Toolkit configuration and is not canonical.
- `Dockerfile` packages the relay.

The relay accepts the frontend's `{type, payload}` messages, owns Nova prompt/content identifiers and lifecycle sequencing, emits `session_start_ack`, sends audio through the bounded queue, and translates Nova output into the frontend event union. The adapter is covered by focused unit tests and the hosted browser/Nova path has been exercised. Real reconnection and session-restoration edge cases remain targeted verification work.

The hosted boundary is browser → Voice Session Lambda → signed `wss://` → AgentCore relay → Nova. The browser must not receive long-lived AWS credentials or invoke Nova directly.

AgentCore sets `HOSTED_GUARDRAILS_ENABLED=true`, which applies an eight-minute application limit to hosted voice sessions. The combined local server explicitly sets that flag to `false`, so a stale shell value cannot enable the hosted duration limit locally. The Voice Session Lambda itself is covered by hosted alarm/budget controls and the emergency shutdown switch; its optional normal concurrency cap defaults off until the target account quota supports it.

## Nova Configuration

| Setting | Value |
|---|---|
| Region | `us-east-1` |
| Model | `amazon.nova-2-sonic-v1:0` |
| Input audio | 16 kHz, 16-bit, mono LPCM |
| Output audio | 24 kHz, 16-bit, mono LPCM |

The context builder instructs Nova to conduct three main questions with one adaptive follow-up per main question, stay concise and supportive, accept student-level experience, avoid scoring during the interview, and stop gracefully. This is prompt-driven behavior; application state does not enforce every follow-up.

## Hosted Architecture

- Amplify Hosting serves the React/Vite static frontend.
- CDK defines four pipeline Lambdas, the Voice Session Lambda, and S3 configuration.
- AgentCore runs the managed serverless voice relay as a separate infrastructure boundary.
- Hosted environment values supply the five HTTPS Lambda endpoints; no account-specific endpoint is hard-coded.

## Remaining Verification Gaps

The frontend requests `VITE_API_BASE_URL/voice-session`, receives a fresh five-minute signed URL for connection and reconnection, and uses the real relay by default; `VITE_USE_MOCK_WEBSOCKET=true` explicitly enables the mock. Continue targeted verification of reconnect exhaustion, expired sessions, and transcript preservation across reconnects.
