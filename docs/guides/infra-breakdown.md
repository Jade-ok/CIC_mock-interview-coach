# Infrastructure Breakdown

How the CDK project works, how it connects to the backend Lambdas and frontend, and how it fits the deployed Amplify/AgentCore architecture.

---

## Folder Structure

```
infrastructure/
├── bin/
│   ├── infra.ts            # Application backend stack entry point
│   └── deployment-automation.ts # GitHub OIDC automation entry point
├── lib/
│   ├── infra-stack.ts      # Five Lambdas and S3 configuration
│   └── deployment-automation-stack.ts # GitHub Actions IAM/OIDC resources
├── cdk.json                # CDK CLI configuration (app command, feature flags)
├── package.json            # Node dependencies (aws-cdk-lib, constructs, dev tools)
├── tsconfig.json           # TypeScript compiler settings
└── cdk.out/                # Synthesized CloudFormation output (auto-generated)
```

---

## How CDK Works in This Project

### Entry Point (`bin/infra.ts`)

The CDK app is bootstrapped here. It creates a single stack named `MockInterviewStack` targeting `us-east-1`:

```ts
const app = new cdk.App();
new InfraStack(app, 'MockInterviewStack', {
  env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: 'us-east-1' },
});
```

`CDK_DEFAULT_ACCOUNT` is resolved from your AWS CLI profile at deploy time.

### Stack Definition (`lib/infra-stack.ts`)

One stack defines the HTTP backend and interview configuration. The AgentCore voice relay is a separate infrastructure boundary.

| Resource | Construct | Purpose |
|----------|-----------|---------|
| S3 Bucket | `InterviewConfigBucket` | Stores interview structure and interview profile JSON configs |
| Analyst Lambda | `AnalystFunction` | Calls Bedrock Mantle (GPT OSS 120B) to analyze the resume against the job description |
| Evaluator Lambda | `EvaluatorFunction` | Calls Bedrock Mantle (GPT OSS 120B) to score the candidate's interview transcript |
| Interviewer Lambda | `InterviewerFunction` | Reads config from S3, builds runtime context for Nova Sonic (no LLM call) |
| PDF Parser Lambda | `PdfParserFunction` | Extracts text from uploaded resumes using pypdf |
| Voice Session Lambda | `VoiceSessionFunction` | Creates five-minute signed AgentCore WebSocket URLs |

Every Lambda currently gets a **Function URL** with public `NONE` authentication for hosted operation. Local requests reach the same handler logic through `backend.local_server:app`. The application intentionally has no end-user login, so budgets, monitoring, scoped IAM roles, and appropriate service limits are important safeguards for the public endpoints.

The names above are CDK construct IDs. Because `functionName` is not set, CloudFormation generates the deployed physical Lambda names.

### Key Design Decisions

- **No API Gateway.** Function URLs provide the HTTP surface. CORS is configured on the URL resource itself (`allowedOrigins: ['*']`), not in Python code.
- **No VPC.** Lambdas run in the default VPC-less mode for simplicity.
- **Docker bundling for pypdf.** The PDF Parser uses CDK's `bundling` option to `pip install pypdf` into the deployment package at synth time.
- **IAM permissions are scoped by responsibility.** Analyst/Evaluator receive model-scoped Bedrock Mantle inference, Interviewer receives `s3:GetObject` through `grantRead`, and Voice Session can invoke only the configured AgentCore runtime and its endpoints.

---

## How Infra Connects to the Backend

The CDK stack references each Lambda's source code relative to the `infrastructure/` folder:

```
backend/functions/analyst/       → Analyst Lambda asset
backend/functions/evaluator/     → Evaluator Lambda asset
backend/functions/interviewer/   → Interviewer Lambda asset
backend/functions/pdf_parser/    → PDF Parser Lambda asset
backend/functions/voice_session/ → Voice Session Lambda asset
```

CDK creates filtered assets rather than blindly zipping each folder. Analyst and Interviewer exclude tests, `.env*`, caches, bytecode, and test events; Evaluator also excludes its README and standalone SAM files. PDF Parser builds a fresh asset containing installed `pypdf` plus its top-level Python modules. The `handler` property tells Lambda which Python function to invoke:

| Lambda | Handler Path | Meaning |
|--------|-------------|---------|
| Analyst | `handler.lambda_handler` | `backend/functions/analyst/handler.py` |
| Evaluator | `lambda_handler.handler` | `backend/functions/evaluator/lambda_handler.py` |
| Interviewer | `handler.lambda_handler` | `backend/functions/interviewer/handler.py` |
| PDF Parser | `handler.lambda_handler` | `backend/functions/pdf_parser/handler.py` |
| Voice Session | `handler.lambda_handler` | `backend/functions/voice_session/handler.py` |

### Environment Variables

The Interviewer Lambda receives `S3_BUCKET`, `INTERVIEW_STRUCTURE_KEY`, and
`INTERVIEW_PROFILE_KEY`. CDK uploads the JSON files from `backend/config/` to
that bucket during deployment.

The Voice Session Lambda receives the AgentCore runtime ARN and returns a fresh five-minute signed WebSocket URL. The ARN is infrastructure configuration, not a browser credential.

---

## How Infra Connects to the Frontend

The stack exposes hosted endpoint and configuration-bucket outputs. Local mode sends the same `POST` payloads to the adapter under `http://localhost:8080/api`.

Do not store secrets or permanent AWS credentials in `VITE_*` variables. Vite embeds those values into the public browser bundle.

## Infrastructure Boundaries

The complete target is intentionally split across managed services:

| Concern | Deployment target | Repository status |
|---------|-------------------|-------------------|
| React/Vite frontend | AWS Amplify Hosting | Deployed; published independently from the application CDK stack |
| Browser identity | No end-user login | Public client by design |
| PDF/Analyst/Interviewer/Evaluator HTTP backend | Lambda + S3 via the application CDK stack | Deployed; Function URLs are public |
| Signed voice-session broker | Voice Session Lambda | Deployed; signs five-minute AgentCore URLs |
| Real-time Python voice relay | Amazon Bedrock AgentCore Runtime | Deployed; runtime-specific state remains outside version control |
| Speech-to-speech model | Amazon Nova 2 Sonic through the relay | Active hosted and local integration |

AgentCore Runtime is a serverless managed container runtime, not a server that this project administers. It is used because the voice path needs a persistent WebSocket and bidirectional model stream. The public browser obtains a short-lived signed `wss://` URL from Voice Session rather than receiving permanent AWS credentials.

## Automated Updates

Three path-filtered GitHub Actions workflows respond to matching changes on `main`:

| Change area | Automated result |
|-------------|------------------|
| `frontend/**` | The frontend is built and the static output is published to Amplify |
| Lambda functions, configuration, schemas, or application infrastructure | Python and CDK checks run, then `MockInterviewStack` is updated |
| Voice relay runtime code | Relay tests run, then the existing AgentCore target is updated |

The workflows obtain short-lived AWS credentials through GitHub OIDC. The deployment role trust is restricted to this repository's `main` branch, and permanent AWS access keys are not stored in repository configuration.

---

## Local Development Gotchas

| Issue | Fix |
|-------|-----|
| Missing AWS identity at startup | Configure an AWS profile or temporary environment credentials, then confirm with `aws sts get-caller-identity`. |
| Model access error | Confirm the active AWS identity can invoke GPT OSS 120B and Nova 2 Sonic in `us-east-1`. |
| Python import error | Install `backend/requirements-local.txt` in the active virtual environment. |
| Port 8080 is already in use | Run `lsof -nP -iTCP:8080 -sTCP:LISTEN`, stop the previous local backend, and retry. The frontend is fixed to port 8080 in local mode. |
| Upload rejected | The frontend and backend both enforce the 4 MiB (4,194,304-byte) PDF limit. |
