# Frontend Integration Guide

> Legacy reference: this guide documents the earlier SDK/Cognito integration. The current architecture uses Lambda Function URLs and the AgentCore voice relay described in the root README.

## Deployed Services

| Service | How to Call |
|---------|------------|
| Analyst | `aws lambda invoke --function-name mock-interview-analyst` (SDK only) |
| Interviewer | `aws lambda invoke --function-name mock-interview-interviewer` (SDK only) |
| Evaluator | `aws lambda invoke --function-name mock-interview-evaluator` (SDK only) |
| Nova Sonic | Direct WebSocket via Cognito credentials |

**Note**: Function URLs return 403 due to workshop SCP. Use AWS SDK `LambdaClient.invoke()` for all Lambda calls.

## Cognito Identity Pool (for Nova Sonic)

```
Identity Pool ID: us-east-1:be3da380-d032-46f4-b4a2-85846a61bc52
Region: us-east-1
Auth: Unauthenticated (no login needed)
```

## NPM Packages Needed

```bash
npm install @aws-sdk/client-lambda @aws-sdk/client-cognito-identity @aws-sdk/client-bedrock-runtime @aws-sdk/credential-providers
```

## Step 1: Call Analyst Lambda

```javascript
import { LambdaClient, InvokeCommand } from "@aws-sdk/client-lambda";
import { fromCognitoIdentityPool } from "@aws-sdk/credential-providers";

const credentials = fromCognitoIdentityPool({
  identityPoolId: "us-east-1:be3da380-d032-46f4-b4a2-85846a61bc52",
  clientConfig: { region: "us-east-1" },
});

const lambda = new LambdaClient({ region: "us-east-1", credentials });

async function callAnalyst(resumeText, jobPostingText) {
  const resp = await lambda.send(new InvokeCommand({
    FunctionName: "mock-interview-analyst",
    Payload: JSON.stringify({ resume_text: resumeText, job_posting_text: jobPostingText }),
  }));
  const result = JSON.parse(new TextDecoder().decode(resp.Payload));
  const body = JSON.parse(result.body);
  if (body.status === "success") return body.data; // this is analyst_output
  throw new Error(body.error);
}
```

## Step 2: Call Interviewer Lambda

```javascript
async function callInterviewer(analystOutput) {
  const resp = await lambda.send(new InvokeCommand({
    FunctionName: "mock-interview-interviewer",
    Payload: JSON.stringify({ analyst_output: analystOutput }),
  }));
  const result = JSON.parse(new TextDecoder().decode(resp.Payload));
  const body = JSON.parse(result.body);
  if (body.success) return body.runtime_context; // string for Nova Sonic
  throw new Error(body.error_message);
}
```

## Step 3: Connect to Nova Sonic (Direct WebSocket via Cognito)

The Bedrock SDK handles WebSocket signing internally.

```javascript
import { BedrockRuntimeClient, InvokeModelWithBidirectionalStreamCommand } from "@aws-sdk/client-bedrock-runtime";

const bedrockClient = new BedrockRuntimeClient({
  region: "us-east-1",
  credentials,
});

// Open bidirectional stream
const command = new InvokeModelWithBidirectionalStreamCommand({
  modelId: "amazon.nova-2-sonic-v1:0",
});
const response = await bedrockClient.send(command);

// Send events through response.body (AsyncIterable)
// Receive events through the stream
```

### Nova Sonic Event Sequence

After connecting, send these events as JSON through the stream:

```javascript
// 1. Session start
{ event: { sessionStart: { inferenceConfiguration: { maxTokens: 1024, topP: 0.9, temperature: 0.7 }, turnDetectionConfiguration: { endpointingSensitivity: "HIGH" } } } }

// 2. Prompt start
{ event: { promptStart: { promptName: "<uuid>", textOutputConfiguration: { mediaType: "text/plain" }, audioOutputConfiguration: { mediaType: "audio/lpcm", sampleRateHertz: 24000, sampleSizeBits: 16, channelCount: 1, voiceId: "matthew", encoding: "base64", audioType: "SPEECH" } } } }

// 3. System instruction (send runtime_context)
{ event: { contentStart: { promptName: "<uuid>", contentName: "<uuid>", type: "TEXT", interactive: true, role: "SYSTEM", textInputConfiguration: { mediaType: "text/plain" } } } }
{ event: { textInput: { promptName: "<uuid>", contentName: "<uuid>", content: runtimeContext } } }
{ event: { contentEnd: { promptName: "<uuid>", contentName: "<uuid>" } } }

// 4. Trigger Nova to speak first (send silence + end turn)
{ event: { contentStart: { promptName: "<uuid>", contentName: "<uuid2>", type: "AUDIO", interactive: true, role: "USER", audioInputConfiguration: { mediaType: "audio/lpcm", sampleRateHertz: 16000, sampleSizeBits: 16, channelCount: 1, audioType: "SPEECH", encoding: "base64" } } } }
// Send 500ms of silence as base64
{ event: { audioInput: { promptName: "<uuid>", contentName: "<uuid2>", content: "<base64 silence>" } } }
{ event: { contentEnd: { promptName: "<uuid>", contentName: "<uuid2>" } } }

// Nova will now speak the first question!
```

### Streaming User Audio

```javascript
// For each user turn:
// 1. contentStart (role: USER, type: AUDIO)
// 2. audioInput events every 50-100ms (PCM 16kHz 16-bit mono, base64)
// 3. contentEnd (after Nova detects end of turn via endpointing)
```

### Receiving Nova Responses

Listen for these events from the stream:
- `textOutput` → transcript text (question or ASR of user speech)
- `audioOutput` → base64 PCM audio at 24kHz to play
- `contentStart` → check `role` (ASSISTANT or USER)
- `contentEnd` → turn boundary

### End Session

```javascript
{ event: { promptEnd: { promptName: "<uuid>" } } }
{ event: { sessionEnd: {} } }
```

## Step 4: Call Evaluator Lambda

After interview ends, send analyst_output + conversation:

```javascript
async function callEvaluator(analystOutput, conversation, metadata) {
  const resp = await lambda.send(new InvokeCommand({
    FunctionName: "mock-interview-evaluator",
    Payload: JSON.stringify({
      body: JSON.stringify({
        analyst_output: analystOutput,
        conversation: conversation,
        interview_metadata: metadata,
      })
    }),
  }));
  const result = JSON.parse(new TextDecoder().decode(resp.Payload));
  const body = JSON.parse(result.body);
  return body; // contains readiness_label, per_question_scores, strengths, improvements, etc.
}
```

### Conversation Format

```javascript
const conversation = [
  { point_id: "point_1", turn_type: "main_question", question: "...", answer: "..." },
  { point_id: "point_1", turn_type: "follow_up", question: "...", answer: "..." },
  { point_id: "point_2", turn_type: "main_question", question: "...", answer: "..." },
  { point_id: "point_2", turn_type: "follow_up", question: "...", answer: "..." },
  { point_id: "point_3", turn_type: "main_question", question: "...", answer: "..." },
  { point_id: "point_3", turn_type: "follow_up", question: "...", answer: "..." },
];

const metadata = {
  candidate_level: analystOutput.candidate_profile.candidate_level,
  target_role: analystOutput.target_role.title,
  status: "completed", // or "ended_early"
  completion_reason: "all_questions_completed", // or "user_ended_early"
  main_questions_completed: 3,
  follow_ups_completed: 3,
  ended_early: false,
};
```

## Audio Facts

| | Input (mic → Nova) | Output (Nova → speakers) |
|---|---|---|
| Format | PCM 16-bit | PCM 16-bit |
| Sample rate | 16,000 Hz | 24,000 Hz |
| Channels | Mono | Mono |
| Encoding | base64 | base64 |

## Interview Format

- 3 main questions + 1 follow-up each = max 6 answers
- Nova speaks first (triggered by silence turn)
- 8-minute session limit
- "End Interview" button always visible
- Nova handles turn detection (endpointing) — no silence detection needed in frontend
