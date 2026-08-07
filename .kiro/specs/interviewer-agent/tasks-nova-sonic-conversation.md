# Tracker: Nova Sonic Conversation Runtime

> Active tracker. Last verified: 2026-08-07. Checkmarks describe repository implementation, not successful deployment to an AWS account.

## Implemented Backend

- [x] Create the AgentCore container project under `backend/voice_agent/`.
- [x] Add Nova event factories in `s2s_events.py`.
- [x] Add bidirectional session management and audio-queue primitives in `s2s_session_manager.py`.
- [x] Add the FastAPI health endpoint and WebSocket relay in `server.py`.
- [x] Configure `amazon.nova-2-sonic-v1:0` in `us-east-1`.
- [x] Add the Dockerfile, Python dependencies, and `.bedrock_agentcore.yaml`.
- [x] Forward raw Nova events between the browser socket and Nova stream.

## Implemented Frontend Pieces

- [x] Add a WebSocket client abstraction with reconnection support.
- [x] Add microphone capture and audio playback services.
- [x] Add interview UI, text input, manual end flow, and transcript state.

## Remaining Integration Work

- [ ] Choose the canonical browser/relay wire protocol.
- [ ] Route audio events through `send_audio_chunk()`; `server.py` currently sends audio directly through `send_event()`, so the queue is not wired into the relay path.
- [ ] Either translate frontend `{type, payload}` messages in the relay or change the frontend to raw Nova `{event: ...}` messages.
- [ ] Define session-start acknowledgment behavior consistently; the relay does not currently emit `session_start_ack`.
- [ ] Verify one complete browser session: start, context injection, user audio, Nova audio/text, transcript capture, and session end.
- [ ] Verify interruption/barge-in behavior through the actual relay.
- [ ] Verify text fallback through the selected protocol.
- [ ] Add integration tests using a mock WebSocket/Nova stream.

## Deployment Verification

- [ ] Build the container from `backend/voice_agent/`.
- [ ] Deploy with the AgentCore CLI from `backend/voice_agent/`.
- [ ] Configure authentication for browser-to-AgentCore access and document the chosen token/identity flow.
- [ ] Record the authenticated `wss://` relay endpoint in the Amplify frontend environment configuration.
- [ ] Verify `/health` and an authenticated WebSocket connection in the target AWS environment.
- [ ] Confirm the deployed browser has no long-lived AWS credentials and no direct Bedrock Nova invocation path.

## Evaluator Handoff

- [ ] Retain the complete `analyst_output` in frontend state.
- [ ] Map transcript entries to `schemas/interviewer_output.json` conversation turns.
- [ ] Populate interview metadata and submit the canonical Evaluator request.
