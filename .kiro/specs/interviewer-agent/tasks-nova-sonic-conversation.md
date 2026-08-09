# Tracker: Nova Sonic Conversation Runtime

> Active tracker. Last verified: 2026-08-08. The relay and hosted browser path are deployed; account-specific runtime identifiers remain environment configuration.

## Implemented Backend

- [x] Create the AgentCore container project under `backend/voice_agent/`.
- [x] Add Nova event factories in `s2s_events.py`.
- [x] Add bidirectional session management and audio-queue primitives in `s2s_session_manager.py`.
- [x] Add the FastAPI health endpoint and WebSocket relay in `server.py`.
- [x] Configure `amazon.nova-2-sonic-v1:0` in `us-east-1`.
- [x] Add the Dockerfile and Python dependencies for the relay.
- [x] Use the current AgentCore CLI/CDK project format instead of the legacy `.bedrock_agentcore.yaml` format.
- [x] Translate the browser `{type, payload}` contract to and from Nova events in `protocol.py`.
- [x] Emit `session_start_ack` after the relay sends the Nova setup sequence.
- [x] Route browser audio through `send_audio_chunk()` and the bounded queue.
- [x] Add focused adapter tests for setup, audio, text, shutdown, transcripts, audio output, interruption, and credentials.

## Implemented Frontend Pieces

- [x] Add a WebSocket client abstraction with reconnection support.
- [x] Add microphone capture and audio playback services.
- [x] Add the microphone-required interview UI, manual end flow, and transcript state.

## Hosted Verification

- [x] Exercise the hosted browser path through context injection, user audio, Nova audio/text, and transcript capture.
- [ ] Verify interruption/barge-in behavior through the actual relay.
- [ ] Verify reconnect exhaustion, expired-session handling, and transcript preservation across reconnects.
- [x] Exercise the WebSocket endpoint with a fake Nova session manager without paid AWS calls.

## Evaluator Handoff

- [x] Retain the complete `analyst_output` in frontend state.
- [x] Map transcript entries to `schemas/interviewer_output.json` conversation turns.
- [x] Populate interview metadata and submit the canonical Evaluator request.
