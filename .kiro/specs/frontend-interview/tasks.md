# Frontend Interview Tasks

> Maintained implementation checklist. Last verified: 2026-08-09.

- [x] 1. Create the Vite, React, and TypeScript frontend structure.
  - Add component, hook, service, reducer, type, utility, worklet, and test directories.
  - Configure Vitest, Testing Library, and fast-check.

- [x] 2. Implement session state management.
  - Add phases, turn state, input mode, transcript, upload data, Analyst output, socket readiness, and feedback state.
  - Coordinate `session_start` after both Agent 1 and WebSocket readiness.
  - Preserve eager state consistency for asynchronous acknowledgments.

- [x] 3. Implement the WebSocket client.
  - Add connect, disconnect, send, session setup, audio, and text methods.
  - Add two bounded reconnection attempts.
  - Handle session acknowledgment and invalid-session events.
  - Keep mock behavior opt-in.

- [x] 4. Implement AudioManager.
  - Capture 16 kHz, 16-bit mono PCM through an AudioWorklet.
  - Play 24 kHz PCM through a queued AudioBuffer chain.
  - Add pause, resume, stop, playback-wait, and teardown behavior.

- [x] 5. Implement Upload Screen.
  - Support file selection and drag-and-drop.
  - Enforce PDF MIME type and the shared 4 MiB (4,194,304 bytes) frontend/backend limit.
  - Require job-description text.
  - Store the submitted inputs for Waiting Room.

- [x] 6. Implement Waiting Room.
  - Start Agent 1 and WebSocket work in parallel.
  - Use a 30-second relay timeout and a 330-second Agent 1 timeout.
  - Abort stale Agent 1 work on timeout/back and retry only the failed dependency.
  - Parse the Interviewer-specific success envelope.
  - Carry the connected WebSocket into Interview Screen.

- [x] 7. Implement the interview shell.
  - Add the interview captions, microphone control, timer, Practice Mode toggle, Guide Panel, and End button.
  - Add active-turn presentation and unload protection.

- [x] 8. Integrate frontend voice streaming.
  - Send microphone frames over WebSocket.
  - Play Nova audio and collect final transcripts.
  - Handle barge-in and show microphone-permission remediation.
  - Connect the interview screen to the socket created in Waiting Room.
  - Status: unit-tested and exercised through the hosted Nova path.

- [x] 9. Remove typed-answer fallback from the maintained UI.
  - Require microphone access for an interview.
  - Retain relay protocol compatibility without exposing a text-only browser control.

- [x] 10. Complete Practice Mode presentation.
  - Render interviewer-only caption bubbles and live partial text.
  - Render Key Competencies and Experiences to Prepare from Analyst output.
  - Keep Practice Mode ON by default and ensure toggling it changes presentation only.
  - When OFF, hide the practice captions and Guide Panel and show the Live Mode participant tiles.
  - Do not repeat candidate answers as practice bubbles.

- [x] 11. Implement interview ending and Evaluator handoff.
  - Support confirmed manual shutdown.
  - Handle the Nova `end_interview` tool after playback.
  - Retain Analyst output and map transcript pairs to `schemas/interviewer_output.json`.
  - Parse the direct Evaluator response body.
  - Status: unit-tested and deployed; continue targeted verification of edge cases.

- [ ] 12. Complete reconnection behavior.
  - Verify real AgentCore reconnection and session history restoration.
  - Ensure the current transcript is not lost.
  - Validate invalid-session and exhausted-retry UI.

- [ ] 13. Complete FeedbackReport features.
  - [x] Use the existing typed Evaluator output model in `frontend/src/types/evaluator.ts`.
  - [x] Render the existing FeedbackReport components instead of raw JSON.
  - [x] Add `Retry with This Resume` while preserving upload/analysis/context.
  - [x] Add `Retry with New Resume` to reset to Upload.
  - [ ] Add transcript viewing; its controls are hidden until a callback is implemented.

## Verification

- Frontend unit/property tests: `cd frontend && npm test -- --run`
- Frontend production build: `cd frontend && npm run build`
- Python tests: `.venv/bin/pytest -q`
- Live AWS verification must be run deliberately because model invocations can incur charges.
