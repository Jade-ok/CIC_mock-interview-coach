# Tasks: Nova Sonic Conversation — Frontend (1 person)

## What You're Building

The frontend WebSocket integration with Amazon Nova Sonic that conducts the spoken interview. You receive a `runtime_context` string from the Interviewer Lambda, connect to Nova Sonic, stream audio bidirectionally, collect the transcript, and send results to the Evaluator when done.

**Prerequisites:**
- Interviewer Lambda deployed and returning `runtime_context` (the other person's task)
- AWS credentials available to the frontend for signing the WebSocket connection
- Browser microphone access

**Key facts:**
- Model ID: `amazon.nova-2-sonic-v1:0`
- Region: `us-east-1`
- Input audio: PCM 16-bit, 16kHz, mono, base64
- Output audio: PCM 16-bit, 24kHz, mono, base64
- Connection limit: 8 minutes
- Interview format: 3 main questions, 1 follow-up each, max 6 spoken answers

---

## Nova Sonic Event Protocol (reference)

```
Session setup:
  1. sessionStart           → inference config + turn detection
  2. promptStart            → declare output formats (audio + text)
  3. contentStart (SYSTEM)  → begin system instruction
  4. textInput              → send runtime_context
  5. contentEnd             → end system instruction

Each user turn:
  6. contentStart (USER)    → begin user audio
  7. audioInput (repeated)  → stream mic chunks (base64)
  8. contentEnd             → end user audio (Nova detects end-of-turn)

Nova responds with:
  - contentStart (ASSISTANT) → signals response beginning
  - textOutput              → transcript of what Nova says
  - audioOutput (repeated)  → audio chunks to play
  - contentEnd              → signals response end

Session teardown:
  9. promptEnd
  10. sessionEnd
```

---

## Tasks

### Task 1: Nova Sonic WebSocket Service

- [ ] Create a service module (e.g. `novaSonicService.js` or `.ts`)
- [ ] Sign the WebSocket URL with AWS SigV4 (presigned URL approach or `@aws-sdk/credential-providers`)
- [ ] Endpoint: `wss://bedrock-runtime.us-east-1.amazonaws.com/model/amazon.nova-2-sonic-v1:0/invoke-with-bidirectional-stream`
- [ ] Open WebSocket connection
- [ ] Send `sessionStart`:
  ```json
  {"event": {"sessionStart": {"inferenceConfiguration": {"maxTokens": 1024, "topP": 0.9, "temperature": 0.7}, "turnDetectionConfiguration": {"endpointingSensitivity": "HIGH"}}}}
  ```
- [ ] Send `promptStart` declaring output formats:
  - Audio: `audio/lpcm`, 24kHz, 16-bit, mono, base64, voiceId `"matthew"`
  - Text: `text/plain`
- [ ] Implement `disconnect()` that sends `promptEnd` → `sessionEnd` → closes WebSocket
- [ ] Handle connection errors (onerror, onclose) with retry logic
- [ ] Generate unique `promptName` and `contentName` UUIDs for each session

---

### Task 2: Send System Instruction

- [ ] After `promptStart`, send `contentStart` with:
  - `role: "SYSTEM"`, `type: "TEXT"`, `interactive: true`
- [ ] Send `textInput` with the `runtime_context` string as `content`
- [ ] Send `contentEnd` to close the system instruction
- [ ] After this, Nova Sonic will automatically speak the first interview question
- [ ] No user action needed to trigger the first question — Nova starts talking

---

### Task 3: Microphone Capture + Audio Streaming

- [ ] Request mic permission: `navigator.mediaDevices.getUserMedia({audio: true})`
- [ ] Set up AudioWorklet (or ScriptProcessorNode) to capture PCM 16-bit, 16kHz, mono
- [ ] Before streaming first chunk, send `contentStart`:
  ```json
  {"event": {"contentStart": {"promptName": "<uuid>", "contentName": "<uuid>", "type": "AUDIO", "interactive": true, "role": "USER", "audioInputConfiguration": {"mediaType": "audio/lpcm", "sampleRateHertz": 16000, "sampleSizeBits": 16, "channelCount": 1, "audioType": "SPEECH", "encoding": "base64"}}}}
  ```
- [ ] Stream audio chunks as `audioInput` events (base64-encoded), every ~50–100ms
- [ ] When Nova detects end of user turn → send `contentEnd` for audio
- [ ] Handle mute/unmute (stop sending chunks when muted)
- [ ] New `contentName` UUID for each new user turn

---

### Task 4: Audio Playback

- [ ] Listen for `audioOutput` events from Nova Sonic
- [ ] Decode base64 → PCM bytes
- [ ] Play via Web Audio API at 24kHz (AudioContext + AudioBufferSourceNode)
- [ ] Queue chunks for smooth playback (no gaps)
- [ ] Handle barge-in: if user starts speaking while Nova is playing → stop playback, clear queue
- [ ] Show visual indicator: "Nova is speaking" vs "Listening"

---

### Task 5: Transcript Collection

- [ ] Listen for `contentStart` events — track current `role` (ASSISTANT or USER)
- [ ] Listen for `textOutput` events — this is the transcript text
- [ ] For ASSISTANT role: check `additionalModelFields.generationStage` — use `SPECULATIVE` for final text
- [ ] For USER role: this is the ASR (automatic speech recognition) of what the candidate said
- [ ] Build transcript array in memory:
  ```json
  [
    {"role": "interviewer", "text": "Tell me about a project you worked on."},
    {"role": "candidate", "text": "I built a web app for my database course..."},
    {"role": "interviewer", "text": "What was the most challenging part?"},
    {"role": "candidate", "text": "Designing the schema was tricky because..."}
  ]
  ```
- [ ] Append each completed turn to the array after `contentEnd`

---

### Task 6: Interview State Tracking

- [ ] Maintain state object:
  ```javascript
  {
    currentPoint: 1,              // 1, 2, or 3
    stage: "main",                // "main" or "follow_up"
    followUpUsedForCurrentPoint: false,
    completedMainQuestions: 0,
    completedFollowUps: 0,
    isComplete: false,
    endedEarly: false
  }
  ```
- [ ] Update based on turn count:
  - Nova speaks (odd turns: 1, 3, 5, 7, 9, 11) → questions
  - Candidate speaks (even turns: 2, 4, 6, 8, 10, 12) → answers
  - Turn 1–2: Point 1 main Q&A → `completedMainQuestions++`
  - Turn 3–4: Point 1 follow-up Q&A → `completedFollowUps++`, advance to point 2
  - Turn 5–6: Point 2 main Q&A → `completedMainQuestions++`
  - ...and so on
  - After turn 12 (or 6 candidate answers): `isComplete = true`
- [ ] Show progress: "Question 2 of 3" or "Follow-up"
- [ ] Nova manages the actual question flow — this state is for UI display only

---

### Task 7: Early Stop

- [ ] Add "End Interview" button, visible during interview
- [ ] On click → confirm with user ("End interview? Your answers so far will still be evaluated.")
- [ ] If confirmed:
  1. Stop mic streaming
  2. Send `contentEnd` if audio is open
  3. Send `promptEnd`
  4. Send `sessionEnd`
  5. Close WebSocket
- [ ] Update state: `endedEarly = true`
- [ ] Proceed to Task 8 with whatever transcript exists

---

### Task 8: Send Results to Evaluator

- [ ] After interview ends (naturally or early), assemble payload:
  ```json
  {
    "analyst_output": { "...original analyst output saved from step 1..." },
    "transcript": [
      {"role": "interviewer", "text": "..."},
      {"role": "candidate", "text": "..."}
    ],
    "interview_metadata": {
      "completed_main_questions": 3,
      "completed_follow_ups": 3,
      "ended_early": false,
      "candidate_level": "student_intern"
    }
  }
  ```
- [ ] POST to Evaluator Lambda Function URL
- [ ] Handle success: display scores and feedback to user
- [ ] Handle error: show retry button, don't lose transcript
- [ ] Note: the Evaluator schema is defined by the Evaluator team — adapt once available

---

### Task 9: End-to-End Integration

- [ ] Wire the full flow:
  1. Call Interviewer Lambda → get `runtime_context`
  2. Open Nova Sonic WebSocket → send system instruction
  3. Nova speaks first question → audio playback + transcript
  4. Candidate speaks → mic streaming + transcript
  5. Repeat for all turns
  6. Interview ends → send to Evaluator
  7. Display feedback
- [ ] Test with real mic + speakers
- [ ] Verify transcript accuracy
- [ ] Test early stop at various points

---

### Task 10: Error Handling

- [ ] Mic permission denied → clear message, can't proceed
- [ ] WebSocket drops mid-interview → show error, offer retry with existing transcript
- [ ] Nova doesn't respond within 30s → show timeout message
- [ ] 8-minute connection limit approaching → warn user (at 7 min), end gracefully
- [ ] Evaluator fails → show retry button, preserve transcript in memory
- [ ] Empty transcript (user never spoke) → show message, don't call Evaluator

---

## Done Criteria

The user can:
1. Click "Start Interview"
2. Hear Nova Sonic ask 3 questions with 1 follow-up each
3. Speak answers into the microphone
4. See the transcript appear in real-time
5. Optionally end early
6. See evaluation results after the interview

---

## Key Technical Notes

- **SigV4 WebSocket signing**: The `wss://` URL must be presigned. Use `@aws-sdk/credential-providers` or route through a signing endpoint. See AWS docs for examples.
- **8-minute limit**: A 6-answer interview (3 main + 3 follow-ups) should fit within 8 minutes. If not, implement reconnection with conversation continuation (see [AWS Nova samples on GitHub](https://github.com/aws-samples/sample-nova-sonic-websocket-agentcore)).
- **Audio formats differ**: Capture at 16kHz, play at 24kHz. Don't mix them up.
- **Turn detection**: Nova handles endpointing — you don't need silence detection. Just keep streaming and Nova will signal when it's responding.
- **Frontend holds all state**: Save `analyst_output` in memory when you get it from the Interviewer Lambda — you need it again for the Evaluator call.
