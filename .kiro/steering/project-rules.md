# Project Rules

> Active guidance. Last verified against the repository: 2026-08-07.

Shared conventions for the mock interview application. When this file and an older task record disagree, current code, `schemas/`, and `infrastructure/lib/infra-stack.ts` are the source of truth.

## Runtime and Language

- Lambda runtime: Python 3.12. Use `python3` in commands.
- Use plain dictionaries rather than Pydantic models.
- Lambda provides `boto3`; do not bundle it.
- Only the PDF Parser needs a bundled third-party runtime dependency (`pypdf`). CDK installs it into that Lambda asset.

## Models and Services

Agents use the service appropriate to their role. Analyst and Evaluator intentionally share Sonnet 5.

| Component | Model / Service |
|---|---|
| Analyst | Bedrock Converse API — `global.anthropic.claude-sonnet-5` |
| Interviewer context builder | Lambda + S3; no model call |
| Voice interviewer | Python relay on AgentCore Runtime + `amazon.nova-2-sonic-v1:0` |
| Evaluator | Bedrock Converse API — `global.anthropic.claude-sonnet-5` |
| PDF Parser | `pypdf`; no model call |

All AWS runtime components use `us-east-1` unless an explicit deployment configuration says otherwise. Analyst and Evaluator use forced tool use for structured Bedrock output. Their retry behavior is implementation-specific; do not assume every invalid response is retried identically.

## Current Implementation

- The React/Vite frontend owns navigation, UI state, uploaded content, the complete Analyst output, and the interview transcript for the active session.
- There is no persistent application database or server-side session store.
- Four Lambda Function URLs expose PDF Parser, Analyst, Interviewer, and Evaluator.
- CDK uploads `backend/config/interview_structure.json` and `backend/config/student_interview_profile.json`; the Interviewer reads the resulting S3 object keys and returns a runtime-context string.
- `backend/voice_agent/` contains a FastAPI/Python WebSocket relay and AgentCore container configuration. The relay opens the Nova 2 Sonic bidirectional stream and holds transient state and queues only for the lifetime of a voice connection.
- The frontend uses the real relay by default and reads `VITE_VOICE_WS_URL`, falling back to `ws://localhost:8080/` for local work. `VITE_USE_MOCK_WEBSOCKET=true` opts into the development mock.
- `backend/voice_agent/protocol.py` translates the shared browser `{type, payload}` contract to and from Nova events. The adapter is unit-tested, but a live browser/Nova session remains unverified.
- The current architecture does not use a Cognito identity pool or direct browser-to-Bedrock access.
- AgentCore authentication is not configured: `.bedrock_agentcore.yaml` currently has no authorizer or OAuth configuration.
- Frontend hosting and Amplify authentication are not provisioned in this repository. The Lambda Function URLs currently use public `NONE` authentication and permissive CORS.

## Target Deployment Architecture

- Host the React/Vite frontend with AWS Amplify Hosting.
- Authenticate users before the browser opens the production WebSocket. The browser connects over authenticated `wss://` to Amazon Bedrock AgentCore Runtime; it does not receive permanent AWS credentials or call Bedrock directly.
- Run the Python voice relay in AgentCore Runtime. AgentCore is a serverless, AWS-managed container runtime, not an EC2 server maintained by this project.
- The relay translates the agreed browser protocol, maintains connection-scoped state, and invokes `amazon.nova-2-sonic-v1:0` through Bedrock's bidirectional streaming API.
- Keep PDF parsing, Analyst, Interviewer context building, and Evaluator work in the four Lambda functions. S3 remains the store for versioned interview configuration, and CDK remains the source of truth for backend infrastructure.
- Add access control for the Lambda endpoints before a public launch; Amplify hosting alone does not secure their current public Function URLs.

Do not describe the target architecture as deployed until Amplify hosting/authentication, an authenticated AgentCore endpoint, deployment environment configuration, protected Lambda access, and the complete flow are verified end to end.

## Contracts and Configuration

Canonical inter-component payload definitions live in `schemas/`:

| File | Purpose |
|---|---|
| `schemas/analyst_output.json` | Descriptive Analyst output shape |
| `schemas/interviewer_output.json` | Descriptive completed-interview payload sent to the Evaluator |
| `schemas/evaluator_output.json` | Descriptive Evaluator response shape |

Runtime interview configuration lives in `backend/config/` and is uploaded to S3 by CDK. Configuration files are not inter-agent contracts.

Known integration gaps must not be documented as working behavior:

- The browser/relay adapter is not yet verified against a live Nova 2 Sonic session.
- The deployed AgentCore endpoint still needs to be supplied as `VITE_VOICE_WS_URL` in Amplify.
- The AgentCore configuration does not yet define an authorizer or OAuth settings, so the planned authenticated browser connection is not implemented.
- Amplify Hosting and its authentication configuration are not represented in the current CDK stack or frontend configuration.
- All four Lambda Function URLs currently use unauthenticated public access and `*` CORS; they require an explicit protection plan before public deployment.
- The frontend retains its existing 10 MB PDF limit while the backend rejects decoded PDFs above 4 MB. Do not change either limit without an explicit product decision.

## Function Layouts

The current functions intentionally have different internal shapes:

```text
backend/functions/
  analyst/       handler, orchestrator, validation, prompt, Bedrock client, parser
  evaluator/     lambda_handler, validator, prompt, Bedrock client, scorer,
                 response assembler, schemas, exceptions
  interviewer/   handler, validation, S3 config loader, context builder
  pdf_parser/    handler, validation, orchestrator, parser
```

Do not force a shared filename convention during unrelated changes. CDK handler settings must match the file placed at each Lambda asset root.

## Invocation Modes

| Function | Supported input |
|---|---|
| Analyst | Direct payload and Function URL event body |
| Interviewer | Direct payload and Function URL event body |
| PDF Parser | Direct payload and Function URL event body |
| Evaluator | Function URL event body only |

CORS and Function URL configuration are managed in CDK. Update `infrastructure/lib/infra-stack.ts`, not the AWS console, so deployed state remains reproducible.

## Deployment and Testing

- CDK is canonical for the four Lambdas and interview-config bucket.
- AgentCore deployment is separate and runs from `backend/voice_agent/`.
- Amplify Hosting is the chosen frontend deployment target, but its hosting and authentication resources are not yet configured in this repository.
- A production frontend must obtain its Lambda endpoints and authenticated AgentCore `wss://` endpoint through deployment environment configuration; never commit account-specific URLs or credentials.
- `scripts/deploy.sh` is a targeted/manual workflow for the Interviewer and voice relay; it is not a full replacement for CDK.
- The Evaluator SAM template is a standalone development/deployment option and creates resources separately from the CDK stack.
- Run Python tests from the repository root with `.venv/bin/pytest` (or `python3 -m pytest` in an equivalent environment).
- Run frontend and infrastructure commands from their respective directories.
- Function URL requests are limited to 6 MiB. Base64 increases upload size, and the backend PDF validation limit is 4 MB.
