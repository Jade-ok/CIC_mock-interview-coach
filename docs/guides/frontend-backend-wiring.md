# Implementation Plan: Wiring the Frontend to the CDK Backend

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│  Browser (frontend/)                                                │
│                                                                     │
│  Upload PDF ──► pdf_parser URL ──► resume_text + job_posting_text   │
│       │                                                             │
│       ▼                                                             │
│  Analyst call ──► analyst URL ──► analyst_output (JSON)             │
│       │                                                             │
│       ▼                                                             │
│  Interviewer call ──► interviewer URL ──► runtime_context           │
│       │                                                             │
│       ▼                                                             │
│  Nova Sonic WebSocket ◄──► live interview (speech-to-speech)        │
│       │                                                             │
│       ▼                                                             │
│  Evaluator call ──► evaluator URL ──► evaluation results            │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

The frontend holds all state. No API Gateway, no database. Each Lambda is called directly via its Function URL.

---

## Phase 1: Environment Configuration

### 1.1 Generate `.env` from CDK outputs

After `npx cdk deploy`, CDK prints all Function URLs. Store them in `frontend/.env`:

```env
VITE_PDF_PARSER_URL=https://xxxxxx.lambda-url.us-east-1.on.aws/
VITE_ANALYST_URL=https://xxxxxx.lambda-url.us-east-1.on.aws/
VITE_INTERVIEWER_URL=https://xxxxxx.lambda-url.us-east-1.on.aws/
VITE_EVALUATOR_URL=https://xxxxxx.lambda-url.us-east-1.on.aws/
```

> Use `VITE_` prefix if using Vite, `REACT_APP_` for CRA, or `NEXT_PUBLIC_` for Next.js.

### 1.2 Automate with a post-deploy script (optional)

```bash
# scripts/sync-env.sh
STACK_NAME="MockInterviewStack"
REGION="us-east-1"

get_output() {
  aws cloudformation describe-stacks \
    --stack-name $STACK_NAME --region $REGION \
    --query "Stacks[0].Outputs[?OutputKey=='$1'].OutputValue" \
    --output text
}

cat > frontend/.env << EOF
VITE_PDF_PARSER_URL=$(get_output PdfParserUrl)
VITE_ANALYST_URL=$(get_output AnalystUrl)
VITE_INTERVIEWER_URL=$(get_output InterviewerUrl)
VITE_EVALUATOR_URL=$(get_output EvaluatorUrl)
EOF
```

---

## Phase 2: API Client Layer

Create a shared API client module in the frontend that handles all Lambda calls.

### 2.1 File: `frontend/src/api/config.ts`

```typescript
export const API_URLS = {
  pdfParser: import.meta.env.VITE_PDF_PARSER_URL,
  analyst: import.meta.env.VITE_ANALYST_URL,
  interviewer: import.meta.env.VITE_INTERVIEWER_URL,
  evaluator: import.meta.env.VITE_EVALUATOR_URL,
} as const;
```

### 2.2 File: `frontend/src/api/client.ts`

Shared `callLambda` function that:
- POSTs JSON to the Function URL
- Sends the body as a JSON string (Function URL mode: Lambda receives `{"body": "<JSON string>"}`)
- Parses the response envelope (`{status, data}` or `{status, error}`)
- Throws on network error or `status: "error"` response

```typescript
export async function callLambda<T>(url: string, payload: object): Promise<T> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  const envelope = await response.json();

  if (envelope.status === 'error') {
    throw new Error(envelope.error);
  }

  return envelope.data as T;
}
```

### 2.3 File: `frontend/src/api/endpoints.ts`

Type-safe wrappers for each Lambda:

```typescript
import { callLambda } from './client';
import { API_URLS } from './config';

// --- PDF Parser ---
export interface ParseDocumentsRequest {
  resume?: { content: string; format: 'pdf' };
  job_posting?: { content: string; format: 'pdf' | 'text' };
}

export interface ParseDocumentsResponse {
  resume_text?: string;
  job_posting_text?: string;
  errors?: Array<{ document: string; error: string }>;
}

export function parseDocuments(req: ParseDocumentsRequest) {
  return callLambda<ParseDocumentsResponse>(API_URLS.pdfParser, req);
}

// --- Analyst ---
export interface AnalystRequest {
  resume_text: string;
  job_posting_text: string;
}

// AnalystOutput matches contracts/analyst_output.json
export interface AnalystOutput { /* ... full type from schema ... */ }

export function analyzeResume(req: AnalystRequest) {
  return callLambda<AnalystOutput>(API_URLS.analyst, req);
}

// --- Interviewer (context builder) ---
export interface InterviewerRequest {
  analyst_output: AnalystOutput;
}

export interface RuntimeContext {
  system_instruction: string;
  // Nova Sonic config returned by the interviewer
}

export function buildInterviewContext(req: InterviewerRequest) {
  return callLambda<RuntimeContext>(API_URLS.interviewer, req);
}

// --- Evaluator ---
export interface EvaluatorRequest {
  analyst_output: AnalystOutput;
  transcript: Array<{ role: string; content: string }>;
}

export interface EvaluationResult { /* scoring output */ }

export function evaluateInterview(req: EvaluatorRequest) {
  return callLambda<EvaluationResult>(API_URLS.evaluator, req);
}

```

---

## Phase 3: Frontend Flow (Page by Page)

### 3.1 Upload Page

| Step | Action | Lambda |
|------|--------|--------|
| 1 | User uploads resume PDF + pastes/uploads job posting | — |
| 2 | Convert PDF to base64 (`FileReader.readAsDataURL`) | — |
| 3 | Validate file size < 4 MB client-side | — |
| 4 | Call `parseDocuments(...)` | pdf_parser |
| 5 | Store `resume_text` + `job_posting_text` in app state | — |

### 3.2 Analysis Page

| Step | Action | Lambda |
|------|--------|--------|
| 1 | Call `analyzeResume({ resume_text, job_posting_text })` | analyst |
| 2 | Show loading spinner (Bedrock can take 10-20s) | — |
| 3 | Display analyst_output summary to user (skills, alignment, plan) | — |
| 4 | Store full `analyst_output` in app state | — |

### 3.3 Interview Prep Page

| Step | Action | Lambda |
|------|--------|--------|
| 1 | Call `buildInterviewContext({ analyst_output })` | interviewer |
| 2 | Receive `runtime_context` (system instruction for Nova Sonic) | — |
| 3 | Store `runtime_context` in app state | — |
| 4 | Show interview configuration / ready screen | — |

### 3.4 Live Interview Page (Nova Sonic WebSocket)

| Step | Action | Service |
|------|--------|---------|
| 1 | Open WebSocket to Nova Sonic using `runtime_context.system_instruction` | Nova Sonic |
| 2 | Stream microphone audio to Nova Sonic | Nova Sonic |
| 3 | Receive audio responses from Nova Sonic, play in real-time | Nova Sonic |
| 4 | Accumulate Q&A transcript in app state | — |
| 5 | On interview end, close WebSocket | — |

### 3.5 Evaluation Page

| Step | Action | Lambda |
|------|--------|--------|
| 1 | Call `evaluateInterview({ analyst_output, transcript })` | evaluator |
| 2 | Show loading spinner | — |
| 3 | Display evaluation results (scores, feedback) | — |

---

## Phase 4: State Management

The browser holds all state. Recommended shape:

```typescript
interface AppState {
  // From upload
  resumeBase64: string | null;
  jobPostingContent: string | null;

  // From pdf_parser
  resumeText: string | null;
  jobPostingText: string | null;

  // From analyst
  analystOutput: AnalystOutput | null;

  // From interviewer
  runtimeContext: RuntimeContext | null;

  // During interview
  transcript: Array<{ role: string; content: string }>;

  // From evaluator
  evaluationResult: EvaluationResult | null;

  // UI
  currentStep: 'upload' | 'analysis' | 'prep' | 'interview' | 'evaluation';
  loading: boolean;
  error: string | null;
}
```

Use React Context, Zustand, or simple `useState` — no backend persistence needed.

---

## Phase 5: Error Handling

### 5.1 Network errors

- Wrap all `callLambda` calls in try/catch
- Show user-friendly error message + retry button
- Common issues: CORS (fix Function URL config, not code), 403 (check AWS credentials are not expired), timeout

### 5.2 Lambda response errors

- All Lambdas return `{"status": "error", "error": "message"}` on failure
- Surface the `error` string to the user
- For analyst/evaluator, offer a retry since Bedrock calls can intermittently fail

### 5.3 Client-side validation

- PDF size < 4 MB before sending
- Resume required, job posting required
- Trim trailing whitespace from URLs in `.env` (known 403 cause)

---

## Phase 6: Nova Sonic WebSocket Integration

This is the most complex piece. The frontend connects directly to Nova Sonic — the interviewer Lambda only builds the context.

### 6.1 Connection setup

```typescript
// Pseudocode — actual Nova Sonic SDK may differ
const ws = new WebSocket(NOVA_SONIC_ENDPOINT);

ws.onopen = () => {
  // Send session config with system instruction from runtime_context
  ws.send(JSON.stringify({
    type: 'session.config',
    system_instruction: runtimeContext.system_instruction,
  }));
};
```

### 6.2 Audio streaming

- Use `MediaRecorder` or Web Audio API to capture microphone
- Stream audio chunks to WebSocket
- Receive audio response chunks and play via `AudioContext`
- Track transcript (Nova Sonic returns text alongside audio)

### 6.3 Session end

- User clicks "End Interview" or Nova Sonic signals completion
- Close WebSocket
- Final transcript is ready for the evaluator

---

## Phase 7: Deployment Checklist

| Item | Status |
|------|--------|
| `npx cdk bootstrap` run once per account | ☐ |
| `npx cdk deploy` successful | ☐ |
| All 5 Function URLs accessible (curl test) | ☐ |
| `.env` populated with correct URLs (no trailing whitespace) | ☐ |
| CORS working (test from browser console with `fetch`) | ☐ |
| pdf_parser handles 4 MB PDF without timeout | ☐ |
| analyst returns valid `analyst_output.json` schema | ☐ |
| interviewer returns runtime_context with system_instruction | ☐ |
| Nova Sonic WebSocket connects with runtime_context | ☐ |
| evaluator returns scores given analyst_output + transcript | ☐ |

---

## Key Gotchas (from project rules)

1. **CORS is on the Function URL config** — already set in CDK. If you see CORS errors, check the CDK `corsOptions`, not your Python code.
2. **403 needs two permissions** — CDK handles both `lambda:InvokeFunctionUrl` and `lambda:InvokeFunction` automatically with `authType: NONE`.
3. **Trailing whitespace in `.env`** — causes silent 403. Trim URLs.
4. **6 MiB payload limit** — PDF upload capped at 4 MB client-side.
5. **No API Gateway** — all calls go directly to Function URLs. No `/stage/` prefix in paths.
6. **Stateless** — if the user refreshes, state is lost. Consider `sessionStorage` for persistence across page navigations within a session.
