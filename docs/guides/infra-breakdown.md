# Infrastructure Breakdown

How the CDK project works, how it connects to the backend Lambdas and the frontend, and how its deployment scope fits the planned Amplify/AgentCore architecture.

---

## Folder Structure

```
infrastructure/
├── bin/
│   └── infra.ts            # CDK app entry point — instantiates the stack
├── lib/
│   └── infra-stack.ts      # Single stack defining all AWS resources
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

Every Lambda currently gets a **Function URL** with public `NONE` authentication for hosted operation. Local requests reach the same handler logic through `backend.local_server:app`. Public hosting requires an authenticated API boundary and CORS restricted to the application origin.

The names above are CDK construct IDs. Because `functionName` is not set, CloudFormation generates the deployed physical Lambda names.

### Key Design Decisions

- **No API Gateway.** Function URLs provide the HTTP surface. CORS is configured on the URL resource itself (`allowedOrigins: ['*']`), not in Python code.
- **No VPC.** Lambdas run in the default VPC-less mode for simplicity.
- **Docker bundling for pypdf.** The PDF Parser uses CDK's `bundling` option to `pip install pypdf` into the deployment package at synth time.
- **IAM permissions are inline.** Model-scoped Bedrock Mantle inference for Analyst/Evaluator and `s3:GetObject` (via `grantRead`) for Interviewer.

---

## How Infra Connects to the Backend

The CDK stack references each Lambda's source code relative to the `infrastructure/` folder:

```
backend/functions/analyst/       → Analyst Lambda asset
backend/functions/evaluator/     → Evaluator Lambda asset
backend/functions/interviewer/   → Interviewer Lambda asset
backend/functions/pdf_parser/    → PDF Parser Lambda asset
```

CDK creates filtered assets rather than blindly zipping each folder. Analyst and Interviewer exclude tests, `.env*`, caches, bytecode, and test events; Evaluator also excludes its README and standalone SAM files. PDF Parser builds a fresh asset containing installed `pypdf` plus its top-level Python modules. The `handler` property tells Lambda which Python function to invoke:

| Lambda | Handler Path | Meaning |
|--------|-------------|---------|
| Analyst | `handler.lambda_handler` | `backend/functions/analyst/handler.py` |
| Evaluator | `lambda_handler.handler` | `backend/functions/evaluator/lambda_handler.py` |
| Interviewer | `handler.lambda_handler` | `backend/functions/interviewer/handler.py` |
| PDF Parser | `handler.lambda_handler` | `backend/functions/pdf_parser/handler.py` |

### Environment Variables

The Interviewer Lambda receives `S3_BUCKET`, `INTERVIEW_STRUCTURE_KEY`, and
`INTERVIEW_PROFILE_KEY`. CDK uploads the JSON files from `backend/config/` to
that bucket during deployment.

---

## How Infra Connects to the Frontend

The stack exposes hosted endpoint and configuration-bucket outputs. Local mode sends the same `POST` payloads to the adapter under `http://localhost:8080/api`.

Do not store secrets or permanent AWS credentials in `VITE_*` variables. Vite embeds those values into the public browser bundle.

## Infrastructure Boundaries

The complete target is intentionally split across managed services:

| Concern | Deployment target | Repository status |
|---------|-------------------|-------------------|
| React/Vite frontend | AWS Amplify Hosting | Planned; not provisioned by this CDK stack |
| Browser identity | Amplify Auth/Cognito or another AgentCore-supported authorization flow | Planned; not implemented |
| PDF/Analyst/Interviewer/Evaluator HTTP backend | Lambda + S3 via this CDK stack | Implemented; Function URLs are currently public |
| Real-time Python voice relay | Amazon Bedrock AgentCore Runtime | Current CLI/CDK configuration is tracked; runtime-specific deployment state is local and ignored |
| Speech-to-speech model | Amazon Nova 2 Sonic through the relay | Implemented in relay code |

AgentCore Runtime is a serverless managed container runtime, not a server that this project administers. It is used because the voice path needs a persistent WebSocket and bidirectional model stream. The environment-driven frontend endpoint and WebSocket protocol adapter are implemented and unit-tested. The hosted `wss://` handshake, browser authorization, and a live Nova conversation require environment-specific end-to-end verification.

---

## Local Development Gotchas

| Issue | Fix |
|-------|-----|
| Missing AWS identity at startup | Configure an AWS profile or temporary environment credentials, then confirm with `aws sts get-caller-identity`. |
| Model access error | Confirm the active AWS identity can invoke GPT OSS 120B and Nova 2 Sonic in `us-east-1`. |
| Python import error | Install `backend/requirements-local.txt` in the active virtual environment. |
| Upload rejected | The frontend and backend both enforce the 4 MB PDF limit. |
