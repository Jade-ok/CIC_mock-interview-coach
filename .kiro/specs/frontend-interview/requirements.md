# Frontend Interview Requirements

> Maintained product requirements. Last verified: 2026-08-07.

## Scope

This specification covers the React frontend and its use of existing HTTP and WebSocket interfaces. Backend model logic, AgentCore infrastructure, Lambda implementations, and Nova tool definitions belong to their respective backend specifications.

## 1. Upload

1. The Upload Screen must accept a resume PDF and job-description text.
2. A file with a MIME type other than `application/pdf` must be rejected.
3. PDFs larger than 4 MB must be rejected before upload, matching the PDF Parser's backend limit.
4. The Submit button must remain disabled until both a file and non-empty job-description text exist.
5. Submission must store the actual `File` and job-description text in session state.

## 2. Waiting Room

1. Entering the Waiting Room must start Agent 1 processing and WebSocket connection in parallel.
2. The real WebSocket client must be the default; mock use must require explicit configuration.
3. `session_start` must not be sent until Agent 1 context and a connected socket both exist.
4. The interview must not begin until `session_start_ack` is received.
5. If the voice relay is not connected after 30 seconds, the UI must show a retryable connection error.
6. Agent 1 may run for up to 330 seconds so two sequential 120-second Bedrock calls plus pipeline overhead can complete.
7. Retry must preserve a successful or still-running dependency and retry only the failed dependency.
8. Going back must abort the active Agent 1 request, disconnect the active socket, and reset session state.

## 3. Voice Interview

1. Microphone audio must be sent as base64-encoded 16 kHz, 16-bit mono PCM.
2. Nova audio must be played as 24 kHz, 16-bit mono PCM.
3. The UI must indicate whether the interviewer or candidate currently has the turn.
4. `interrupted` must stop AI playback immediately and move to the user turn.
5. Only `FINAL` text outputs may be stored in the transcript.
6. Transcript entries must preserve reception order, role, text, and an ISO 8601 timestamp.
7. If microphone access is denied, the interview must remain usable in text-only mode.
8. While typed input is being composed, microphone frames must not be transmitted.
9. Submitting typed input must clear the field and resume capture when voice mode is available.
10. Practice Mode must default to ON and affect frontend presentation only, never server messages or session behavior.
11. When Practice Mode is ON, interviewer transcript bubbles and competency highlighting may be shown; candidate answers must not be repeated as practice bubbles.
12. Turning Practice Mode OFF must immediately hide or clear practice bubbles and competency highlighting while leaving the Guide Panel available.
13. The control bar must display elapsed interview time in `mm:ss` format.
14. The interview must not display a question number, total-question count, or progress indicator.
15. The application must not use a camera.
16. A `beforeunload` warning must be active only during an interview.

## 4. Ending the Interview

1. The End button must always be enabled during an interview.
2. Manual end must require confirmation.
3. Confirming manual end must stop playback, send `session_end`, disconnect, and enter Feedback.
4. Receiving the `end_interview` tool must wait for current playback before automatic shutdown.
5. Canceling manual end must leave the session unchanged.
6. Both end paths must invoke the Evaluator with completed question-answer pairs.
7. Evaluator loading must be visible immediately after entering Feedback.
8. Evaluator failure must preserve session data and offer retry.

## 5. Data Contracts

1. The full Analyst output must remain available throughout the active session.
2. The Evaluator request must match `schemas/interviewer_output.json`.
3. Conversation turns must contain `point_id`, `turn_type`, `question`, and `answer`.
4. Six complete pairs must be marked completed; fewer pairs must be marked ended early.
5. The Evaluator response must be consumed as the direct Function URL response body.

## 6. Connection Handling

1. The WebSocket client must expose connecting, connected, reconnecting, and disconnected states.
2. Unexpected disconnects may attempt at most two reconnects using bounded backoff.
3. Reconnect success must restart the voice session setup.
4. Reconnect failure must show a non-retryable error and return to Upload.
5. `session_invalid` must show an explicit invalid-session error.
6. Production must use an authenticated `wss://` endpoint supplied through environment configuration.

## 7. Hosted Architecture and Security

1. The production static build must be hosted on AWS Amplify Hosting.
2. Users must authenticate before opening the AgentCore WebSocket.
3. Permanent AWS credentials must never be embedded in browser code.
4. Lambda endpoints must be protected before public launch.
5. Hosted endpoint values must be supplied through environment variables rather than committed source.
6. The hosted application must support end-to-end verification from its Amplify origin.

## 8. Accessibility and Presentation

1. Interactive controls must have accessible names and keyboard behavior.
2. Errors must be exposed with an alert role where appropriate.
3. Active-speaker state must not rely on color alone.
4. The layout must remain usable at common desktop and mobile widths.
5. The visual system must follow `.kiro/steering/design-theme.md`.

## Current Status

Implemented and locally tested:

- Upload validation and state retention.
- Agent 1 HTTP envelope handling.
- WebSocket browser/relay protocol adapter.
- Audio and text streaming hooks.
- Transcript accumulation and Evaluator request mapping.
- Manual/automatic end UI behavior.
- Guide Panel, Practice Mode bubbles, and competency highlighting.
- Typed FeedbackReport integration with runtime response validation.
- Reducer, service, component, and protocol tests.

Still pending:

- Live Nova and AgentCore verification.
- Transcript viewing from the FeedbackReport.
- Amplify hosting and authentication.
- Protected Lambda access.
