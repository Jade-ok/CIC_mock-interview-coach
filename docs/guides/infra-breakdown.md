# Infrastructure Breakdown

How the CDK project works, how it connects to the backend Lambdas and the frontend, and how to deploy after code changes.

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

One stack provisions everything the app needs:

| Resource | Construct | Purpose |
|----------|-----------|---------|
| S3 Bucket | `InterviewConfigBucket` | Stores interview structure and interview profile JSON configs |
| Analyst Lambda | `mock-interview-analyst` | Calls Bedrock (Claude) to analyze the resume against the job description |
| Evaluator Lambda | `mock-interview-evaluator` | Calls Bedrock (Claude) to score the candidate's interview transcript |
| Interviewer Lambda | `mock-interview-interviewer` | Reads config from S3, builds runtime context for Nova Sonic (no LLM call) |
| PDF Parser Lambda | `mock-interview-pdf-parser` | Extracts text from uploaded resumes using pypdf |

Every Lambda gets a **Function URL** (public, no auth) — these are the HTTP endpoints the frontend calls directly.

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

Each `fromAsset` call zips the entire folder at deploy time and uploads it to S3 for Lambda. The `handler` property tells Lambda which Python function to invoke:

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

Copy these URLs into the frontend's `.env` file. The frontend makes `POST` requests directly to these URLs — no API Gateway or CloudFront sits between them (for now).

---

## How to Deploy After Code Changes

### Prerequisites

1. AWS CLI configured with a profile that has deploy permissions
2. Node.js installed (for CDK CLI)
3. Docker running (needed for the PDF Parser bundling step)
4. CDK bootstrapped in your account/region:
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

### Quick Iteration: Updating a Single Lambda Without Full Deploy

If you only changed Python code in one Lambda and want faster feedback:

```bash
# Zip and upload directly (bypasses CDK, useful for dev)
cd backend/functions/analyst
zip -r ../../../analyst.zip .
aws lambda update-function-code \
  --function-name mock-interview-analyst \
  --zip-file fileb://../../../analyst.zip \
  --region us-east-1
rm ../../../analyst.zip
```

This is faster but doesn't update IAM, environment variables, or other resource settings. Use `cdk deploy` for anything beyond code-only changes.

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
| 403 when calling a Function URL | Need both `lambda:InvokeFunctionUrl` AND `lambda:InvokeFunction` permissions if using IAM auth (currently set to NONE so this shouldn't happen) |
| Docker not running → synth fails for pdf_parser | Start Docker Desktop before running `cdk deploy` |
| Handler not found on Lambda invocation | Verify the CDK handler path matches the file inside the selected function asset. |
| Trailing whitespace in `.env` URLs | Causes silent 403s — trim the URLs after pasting |
| Payload too large | Function URLs have a 6 MiB limit. PDF upload is capped at 4 MB client-side |
