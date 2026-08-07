# Design: Interviewer and Voice Runtime

> Maintained design. Last verified: 2026-08-07. This replaces the retired Cognito/direct-Bedrock and signing-Lambda designs.

## Overview

The interview capability has two backend components:

1. The Interviewer Lambda builds a Nova runtime-context string from Analyst output and two S3 configuration objects.
2. The AgentCore-hosted voice relay owns the transient bidirectional connection to Amazon Nova 2 Sonic.

The browser retains UI state and transcript data. No persistent interview session database is used.

## Current Architecture

```text
Browser
  ├─ POST analyst_output ──> Interviewer Function URL
  │                           └─ reads interview configs from S3
  │<─ {success, runtime_context}
  │
  ├─ WebSocket ─────────────> AgentCore voice relay
  │                            └─ bidirectional stream to Nova 2 Sonic
  │<─ audio/text Nova events
  │
  └─ POST evaluator input ──> Evaluator Function URL
```

There is no signing Lambda, Cognito identity pool, or direct browser-to-Bedrock connection in the current repository.

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
- `s2s_session_manager.py` owns the Nova bidirectional stream and transient queues.
- `s2s_events.py` builds Nova protocol events.
- `.bedrock_agentcore.yaml` stores AgentCore deployment configuration.
- `Dockerfile` packages the relay.

The relay currently forwards raw Nova event JSON. It does not translate the wire format into the frontend's `{type, payload}` abstraction and does not create a synthetic `session_start_ack`.

## Nova Configuration

| Setting | Value |
|---|---|
| Region | `us-east-1` |
| Model | `amazon.nova-2-sonic-v1:0` |
| Input audio | 16 kHz, 16-bit, mono LPCM |
| Output audio | 24 kHz, 16-bit, mono LPCM |

The context builder instructs Nova to conduct three main questions with one adaptive follow-up per main question, stay concise and supportive, accept student-level experience, avoid scoring during the interview, and stop gracefully.

## Deployment

- CDK deploys the Interviewer Lambda and S3 configuration.
- Run AgentCore deployment from `backend/voice_agent/`.
- `scripts/deploy.sh` is a targeted/manual Interviewer + voice workflow, not the canonical deployment for all Lambdas.

## Known Integration Gap

The current frontend WebSocket client emits and expects app-level `{type, payload}` messages, while the relay accepts and returns raw Nova `{event: ...}` messages. End-to-end voice integration requires one side to implement an adapter. This document describes the implemented relay behavior, not a claim that the full browser flow is complete.
