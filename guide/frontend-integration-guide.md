# Frontend Integration Guide

This document explains how the frontend connects to the backend services (Interviewer Lambda, Nova Sonic via AgentCore, and Evaluator Lambda).

## Overview Flow

```
1. Frontend → Analyst Lambda     (send resume + job description, get analyst_output)
2. Frontend → Interviewer Lambda (send analyst_output, get runtime_context)
3. Frontend → AgentCore/Nova Sonic (WebSocket: send runtime_context, stream audio, collect transcript)
4. Frontend → Evaluator Lambda   (send analyst_output + conversation, get feedback)
```

## Step 1: Call the Analyst Lambda

The Analyst Lambda is someone else's module. It takes the resume text + job description and returns a structured `analyst_output`. See `schemas/analyst_output.json` for the full shape.

## Step 2: Call the Interviewer Lambda

**Important**: The Function URL returns 403 due to a workshop SCP restriction. Use the AWS SDK instead of raw `fetch()`.

### Using AWS SDK (JavaScript)

```javascript
import { LambdaClient, InvokeCommand } from "@aws-sdk/client-lambda";

const lambda = new LambdaClient({ region: "us-east-1" });

async function getInterviewContext(analystOutput) {
  const response = await lambda.send(new InvokeCommand({
    FunctionName: "mock-interview-interviewer",
    Payload: JSON.stringify({ analyst_output: analystOutput }),
  }));

  const result = JSON.parse(new TextDecoder().decode(response.Payload));
  const body = JSON.parse(result.body);

  if (body.success) {
    return body.runtime_context; // string — send this to Nova Sonic as system prompt
  } else {
    throw new Error(body.error_message);
  }
}
```

### What you get back

`runtime_context` is a long string with 4 sections:
- `[CANDIDATE DATA]` — the analyst output (JSON)
- `[INTERVIEW STRUCTURE]` — what to ask (3 points, topics, follow-ups)
- `[INTERVIEW PROFILE]` — how to behave (supportive tone, rules)
- `[BEHAVIORAL INSTRUCTIONS]` — hardcoded rules for Nova Sonic

You don't parse this — just send the entire string to Nova Sonic as the system instruction.

### What to save in memory

- **`analystOutput`** — you need this again for the Evaluator call (step 4)
- **`runtimeContext`** — you send this to Nova Sonic (step 3)

## Step 3: Nova Sonic WebSocket (via AgentCore Runtime)

Once AgentCore is deployed, you'll get a WebSocket endpoint. Connect with SigV4 signing.

### Connection Setup

```javascript
// After connecting to AgentCore WebSocket, send these events in order:

// 1. Session start
{ "event": { "sessionStart": { "inferenceConfiguration": { "maxTokens": 1024, "topP": 0.9, "temperature": 0.7 }, "turnDetectionConfiguration": { "endpointingSensitivity": "HIGH" } } } }

// 2. Prompt start (declare output formats)
{ "event": { "promptStart": { "promptName": "<uuid>", "textOutputConfiguration": { "mediaType": "text/plain" }, "audioOutputConfiguration": { "mediaType": "audio/lpcm", "sampleRateHertz": 24000, "sampleSizeBits": 16, "channelCount": 1, "voiceId": "matthew", "encoding": "base64", "audioType": "SPEECH" } } } }

// 3. System instruction start
{ "event": { "contentStart": { "promptName": "<uuid>", "contentName": "<uuid>", "type": "TEXT", "interactive": true, "role": "SYSTEM", "textInputConfiguration": { "mediaType": "text/plain" } } } }

// 4. Send the runtime_context
{ "event": { "textInput": { "promptName": "<uuid>", "contentName": "<uuid>", "content": "<runtime_context_string>" } } }

// 5. End system instruction
{ "event": { "contentEnd": { "promptName": "<uuid>", "contentName": "<uuid>" } } }
```

After step 5, **Nova Sonic will automatically speak the first interview question**. No user action needed.

### Audio Streaming

**Sending user audio (mic → Nova Sonic):**
- Format: PCM 16-bit, 16kHz, mono, base64-encoded
- Send `contentStart` (role: USER, type: AUDIO) before first chunk
- Send `audioInput` events continuously (~every 50-100ms)
- Send `contentEnd` when Nova detects end of user turn (endpointing)
- New `contentName` UUID for each new user turn

**Receiving Nova audio (Nova Sonic → speakers):**
- Listen for `audioOutput` events
- Format: PCM 16-bit, 24kHz, mono, base64-encoded
- Decode base64 → play via Web Audio API at 24kHz
- Queue chunks for smooth playback

### Transcript Collection

Listen for `textOutput` events from the WebSocket:
- Check `contentStart` events for `role` (ASSISTANT = interviewer, USER = candidate)
- For ASSISTANT: the `textOutput` content is what Nova said (the question)
- For USER: the `textOutput` content is ASR of what the candidate said (the answer)
- Pair them into the conversation array (see step 4)

### Session End

To end normally (after all questions):
```javascript
{ "event": { "promptEnd": { "promptName": "<uuid>" } } }
{ "event": { "sessionEnd": {} } }
// Then close the WebSocket
```

### Early Stop

If user clicks "End Interview":
1. Send `contentEnd` if audio stream is open
2. Send `promptEnd`
3. Send `sessionEnd`
4. Close WebSocket
5. Proceed to step 4 with whatever transcript you have

## Step 4: Call the Evaluator Lambda

After the interview ends, assemble and send this payload:

```javascript
const evaluatorPayload = {
  analyst_output: analystOutput, // the SAME object from step 1, unchanged

  conversation: [
    { point_id: "point_1", turn_type: "main_question", question: "Tell me about a project...", answer: "I built an API..." },
    { point_id: "point_1", turn_type: "follow_up", question: "What was the hardest part?", answer: "Schema design..." },
    { point_id: "point_2", turn_type: "main_question", question: "...", answer: "..." },
    { point_id: "point_2", turn_type: "follow_up", question: "...", answer: "..." },
    { point_id: "point_3", turn_type: "main_question", question: "...", answer: "..." },
    { point_id: "point_3", turn_type: "follow_up", question: "...", answer: "..." },
  ],

  interview_metadata: {
    candidate_level: analystOutput.candidate_profile.candidate_level, // "student_intern"
    target_role: analystOutput.target_role.title, // "SDE Intern"
    status: "completed", // or "ended_early"
    completion_reason: "all_questions_completed", // or "user_ended_early"
    main_questions_completed: 3, // 0-3
    follow_ups_completed: 3, // 0-3
    ended_early: false, // true if user clicked End Interview
  },
};
```

Call the Evaluator the same way (AWS SDK):

```javascript
const response = await lambda.send(new InvokeCommand({
  FunctionName: "mock-interview-evaluator", // check actual name
  Payload: JSON.stringify(evaluatorPayload),
}));
```

Schema reference: `schemas/evaluator_input.json`

## Interview State Tracking (for UI)

Track this in your frontend state:

```javascript
const interviewState = {
  currentPoint: 1,              // 1, 2, or 3
  stage: "main",                // "main" or "follow_up"
  completedMainQuestions: 0,
  completedFollowUps: 0,
  isComplete: false,
  endedEarly: false,
};
```

Turn progression:
- Turns 1-2: Point 1 main Q&A
- Turns 3-4: Point 1 follow-up Q&A
- Turns 5-6: Point 2 main Q&A
- Turns 7-8: Point 2 follow-up Q&A
- Turns 9-10: Point 3 main Q&A
- Turns 11-12: Point 3 follow-up Q&A → interview complete

Show progress: "Question 2 of 3" or "Follow-up"

## Key Facts

| Item | Value |
|------|-------|
| Region | `us-east-1` |
| Interviewer Lambda | `mock-interview-interviewer` |
| Nova Sonic model | `amazon.nova-2-sonic-v1:0` |
| Input audio | PCM 16-bit, 16kHz, mono |
| Output audio | PCM 16-bit, 24kHz, mono |
| Session limit | 8 minutes |
| Interview format | 3 main questions + 1 follow-up each |
| Max spoken answers | 6 |
| Nova speaks first | Yes (no user trigger needed) |
| "End Interview" button | Always visible |

## Error Handling

| Scenario | Action |
|----------|--------|
| Mic permission denied | Show clear message, can't proceed |
| WebSocket drops | Show error, offer retry with existing transcript |
| Nova no response (30s) | Show timeout message |
| 8-min limit approaching | Warn user at ~7 min |
| Evaluator fails | Show retry button, preserve conversation in memory |
| Empty transcript | Show message, don't call Evaluator |
