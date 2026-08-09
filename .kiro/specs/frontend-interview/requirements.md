# Frontend Interview Requirements

> Maintained product requirements. Last verified: 2026-08-08.

## Scope

This specification covers the React frontend and its use of existing HTTP and WebSocket interfaces. Backend model logic, AgentCore infrastructure, Lambda implementations, and Nova tool definitions belong to their respective backend specifications.

## 1. Upload

1. The Upload Screen must accept a resume PDF and job-description text.
2. A file with a MIME type other than `application/pdf` must be rejected.
3. PDFs larger than 4 MB must be rejected before upload, matching the PDF Parser's backend limit.
4. The Submit button must remain disabled until both a file and non-empty job-description text exist.
5. Submission must store the actual `File` and job-description text in session state.
6. Job-description text must be capped at 5,000 characters in every runtime mode.

## 2. Waiting Room

1. Entering the Waiting Room must start Agent 1 processing and WebSocket connection in parallel.
2. The real WebSocket client must be the default; mock use must require explicit configuration.
3. `session_start` must not be sent until Agent 1 context and a connected socket both exist.
4. The interview must not begin until `session_start_ack` is received.
5. If the voice relay is not connected after 30 seconds, the UI must show a retryable connection error.
6. Agent 1 may run for up to 330 seconds so local schema recovery and pipeline overhead can complete; hosted Analyst execution is bounded to one 55-second model attempt.
7. Retry must preserve a successful or still-running dependency and retry only the failed dependency.
8. Going back must abort the active Agent 1 request, disconnect the active socket, and reset session state.

## 3. Voice Interview

1. Microphone audio must be sent as base64-encoded 16 kHz, 16-bit mono PCM.
2. Nova audio must be played as 24 kHz, 16-bit mono PCM.
3. The UI must indicate whether the interviewer or candidate currently has the turn.
4. `interrupted` must stop AI playback immediately and move to the user turn.
5. Only `FINAL` text outputs may be stored in the transcript.
6. Transcript entries must preserve reception order, role, text, and an ISO 8601 timestamp.
7. Microphone access is required; denial must show an accessible message instructing the user to allow permission and refresh.
8. The maintained interview UI does not provide a typed-answer or text-only fallback.
9. Practice Mode must default to ON and affect frontend presentation only, never server messages or session behavior.
10. When Practice Mode is ON, interviewer transcript bubbles may be shown; candidate answers must not be repeated as practice bubbles.
11. Turning Practice Mode OFF must immediately hide practice bubbles while leaving the interview controls available.
12. The control bar must display elapsed interview time in `mm:ss` format.
13. The interview must not display a question number, total-question count, or progress indicator.
14. The application must not use a camera.
15. A `beforeunload` warning must be active only during an interview.

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
4. Nova is prompted for three main questions and one adaptive follow-up per main question, but the frontend does not enforce that sequence; six captured pairs are marked completed and fewer are marked ended early.
5. The Evaluator response must be consumed as the direct Function URL response body.

## 6. Connection Handling

1. The WebSocket client must expose connecting, connected, reconnecting, and disconnected states.
2. Unexpected disconnects may attempt at most two reconnects using bounded backoff.
3. Reconnect success must restart the voice session setup.
4. Reconnect failure must show a non-retryable error and return to Upload.
5. `session_invalid` must show an explicit invalid-session error.
6. Hosted mode must obtain a fresh five-minute SigV4-signed `wss://` URL from the Voice Session Lambda for each connection attempt.

## 7. Hosted Architecture and Security

1. The production static build must be hosted on AWS Amplify Hosting.
2. The current application intentionally has no end-user login.
3. The signed AgentCore URL authenticates the Voice Session Lambda role to AgentCore; it is not an end-user login mechanism.
4. Permanent AWS credentials must never be embedded in browser code.
5. The browser uses one public CloudFront API base URL. CloudFront OAC signs requests to five private `AWS_IAM` Function URLs, and CORS is restricted to the configured Amplify origin and local Vite origin.
6. Hosted endpoint values must be supplied through environment configuration rather than committed source.
7. The hosted application must support end-to-end verification from its Amplify origin.
8. Hosted Lambdas must have invocation/error/throttle alarms and an AWS monthly cost budget with email notifications. A zero-concurrency emergency switch must be available. Optional normal concurrency caps must remain disabled unless the target AWS account quota supports them.
9. Hosted Analyst/Evaluator calls must use bounded text inputs and a 4,096-token output ceiling; hosted Nova sessions must end after eight minutes.
10. Pure local execution must leave the additional hosted text, output-token, and voice-duration guardrails disabled. Existing AWS quotas, the shared 4 MiB PDF limit, and the product-wide 5,000-character job-description limit still apply.

## 8. Accessibility and Presentation

1. Interactive controls must have accessible names and keyboard behavior.
2. Errors must be exposed with an alert role where appropriate.
3. Active-speaker state must not rely on color alone.
4. The layout must remain usable at common desktop and mobile widths.
5. The visual system must follow `.kiro/steering/design-theme.md`.

## Current Status

Implemented and deployed:

- Upload validation and state retention.
- Agent 1 HTTP envelope handling.
- WebSocket browser/relay protocol adapter.
- Audio streaming hooks and microphone-required remediation.
- Transcript accumulation and Evaluator request mapping.
- Manual/automatic end UI behavior.
- Guide Panel and Practice Mode bubbles.
- Typed FeedbackReport integration with runtime response validation.
- Reducer, service, component, and protocol tests.

Still pending:

- Transcript viewing from the FeedbackReport.
- Real AgentCore reconnection and session-history restoration edge cases.
- Optional stronger public-endpoint abuse controls beyond the implemented alarms, budget notifications, model/session caps, and emergency shutdown switch. Normal concurrency caps also remain optional until the target account quota supports them.
