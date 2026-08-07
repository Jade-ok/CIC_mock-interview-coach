# Tracker: Nova Sonic Conversation Runtime

> Active tracker. Last verified: 2026-08-07. Checkmarks describe repository implementation, not successful deployment to an AWS account.

## Implemented Backend

- [x] Create the AgentCore container project under `backend/voice_agent/`.
- [x] Add Nova event factories in `s2s_events.py`.
- [x] Add bidirectional session management and audio-queue primitives in `s2s_session_manager.py`.
- [x] Add the FastAPI health endpoint and WebSocket relay in `server.py`.
- [x] Configure `amazon.nova-2-sonic-v1:0` in `us-east-1`.
- [x] Add the Dockerfile and Python dependencies for the relay.
- [ ] Migrate deployment from the temporary legacy `.bedrock_agentcore.yaml` workflow to the current AgentCore CLI/configuration before production deployment.
- [x] Translate the browser `{type, payload}` contract to and from Nova events in `protocol.py`.
- [x] Emit `session_start_ack` after the relay sends the Nova setup sequence.
- [x] Route browser audio through `send_audio_chunk()` and the bounded queue.
- [x] Add focused adapter tests for setup, audio, text, shutdown, transcripts, audio output, interruption, and credentials.

## Implemented Frontend Pieces

- [x] Add a WebSocket client abstraction with reconnection support.
- [x] Add microphone capture and audio playback services.
- [x] Add interview UI, text input, manual end flow, and transcript state.

## Remaining Integration Work

- [ ] Verify one complete browser session: start, context injection, user audio, Nova audio/text, transcript capture, and session end.
- [ ] Verify interruption/barge-in behavior through the actual relay.
- [ ] Verify text fallback through the selected protocol.
- [x] Exercise the WebSocket endpoint with a fake Nova session manager without paid AWS calls.

## Deployment Verification

- [ ] Migrate the legacy Starter Toolkit layout to AWS's current `@aws/agentcore` project format.
- [ ] Build the container from `backend/voice_agent/`.
- [ ] Deploy with the AgentCore CLI from `backend/voice_agent/`.
- [ ] Configure authentication for browser-to-AgentCore access and document the chosen token/identity flow.
- [ ] Record the authenticated `wss://` relay endpoint in the Amplify frontend environment configuration.
- [ ] Verify `/health` and an authenticated WebSocket connection in the target AWS environment.
- [ ] Confirm the deployed browser has no long-lived AWS credentials and no direct Bedrock Nova invocation path.

## Evaluator Handoff

- [x] Retain the complete `analyst_output` in frontend state.
- [x] Map transcript entries to `schemas/interviewer_output.json` conversation turns.
- [x] Populate interview metadata and submit the canonical Evaluator request.
