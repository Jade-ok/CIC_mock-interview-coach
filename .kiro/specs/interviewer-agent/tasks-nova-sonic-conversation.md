# Tasks: Voice Agent Server + Frontend Integration (1 person)

## What You're Building

A Python WebSocket server deployed on Bedrock AgentCore Runtime that proxies bidirectional audio between the browser and Amazon Nova Sonic. Plus the frontend code that connects to it, streams audio, collects transcripts, and sends results to the Evaluator.

**Architecture:**
```
Frontend (browser)
    │ SigV4-signed WebSocket
    ▼
AgentCore Runtime (managed proxy)
    │
    ▼
Voice Agent Server (your container)
    │ Bidirectional stream
    ▼
Nova Sonic (amazon.nova-2-sonic-v1:0)
```

**Key facts:**
- Model ID: `amazon.nova-2-sonic-v1:0`
- Region: `us-east-1`
- Input audio: PCM 16-bit, 16kHz, mono, base64
- Output audio: PCM 16-bit, 24kHz, mono, base64
- Connection limit: 8 minutes
- Interview format: 3 main questions, 1 follow-up each, max 6 spoken answers
- Reference sample: [bedrock-sonic](https://github.com/aws-samples/sample-voice-agent-on-aws/tree/main/samples/bidi-streaming/bedrock-sonic)

---

## Part 1: Voice Agent Server (Backend)

### Task 1: Create server structure

- [ ] Create `voice-agent/` directory
- [ ] Create `voice-agent/requirements.txt`:
  ```
  fastapi
  uvicorn
  websockets
  aws-sdk-bedrock-runtime
  ```
- [ ] Create `voice-agent/Dockerfile`:
  ```dockerfile
  FROM python:3.12-slim
  WORKDIR /app
  COPY requirements.txt .
  RUN pip install -r requirements.txt
  COPY . .
  CMD ["uvicorn", "server:app", "--host", "0.0.0.0", "--port", "8080"]
  ```

---

### Task 2: Implement `voice-agent/s2s_events.py`

- [ ] Create event factory functions for all Nova Sonic protocol events:
  - `session_start_event(max_tokens, temperature, top_p, sensitivity)` → JSON string
  - `prompt_start_event(prompt_name, voice_id)` → JSON string
  - `content_start_event(prompt_name, content_name, role, content_type, config)` → JSON string
  - `text_input_event(prompt_name, content_name, content)` → JSON string
  - `audio_input_event(prompt_name, content_name, base64_audio)` → JSON string
  - `content_end_event(prompt_name, content_name)` → JSON string
  - `prompt_end_event(prompt_name)` → JSON string
  - `session_end_event()` → JSON string
- [ ] All functions return valid JSON strings matching Nova Sonic protocol

---

### Task 3: Implement `voice-agent/s2s_session_manager.py`

- [ ] Create `S2sSessionManager` class
- [ ] `__init__`: Initialize with model_id, region, create asyncio queues
- [ ] `start_session()`: Open bidirectional stream to Nova Sonic via `BedrockRuntimeClient.invoke_model_with_bidirectional_stream()`
- [ ] `send_event(event_json)`: Send an event to Nova Sonic stream
- [ ] `process_responses()`: Async loop that reads from Nova Sonic stream, parses JSON, yields response events
- [ ] `close()`: End the stream gracefully
- [ ] Handle credentials via `EnvironmentCredentialsResolver` (AgentCore provides creds as env vars)
- [ ] Audio input queue: max 100 chunks, drop oldest on overflow

---

### Task 4: Implement `voice-agent/server.py`

- [ ] Create FastAPI app with a WebSocket endpoint at `/`
- [ ] On WebSocket connect:
  1. Create `S2sSessionManager`
  2. Start session (opens stream to Nova Sonic)
  3. Start background task: read Nova Sonic responses → forward to client WebSocket
- [ ] On WebSocket message (from client):
  - Forward the event JSON directly to Nova Sonic via `session_manager.send_event()`
- [ ] On WebSocket disconnect:
  - Close the Nova Sonic stream
  - Clean up background tasks
- [ ] Implement `split_large_event(event_json)`:
  - If event >10KB, split `content` field at base64 boundaries (4-char aligned)
  - Return list of smaller events preserving original structure
- [ ] Forward split chunks individually to client
- [ ] Error handling: if Nova Sonic stream dies, close client WebSocket with error

---

### Task 5: Deploy to AgentCore Runtime

- [ ] Build Docker image: `docker build -t mock-interview-voice-agent ./voice-agent`
- [ ] Create ECR repository: `aws ecr create-repository --repository-name mock-interview-voice-agent --region us-east-1`
- [ ] Push image to ECR
- [ ] Deploy using `bedrock-agentcore-starter-toolkit` (follow AgentCore docs)
- [ ] Verify: AgentCore provides a WebSocket endpoint URL
- [ ] Test: connect to AgentCore endpoint with SigV4-signed WebSocket, send sessionStart, verify response

---

## Part 2: Frontend Integration

### Task 6: Frontend WebSocket Connection to AgentCore

- [ ] Create a service module (e.g. `novaSonicService.js`)
- [ ] Sign the WebSocket URL to AgentCore using AWS SDK SigV4
- [ ] Open WebSocket connection to AgentCore's managed endpoint
- [ ] Implement `sendEvent(eventJson)` — sends JSON string over WebSocket
- [ ] Implement `disconnect()` — sends promptEnd → sessionEnd → closes WebSocket
- [ ] Handle connection errors (onerror, onclose)
- [ ] Generate unique `promptName` and `contentName` UUIDs per session

---

### Task 7: Send System Instruction (Runtime Context)

- [ ] After connecting, send the session setup sequence:
  1. `sessionStart` (inference config + turn detection)
  2. `promptStart` (audio/text output formats, voiceId "matthew")
  3. `contentStart` (role: SYSTEM, type: TEXT)
  4. `textInput` (content = `runtime_context` string from Interviewer Lambda)
  5. `contentEnd`
- [ ] After this, Nova Sonic will automatically speak the first question
- [ ] The `runtime_context` is obtained by calling the Interviewer Lambda first

---

### Task 8: Microphone Capture + Audio Streaming

- [ ] Request mic: `navigator.mediaDevices.getUserMedia({audio: true})`
- [ ] Capture PCM 16-bit, 16kHz, mono via AudioWorklet
- [ ] Before first audio chunk: send `contentStart` (role: USER, type: AUDIO, 16kHz config)
- [ ] Stream audio chunks as `audioInput` events (base64), every ~50–100ms
- [ ] On turn end (Nova detects endpointing): send `contentEnd`
- [ ] New `contentName` UUID for each user turn
- [ ] Handle mute/unmute

---

### Task 9: Audio Playback

- [ ] Listen for `audioOutput` events from WebSocket
- [ ] Decode base64 → PCM bytes
- [ ] Play via Web Audio API at 24kHz
- [ ] Queue chunks for smooth playback
- [ ] Handle barge-in: stop playback if user starts speaking
- [ ] Visual indicator: speaking vs listening

---

### Task 10: Transcript Collection

- [ ] Listen for `contentStart` events — track current role (ASSISTANT or USER)
- [ ] Listen for `textOutput` events — transcript text
- [ ] For ASSISTANT: check `additionalModelFields.generationStage` — use `SPECULATIVE` for final text
- [ ] For USER: this is ASR of what candidate said
- [ ] Build conversation array structured by point:
  ```json
  [
    {"point_id": "point_1", "turn_type": "main_question", "question": "...", "answer": "..."},
    {"point_id": "point_1", "turn_type": "follow_up", "question": "...", "answer": "..."}
  ]
  ```
- [ ] Use interview state (Task 11) to determine `point_id` and `turn_type`
- [ ] Pair each ASSISTANT text (question) with next USER text (answer)

---

### Task 11: Interview State Tracking

- [ ] Maintain state:
  ```javascript
  {
    currentPoint: 1,
    stage: "main",
    followUpUsedForCurrentPoint: false,
    completedMainQuestions: 0,
    completedFollowUps: 0,
    isComplete: false,
    endedEarly: false
  }
  ```
- [ ] Update based on turn count (Nova manages flow, this is for UI only):
  - Turns 1–2: Point 1 main
  - Turns 3–4: Point 1 follow-up
  - Turns 5–6: Point 2 main
  - Turns 7–8: Point 2 follow-up
  - Turns 9–10: Point 3 main
  - Turns 11–12: Point 3 follow-up → `isComplete = true`
- [ ] Show progress: "Question 2 of 3" or "Follow-up"

---

### Task 12: Early Stop

- [ ] "End Interview" button visible during interview
- [ ] On click → confirm with user
- [ ] If confirmed:
  1. Stop mic streaming
  2. Send `contentEnd` if audio open
  3. Send `promptEnd`
  4. Send `sessionEnd`
  5. Close WebSocket
- [ ] Update state: `endedEarly = true`
- [ ] Proceed to Task 13

---

### Task 13: Send Results to Evaluator

- [ ] After interview ends, assemble payload per `schemas/evaluator_input.json`:
  ```json
  {
    "analyst_output": { "...unchanged..." },
    "conversation": [
      {"point_id": "point_1", "turn_type": "main_question", "question": "...", "answer": "..."},
      {"point_id": "point_1", "turn_type": "follow_up", "question": "...", "answer": "..."},
      ...
    ],
    "interview_metadata": {
      "candidate_level": "student_intern",
      "target_role": "Software Engineering Intern",
      "status": "completed",
      "completion_reason": "all_questions_completed",
      "main_questions_completed": 3,
      "follow_ups_completed": 3,
      "ended_early": false
    }
  }
  ```
- [ ] `analyst_output` from `schemas/analyst_output.json` — pass through unchanged
- [ ] `conversation` structured by point_id + turn_type
- [ ] `interview_metadata` pulled from state + analyst_output fields
- [ ] POST to Evaluator Lambda Function URL
- [ ] Handle success: display feedback
- [ ] Handle error: retry button, preserve conversation in memory

---

### Task 14: End-to-End Integration

- [ ] Wire the full flow:
  1. Call Interviewer Lambda → get `runtime_context`
  2. Connect to AgentCore WebSocket → send system instruction
  3. Nova speaks first question → playback + transcript
  4. Candidate speaks → mic streaming + transcript
  5. Repeat for all turns
  6. Interview ends → send to Evaluator
  7. Display feedback
- [ ] Test with real mic + speakers
- [ ] Test early stop

---

### Task 15: Error Handling

- [ ] Mic permission denied → clear message
- [ ] WebSocket drops → show error, offer retry with existing transcript
- [ ] Nova no response within 30s → timeout message
- [ ] 8-minute limit approaching → warn user at 7 min
- [ ] Evaluator fails → retry button, preserve conversation
- [ ] Empty transcript → don't call Evaluator

---

## Done Criteria

1. Voice Agent Server deployed on AgentCore Runtime
2. Frontend connects via SigV4-signed WebSocket to AgentCore
3. User hears Nova Sonic ask 3 questions + 3 follow-ups
4. User speaks answers via microphone
5. Transcript collected in structured format
6. Results sent to Evaluator after interview
7. Early stop works cleanly

---

## Key Technical Notes

- **AgentCore handles auth**: Frontend signs the WebSocket URL with SigV4. No raw AWS credentials in the browser. AgentCore validates and proxies to your container.
- **Server is a thin relay**: It does NOT interpret events. All intelligence is in Nova Sonic (driven by the runtime_context system instruction the frontend sent).
- **8-minute limit**: Nova Sonic sessions time out at 8 minutes. A 6-answer interview should fit.
- **Audio formats**: Capture at 16kHz, play at 24kHz. Different sample rates.
- **Large event splitting**: Server splits >10KB audioOutput events at base64 boundaries before forwarding to the browser WebSocket.
- **Frontend holds all state**: Save `analyst_output` in memory — you need it for the Evaluator call.
- **Reference implementation**: [aws-samples/sample-voice-agent-on-aws/samples/bidi-streaming/bedrock-sonic](https://github.com/aws-samples/sample-voice-agent-on-aws/tree/main/samples/bidi-streaming/bedrock-sonic)
