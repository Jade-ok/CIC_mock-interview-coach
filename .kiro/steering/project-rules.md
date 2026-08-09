# Project Rules

> Active guidance. Last verified against the repository: 2026-08-08.

Shared conventions for the mock interview application. When this file and an older task record disagree, current code, `schemas/`, and `infrastructure/lib/infra-stack.ts` are the source of truth.

## Runtime and Language

- Lambda runtime: Python 3.12. Use `python3` in commands.
- Use plain dictionaries rather than Pydantic models.
- Lambda provides `boto3`; do not bundle it.
- Only the PDF Parser needs a bundled third-party runtime dependency (`pypdf`). CDK installs it into that Lambda asset.

## Models and Services

Agents use the service appropriate to their role. Analyst and Evaluator intentionally share GPT OSS 120B.

| Component | Model / Service |
|---|---|
| Analyst | Bedrock Mantle Chat Completions — `openai.gpt-oss-120b` |
| Interviewer context builder | Lambda + S3; no model call |
| Voice interviewer | Python relay on AgentCore Runtime + `amazon.nova-2-sonic-v1:0` |
| Evaluator | Bedrock Mantle Chat Completions — `openai.gpt-oss-120b` |
| PDF Parser | `pypdf`; no model call |

All AWS runtime components use `us-east-1` unless an explicit deployment configuration says otherwise. Analyst and Evaluator use forced function calls for structured Bedrock output. Their retry behavior is implementation-specific; do not assume every invalid response is retried identically.

## Current Implementation

- The React/Vite frontend owns navigation, UI state, uploaded content, the complete Analyst output, and the interview transcript for the active session.
- There is no persistent application database or server-side session store.
- One CloudFront API gateway routes to five private IAM-protected Function URLs for PDF Parser, Analyst, Interviewer, Evaluator, and voice-session signing.
- CDK uploads `backend/config/interview_structure.json` and `backend/config/student_interview_profile.json`; the Interviewer reads the resulting S3 object keys and returns a runtime-context string.
- `backend/voice_agent/` contains the FastAPI/Python WebSocket relay, container assets, and current `@aws/agentcore` CLI/CDK configuration. Account- and runtime-specific deployment state stays in ignored local files.
- The frontend defaults to strict local mode: four HTTP routes under `http://localhost:8080/api` and voice at `ws://localhost:8080/`. `VITE_USE_MOCK_WEBSOCKET=true` opts into the development mock.
- Local development runs `backend.local_server:app`. PDF parsing and interview configuration use repository files; Analyst, Evaluator, and Nova use the developer's active AWS credentials. Hosted mode selects its environment-configured endpoints with `VITE_RUNTIME_MODE=hosted`. AWS credentials must never enter `VITE_*` variables.
- `backend/voice_agent/protocol.py` translates the shared browser `{type, payload}` contract to and from Nova events. The adapter has focused unit coverage and is deployed behind the hosted signed-session path.
- The current architecture does not use a Cognito identity pool or direct browser-to-Bedrock access.
- AgentCore uses AWS IAM/SigV4. In hosted mode, the voice-session Lambda signs five-minute WebSocket URLs with a role scoped to the configured runtime. `.bedrock_agentcore.yaml` remains ignored legacy configuration and is not the canonical deployment path.
- The application intentionally has no end-user login. The browser calls one CloudFront API base URL; Origin Access Control signs requests to the five `AWS_IAM` Function URL origins, so direct anonymous Function URL calls are rejected. CORS allows the configured Amplify origin and local Vite origin. Hosted frontend releases are built and published to the existing Amplify app by GitHub Actions; `amplify.yml` remains the repository's Amplify monorepo build definition rather than the active release mechanism.

## Hosted Architecture

- Amplify, AgentCore, Lambda, S3, and Bedrock access reside in one AWS account. Account-specific identifiers and generated infrastructure state remain outside version control.
- AWS Amplify Hosting serves the React/Vite frontend.
- The browser requests a short-lived signed `wss://` URL from the voice-session Lambda before opening Amazon Bedrock AgentCore Runtime. It does not receive permanent AWS credentials or call Bedrock directly.
- The Python voice relay runs in AgentCore Runtime. AgentCore is a serverless, AWS-managed container runtime, not an EC2 server maintained by this project.
- The relay translates the agreed browser protocol, maintains connection-scoped state, and invokes `amazon.nova-2-sonic-v1:0` through Bedrock's bidirectional streaming API.
- PDF parsing, Analyst, Interviewer context building, and Evaluator work remain in four pipeline Lambda functions. A fifth Lambda signs voice-session URLs. S3 stores the deployed interview configuration; object versioning is not enabled. CDK is the source of truth for backend infrastructure.
- The deployed no-login design exposes one CloudFront gateway while keeping all five Function URLs private behind OAC. The stack reduces exposure with one 55-second hosted model attempt, invocation/error/throttle alarms, an email-backed AWS cost budget, hosted model/session limits, and an emergency switch that sets function concurrency to zero. Optional normal concurrency caps default off until the account quota supports them.

The hosted Amplify, Lambda/S3, and AgentCore boundaries are deployed. Remaining operational work is to monitor the implemented cost controls, consider stronger request-level abuse protection if traffic grows, and verify reconnection, interruption, and shutdown edge cases whenever the voice path changes.

## Automated Delivery

- Pushes to `main` use path-filtered GitHub Actions workflows. Application changes run frontend/backend checks, reject stale revisions, deploy `MockInterviewStack`, then build and publish the matching React/Vite revision through the Amplify manual deployment API. Voice-relay changes test and deploy the existing AgentCore target separately; both release paths reject stale revisions and share the production concurrency group.
- GitHub Actions obtains temporary AWS credentials through OIDC. The AWS trust is restricted to the immutable repository owner/repository identity and `refs/heads/main`; long-lived AWS access keys are not stored in GitHub.
- Repository variables provide the deployment-role ARN and Amplify app identifier. These are identifiers, not application secrets, and their account-specific values must not be committed to documentation or source.

## Contracts and Configuration

Canonical inter-component payload definitions live in `schemas/`:

| File | Purpose |
|---|---|
| `schemas/analyst_output.json` | Descriptive Analyst output shape |
| `schemas/interviewer_output.json` | Descriptive completed-interview payload sent to the Evaluator |
| `schemas/evaluator_output.json` | Descriptive Evaluator response shape |

Runtime interview configuration lives in `backend/config/` and is uploaded to S3 by CDK. Configuration files are not inter-agent contracts.

The frontend and PDF Parser both enforce a 4 MB PDF limit so oversized files are rejected before upload.

Known operational gaps must not be documented as completed behavior:

- The three-main-question/three-follow-up sequence is model-directed and is not yet enforced by an application-side state machine.
- Reconnection and full interruption/shutdown edge cases still require live regression checks when the voice protocol changes.
- The no-login hosted design intentionally exposes one CloudFront API gateway. Private Function URLs, OAC signing, exact browser origins, one 55-second model attempt, alarms, an AWS cost budget, hosted text/output/session caps, and the emergency switch are implemented; optional normal concurrency caps require sufficient account quota, and stronger request-level abuse controls remain future hardening.
- Hosted-only guardrails must be gated by `HOSTED_GUARDRAILS_ENABLED=true`. Pure local execution retains the 8,192-token model output budget and has no application-imposed eight-minute voice limit.

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
