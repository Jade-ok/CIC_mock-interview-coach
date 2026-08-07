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

One stack provisions the HTTP backend and interview configuration. The AgentCore voice relay is deployed separately.

| Resource | Construct | Purpose |
|----------|-----------|---------|
| S3 Bucket | `InterviewConfigBucket` | Stores interview structure and interview profile JSON configs |
| Analyst Lambda | `AnalystFunction` | Calls Bedrock (Claude) to analyze the resume against the job description |
| Evaluator Lambda | `EvaluatorFunction` | Calls Bedrock (Claude) to score the candidate's interview transcript |
| Interviewer Lambda | `InterviewerFunction` | Reads config from S3, builds runtime context for Nova Sonic (no LLM call) |
| PDF Parser Lambda | `PdfParserFunction` | Extracts text from uploaded resumes using pypdf |

Every Lambda currently gets a **Function URL** with public `NONE` authentication. These are the HTTP endpoints the frontend calls directly during development. Before a public deployment, protect these operations or place them behind an authenticated API boundary and restrict CORS to the Amplify application origin.

The names above are CDK construct IDs. Because `functionName` is not set, CloudFormation generates the deployed physical Lambda names.

### Key Design Decisions

- **No API Gateway.** Function URLs provide the HTTP surface. CORS is configured on the URL resource itself (`allowedOrigins: ['*']`), not in Python code.
- **No VPC.** Lambdas run in the default VPC-less mode for simplicity.
- **Docker bundling for pypdf.** The PDF Parser uses CDK's `bundling` option to `pip install pypdf` into the deployment package at synth time.
- **IAM permissions are inline.** `bedrock:InvokeModel` for Analyst/Evaluator and `s3:GetObject` (via `grantRead`) for Interviewer.

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

After `cdk deploy`, the stack outputs all Function URLs:

```
Outputs:
MockInterviewStack.AnalystUrl = https://xxxx.lambda-url.us-east-1.on.aws/
MockInterviewStack.EvaluatorUrl = https://xxxx.lambda-url.us-east-1.on.aws/
MockInterviewStack.InterviewerUrl = https://xxxx.lambda-url.us-east-1.on.aws/
MockInterviewStack.PdfParserUrl = https://xxxx.lambda-url.us-east-1.on.aws/
MockInterviewStack.ConfigBucketName = mockinterviewstack-interviewconfigbucket-xxxxx
```

Copy these URLs into the frontend's local `.env` file. For an Amplify deployment, configure the corresponding `VITE_*` values in the Amplify application's build environment. The frontend currently makes `POST` requests directly to these URLs; no API Gateway sits between them.

Do not store secrets or permanent AWS credentials in `VITE_*` variables. Vite embeds those values into the public browser bundle.

## Deployment Boundaries

The complete target is intentionally split across managed services:

| Concern | Deployment target | Repository status |
|---------|-------------------|-------------------|
| React/Vite frontend | AWS Amplify Hosting | Planned; not provisioned by this CDK stack |
| Browser identity | Amplify Auth/Cognito or another AgentCore-supported authorization flow | Planned; not implemented |
| PDF/Analyst/Interviewer/Evaluator HTTP backend | Lambda + S3 via this CDK stack | Implemented; Function URLs are currently public |
| Real-time Python voice relay | Amazon Bedrock AgentCore Runtime | Relay code exists; account configuration is untracked and current-CLI migration/deployment remain pending |
| Speech-to-speech model | Amazon Nova 2 Sonic through the relay | Implemented in relay code |

AgentCore Runtime is a serverless managed container runtime, not a server that this project administers. It is used because the voice path needs a persistent WebSocket and bidirectional model stream. The environment-driven frontend endpoint and WebSocket protocol adapter are implemented and unit-tested. The authenticated public `wss://` connection and live deployed verification remain integration work.

---

## How to Deploy After Code Changes

### Prerequisites

1. AWS CLI configured with a profile that has deploy permissions
2. Node.js installed (for CDK CLI)
3. Docker running (needed for the PDF Parser bundling step)
4. Bedrock access confirmed in the target account for `global.anthropic.claude-sonnet-4-6` and `amazon.nova-2-sonic-v1:0`
5. CDK bootstrapped in your account/region:
   ```bash
   cd infrastructure && npx cdk bootstrap aws://<ACCOUNT_ID>/us-east-1
   ```

### Deployment Steps

```bash
# From the repo root
cd infrastructure

# Install CDK dependencies (first time or after package.json changes)
npm install

# Preview what will change
npx cdk diff

# Deploy the stack
npx cdk deploy
```

That's it. CDK will:
1. Compile the TypeScript (`npx tsc && npx tsx bin/infra.ts` per `cdk.json`)
2. Zip each Lambda folder (running Docker bundling for pdf_parser)
3. Upload assets to the CDK bootstrap S3 bucket
4. Create/update the CloudFormation stack
5. Print the Function URLs to the terminal

### What triggers a redeploy for each Lambda

| Change | Effect |
|--------|--------|
| Edit Python code in a Lambda folder (e.g., `backend/functions/analyst/*.py`) | CDK detects the asset hash changed → redeploys that Lambda |
| Edit `infra-stack.ts` (change timeout, memory, env vars) | Corresponding Lambda resource updates |
| Add/remove a Lambda or change IAM policies | Stack update adds/removes resources |
| No file changes | `cdk diff` shows no changes, deploy is a no-op |

### Deployment Scope

- `cd infrastructure && npx cdk deploy` is canonical for all four Lambdas and the S3 configuration bucket.
- Amplify Hosting and browser authentication are separate planned deployments; `cdk deploy` does not create them today.
- AgentCore is deployed separately from `backend/voice_agent/`.
- `scripts/deploy.sh` derives the active AWS account from `AWS_PROFILE` and deploys the canonical full CDK backend. The separate legacy AgentCore workflow is disabled by default; opting in with `DEPLOY_LEGACY_AGENTCORE=true` requires a local `.bedrock_agentcore.yaml` whose account and Region match the active deployment identity. The AgentCore portion remains pending migration to AWS's current CLI format.
- `backend/functions/evaluator/template.yaml` is a standalone SAM option. It creates a separate stack and should not be treated as an update to the CDK-managed Evaluator.

Avoid direct `update-function-code` examples with assumed physical names; CDK generates those names unless `functionName` is explicitly configured.

### Destroying the Stack

```bash
cd infrastructure
npx cdk destroy
```

The S3 bucket has `RemovalPolicy.RETAIN`, so it will **not** be deleted — you must empty and delete it manually if you want it gone.

---

## Common Gotchas

| Issue | Fix |
|-------|-----|
| CORS error from frontend | CORS is set on the Function URL config, not in Python. Check `corsOptions` in `infra-stack.ts` |
| Amplify site loads but voice does not connect | Amplify hosts static frontend assets only. Configure an authenticated AgentCore `wss://` endpoint and align the frontend/relay protocol. |
| 403 when calling a Function URL | Need both `lambda:InvokeFunctionUrl` AND `lambda:InvokeFunction` permissions if using IAM auth (currently set to NONE so this shouldn't happen) |
| Docker not running → synth fails for pdf_parser | Start Docker Desktop before running `cdk deploy` |
| Handler not found on Lambda invocation | Verify the CDK handler path matches the file inside the selected function asset. |
| Trailing whitespace in `.env` URLs | Trim the URLs after pasting |
| Payload too large | Function URLs have a 6 MiB limit. The backend rejects decoded PDFs above 4 MB, while the frontend currently allows 10 MB. |
