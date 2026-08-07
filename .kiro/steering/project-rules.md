# Project Rules

> Active guidance. Last verified against the repository: 2026-08-07.

Shared conventions for the mock interview application. When this file and an older task record disagree, current code, `schemas/`, and `infrastructure/lib/infra-stack.ts` are the source of truth.

## Runtime and Language

- Lambda runtime: Python 3.12. Use `python3` in commands.
- Use plain dictionaries rather than Pydantic models.
- Lambda provides `boto3`; do not bundle it.
- Only the PDF Parser needs a bundled third-party runtime dependency (`pypdf`). CDK installs it into that Lambda asset.

## Models and Services

Agents use the service appropriate to their role. Analyst and Evaluator intentionally share Sonnet 4.6.

| Component | Model / Service |
|---|---|
| Analyst | Bedrock Converse API — `global.anthropic.claude-sonnet-4-6` |
| Interviewer context builder | Lambda + S3; no model call |
| Voice interviewer | Python relay on AgentCore Runtime + `amazon.nova-2-sonic-v1:0` |
| Evaluator | Bedrock Converse API — `global.anthropic.claude-sonnet-4-6` |
| PDF Parser | `pypdf`; no model call |

All AWS runtime components use `us-east-1` unless an explicit deployment configuration says otherwise. Analyst and Evaluator use forced tool use for structured Bedrock output. Their retry behavior is implementation-specific; do not assume every invalid response is retried identically.

## Current Implementation

- The React/Vite frontend owns navigation, UI state, uploaded content, the complete Analyst output, and the interview transcript for the active session.
- There is no persistent application database or server-side session store.
- Four Lambda Function URLs expose PDF Parser, Analyst, Interviewer, and Evaluator.
- CDK uploads `backend/config/interview_structure.json` and `backend/config/student_interview_profile.json`; the Interviewer reads the resulting S3 object keys and returns a runtime-context string.
- `backend/voice_agent/` contains the FastAPI/Python WebSocket relay, container assets, and current `@aws/agentcore` CLI/CDK configuration. Account- and runtime-specific deployment state stays in ignored local files.
- The frontend defaults to strict local mode: four HTTP routes under `http://localhost:8080/api` and voice at `ws://localhost:8080/`. `VITE_USE_MOCK_WEBSOCKET=true` opts into the development mock.
- Local development runs `backend.local_server:app`. PDF parsing and interview configuration use repository files; Analyst, Evaluator, and Nova use the developer's active AWS credentials. Hosted mode selects its environment-configured endpoints with `VITE_RUNTIME_MODE=hosted`. AWS credentials must never enter `VITE_*` variables.
- `backend/voice_agent/protocol.py` translates the shared browser `{type, payload}` contract to and from Nova events. The adapter is unit-tested, but a live browser/Nova session remains unverified.
- The current architecture does not use a Cognito identity pool or direct browser-to-Bedrock access.
- AgentCore configuration currently uses AWS IAM/SigV4 for CLI-driven testing. Browser-compatible Cognito/OIDC JWT authorization is not implemented yet. `.bedrock_agentcore.yaml` remains ignored legacy configuration and is not the canonical deployment path.
- Frontend hosting and Amplify authentication are not provisioned in this repository. The Lambda Function URLs currently use public `NONE` authentication and permissive CORS.

## Hosted Architecture

- Amplify, AgentCore, Lambda, S3, and Bedrock access reside in one AWS account. Account-specific identifiers and generated infrastructure state remain outside version control.
- AWS Amplify Hosting serves the React/Vite frontend.
- Browser sessions authenticate before opening the hosted WebSocket. The browser connects over authenticated `wss://` to Amazon Bedrock AgentCore Runtime; it does not receive permanent AWS credentials or call Bedrock directly.
- The Python voice relay runs in AgentCore Runtime. AgentCore is a serverless, AWS-managed container runtime, not an EC2 server maintained by this project.
- The relay translates the agreed browser protocol, maintains connection-scoped state, and invokes `amazon.nova-2-sonic-v1:0` through Bedrock's bidirectional streaming API.
- PDF parsing, Analyst, Interviewer context building, and Evaluator work remain in the four Lambda functions. S3 stores versioned interview configuration, and CDK is the source of truth for backend infrastructure.
- Lambda endpoints require access control before a public launch; Amplify hosting alone does not secure their current public Function URLs.

Hosted environments require Amplify hosting, browser authentication, an authenticated AgentCore endpoint, protected Lambda access, and end-to-end verification.

## Contracts and Configuration

Canonical inter-component payload definitions live in `schemas/`:

| File | Purpose |
|---|---|
| `schemas/analyst_output.json` | Descriptive Analyst output shape |
| `schemas/interviewer_output.json` | Descriptive completed-interview payload sent to the Evaluator |
| `schemas/evaluator_output.json` | Descriptive Evaluator response shape |

Runtime interview configuration lives in `backend/config/` and is uploaded to S3 by CDK. Configuration files are not inter-agent contracts.

The frontend and PDF Parser both enforce a 4 MB PDF limit so oversized files are rejected before upload.

Known integration gaps must not be documented as working behavior:

- A hosted AgentCore runtime, authenticated WebSocket handshake, and paid Nova 2 Sonic conversation still require end-to-end verification in the chosen deployment environment.
- Hosted frontend configuration includes the authenticated AgentCore WebSocket endpoint.
- Current AgentCore CLI/CDK configuration is tracked and uses AWS IAM authorization; Cognito/OIDC custom-JWT settings and frontend token handling remain unimplemented.
- Amplify Hosting and its authentication configuration are not represented in the current CDK stack or frontend configuration.
- All four Lambda Function URLs currently use unauthenticated public access and `*` CORS; they require an explicit protection plan before public deployment.

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

CORS and Function URL configuration are defined in CDK so hosted infrastructure remains reproducible.

## Local Testing

- Run Python tests from the repository root with `.venv/bin/pytest` (or `python3 -m pytest` in an equivalent environment).
- Run frontend and infrastructure commands from their respective directories.
- Function URL requests are limited to 6 MiB. Base64 increases upload size, and the backend PDF validation limit is 4 MB.
