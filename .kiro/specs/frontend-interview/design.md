# Frontend Interview Design

> Maintained design. Last verified: 2026-08-07.

## Overview

The frontend is a React, TypeScript, and Vite single-page application. A candidate uploads a PDF resume and job description, completes a real-time voice interview with Nova 2 Sonic, and receives structured feedback.

Local development connects to `backend.local_server:app` for the HTTP pipeline and voice relay. The hosted architecture uses AWS Amplify Hosting, Lambda, and an authenticated `wss://` connection to AgentCore.

## Architecture

```text
Amplify-hosted React/Vite browser
  ├─ HTTPS → PDF Parser Lambda
  │           → Analyst Lambda (OpenAI GPT OSS 120B)
  │           → Interviewer Lambda + S3 configuration
  ├─ authenticated WSS → AgentCore voice relay → Nova 2 Sonic
  └─ HTTPS → Evaluator Lambda (OpenAI GPT OSS 120B)
```

Hosted integration requirements:

- Production builds select their configured HTTPS and WSS endpoints with `VITE_RUNTIME_MODE=hosted`.
- AgentCore authentication and Amplify hosting/authentication are not configured.
- Lambda Function URLs are public and use wildcard CORS.
- The protocol is unit-tested but has not been verified in a live browser/Nova session.

## Screen Flow

```text
Upload → Waiting Room → Interview → Feedback
```

1. Upload stores the selected PDF and job description in session state.
2. Waiting Room starts the HTTP analysis pipeline and WebSocket connection in parallel.
3. The interview starts only after both the Analyst context and WebSocket session acknowledgment are ready.
4. Final Nova transcripts are accumulated in session state.
5. At interview end, transcript entries are paired into the canonical Evaluator request.
6. Feedback displays loading, error, or result state.

## Component Responsibilities

### UploadScreen

- Accept one `application/pdf` file no larger than the shared 4 MB frontend/backend limit.
- Accept job-description text.
- Disable submission when either required input is missing.
- Pass the actual `File` and text to the session reducer.

### WaitingRoom

- Call PDF Parser, Analyst, and Interviewer through `callAgent1`.
- Connect the real WebSocket client by default.
- Use `VITE_USE_MOCK_WEBSOCKET=true` only for intentional development mocking.
- Send `session_start` once both HTTP context and socket connection are ready.
- Transition after `session_start_ack`.
- Retry only the failed side. Enforce a 30-second relay timeout and a 330-second Agent 1 timeout, aborting stale Agent 1 HTTP work before retry.

### InterviewScreen

- Capture 16 kHz, 16-bit mono PCM audio.
- Play 24 kHz, 16-bit mono PCM audio.
- Show active-speaker state.
- Allow text fallback while pausing microphone transmission during composition.
- Accumulate only `FINAL` transcript events.
- Allow barge-in by stopping queued playback on `interrupted`.
- Keep the manual End button available at all times.
- Warn before page unload during an active interview.

### FeedbackScreen

- Show Evaluator loading and retry states.
- Store the direct Evaluator response object.
- Render successful results through the typed `FeedbackReport` components.
- Keep transcript viewing explicitly pending; Practice Again resets the session.

## State Model

The reducer owns one in-memory interview session:

```typescript
interface SessionState {
  phase: 'upload' | 'waiting' | 'interview' | 'feedback';
  uploadData: { pdf: File; jdText: string } | null;
  analystOutput: Record<string, unknown> | null;
  novaSonicContext: string;
  competencyGuides: CompetencyGuide[];
  transcript: TranscriptEntry[];
  turnState: 'ai_speaking' | 'user_turn' | 'idle';
  inputMode: 'voice' | 'text_only';
  textInputState: 'idle' | 'composing';
  practiceMode: boolean;
  elapsedSeconds: number;
  wsConnectionState: 'connecting' | 'connected' | 'reconnecting' | 'disconnected';
  agent1Ready: boolean;
  wsReady: boolean;
  error: SessionError | null;
  agent3Loading: boolean;
  feedbackResult: EvaluatorOutput | null;
  endReason: 'auto' | 'manual' | null;
}
```

`RESET` returns every field to `initialState`.

## HTTP Pipeline

### Agent 1 aggregate client

`callAgent1` performs:

1. PDF Parser: PDF base64 plus job description.
2. Analyst: extracted resume and job-posting text.
3. Interviewer: complete `analyst_output`.

It returns:

```typescript
interface Agent1Response {
  nova_sonic_context: string;
  competency_guides: CompetencyGuide[];
  analyst_output: Record<string, unknown>;
}
```

The Interviewer uses its own response envelope:

```json
{"success": true, "runtime_context": "..."}
```

### Evaluator

The request matches `schemas/interviewer_output.json`:

```typescript
interface Agent3Request {
  conversation: Array<{
    point_id: string;
    turn_type: 'main_question' | 'follow_up';
    question: string;
    answer: string;
  }>;
  interview_metadata: InterviewMetadata;
  analyst_output: Record<string, unknown>;
}
```

The six scripted answers map in order to three points, each containing a main question and one follow-up. An unanswered final closing is not included. Six complete pairs produce `completed`; fewer pairs produce `ended_early`.

## WebSocket Protocol

Browser input events:

| Event | Purpose |
|---|---|
| `session_start` | Send runtime context and inference settings |
| `audio_chunk` | Send base64 PCM microphone data |
| `text_input` | Send a typed candidate response |
| `session_end` | Close the interview session |

Relay output events:

| Event | Purpose |
|---|---|
| `session_start_ack` | Confirm Nova session setup |
| `audio_output` | Provide base64 PCM speech |
| `text_output` | Provide user/interviewer transcript text |
| `tool_use` | Signal tools such as `end_interview` |
| `interrupted` | Stop current AI playback for barge-in |
| `content_end` | Mark a content block complete |
| `completion_end` | Mark a response complete |
| `session_invalid` | Report an invalid or expired session |

`backend/voice_agent/protocol.py` owns Nova identifiers and translates this browser contract into the Nova event lifecycle. It configures `end_interview` and sends an initial interactive text event so the interviewer speaks first.

## Audio and Turn Handling

- Microphone frames are captured through an AudioWorklet without blocking the main thread.
- Echo cancellation and noise suppression are requested from the browser.
- Playback uses chained `AudioBufferSourceNode` instances.
- Text composition pauses outgoing audio frames without suspending the AudioContext.
- Only final transcript stages are persisted.
- Practice Mode affects presentation only and must never alter backend messages.

## End and Retry Behavior

Automatic end:

1. Nova emits `end_interview`; the relay immediately returns Nova's required `toolResult`.
2. The relay holds the browser-facing `tool_use` until Nova emits `completionEnd`, preventing early audio shutdown.
3. The browser receives `tool_use`, waits for final audio playback, sends `session_end`, disconnects, and enters Feedback.
4. Invoke the Evaluator.

Manual end:

1. Display confirmation.
2. Stop playback immediately after confirmation.
3. Send `session_end`, disconnect, and enter Feedback.
4. Invoke the Evaluator with completed pairs so far.

Evaluator failure keeps the transcript and Analyst output available for retry.

## Runtime Configuration

Local development uses the combined backend on port 8080. Hosted builds receive environment-specific HTTPS and WSS endpoints through the hosting environment. AWS credentials belong to backend runtime identities rather than browser configuration.

## Verification Properties

1. Non-PDF or over-4-MB uploads are rejected by the current frontend.
2. Submit remains disabled until both inputs exist.
3. Waiting Room times out unless both dependencies become ready.
4. Retry invokes only the failed dependency.
5. Barge-in stops playback immediately.
6. Text composition pauses microphone transmission.
7. Reconnection attempts remain bounded.
8. Practice Mode changes UI only.
9. Only final transcript events are retained, in order.
10. `session_start` is sent only after context and socket readiness.
11. `end_interview` waits for playback before automatic shutdown.
12. The End button remains enabled throughout the interview.

## Remaining Work

- Implement the FeedbackReport transcript view.
- Verify reconnection with real AgentCore session behavior and history restoration.
- Run a live Nova browser test.
