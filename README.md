# Mock Interview Coach

AI-powered mock interview application. Analyzes resumes, generates interview questions, and evaluates answers for co-op seeking students.

## Architecture

The browser manages all state. Each Lambda is stateless. No database, no S3 session state, no API Gateway.

```
frontend/                    → Browser UI (holds state)
backend/functions/analyst/  → Resume analysis (OpenAI GPT OSS 120B)
backend/functions/interviewer/ → Interview context builder
backend/functions/evaluator/   → Answer evaluation (OpenAI GPT OSS 120B)
backend/functions/pdf_parser/  → PDF text extraction (pypdf)
backend/functions/voice_session/ → Short-lived AgentCore WebSocket URL signer
backend/voice_agent/         → Nova 2 Sonic WebSocket relay
infrastructure/              → AWS CDK infrastructure definitions
```

## Tech Stack

- **Runtime**: Python 3.12 (AWS Lambda)
- **LLM**: Amazon Bedrock Mantle Chat Completions (forced function calls)
- **Speech**: Amazon Nova 2 Sonic (local WebSocket relay for development; AgentCore when hosted)
- **PDF**: pypdf
- **Region**: us-east-1

## Lambda Module Structure

The Analyst uses an orchestrator/parser layout:

```
backend/functions/analyst/
  __init__.py
  handler.py          # Lambda entry point
  orchestrator.py     # Business logic wiring
  validation.py       # Input validation
  prompt_builder.py   # Prompt construction
  bedrock_client.py   # Signed Bedrock Mantle API call
  parser.py           # Response parsing/validation
```

The Evaluator separates validation, deterministic scoring, and response assembly:

```
backend/functions/evaluator/
  __init__.py
  lambda_handler.py     # Lambda entry point
  validator.py          # Input validation
  prompt_builder.py     # Prompt construction
  bedrock_client.py     # Signed Bedrock Mantle API call/tool extraction
  scorer.py             # Deterministic score aggregation
  response_assembler.py # Final response construction
  schemas.py            # Evaluator schema definitions
  exceptions.py         # Evaluator-specific errors
```

The Interviewer Lambda is a context-builder (no LLM call):

```
backend/functions/interviewer/
  __init__.py
  handler.py          # Lambda entry point
  validation.py       # Input validation
  config_loader.py    # S3 fetch for interview structure + profile
  context_builder.py  # Assembles runtime context for Nova 2 Sonic
```

## Models

| Agent | Model / Service |
|-------|-----------------|
| analyst | Bedrock Mantle — `openai.gpt-oss-120b` |
| interviewer | Amazon Nova 2 Sonic (speech-to-speech via WebSocket) |
| evaluator | Bedrock Mantle — `openai.gpt-oss-120b` |
| pdf_parser | pypdf only |

## Contracts

Inter-agent payload schemas are defined in `schemas/`:

| File | Purpose |
|------|---------|
| `analyst_output.json` | Analyst → Interviewer & Evaluator |
| `interviewer_output.json` | Completed interview payload sent to the Evaluator |
| `evaluator_output.json` | What the Evaluator returns (scores + feedback) |

## Local Development

Local mode runs PDF parsing, Analyst, Interviewer context building, Evaluator, and the Nova voice relay on the development machine.

### Prerequisites

- Python 3.12
- Node.js 20 or another current Node.js release with npm
- AWS CLI v2
- AWS credentials with access to `openai.gpt-oss-120b` through Bedrock Mantle and `amazon.nova-2-sonic-v1:0` through Bedrock Runtime in `us-east-1`

Model availability and quotas are account-specific. All local model usage and charges belong to the AWS account shown by `aws sts get-caller-identity`.

Use any credential method supported by the AWS SDK. For a configured AWS profile:

```bash
export AWS_PROFILE="<profile-name>"
export AWS_REGION="us-east-1"
```

If the profile uses IAM Identity Center, sign in before starting the application:

```bash
aws sso login --profile "<profile-name>"
```

For environment-based temporary credentials:

```bash
export AWS_ACCESS_KEY_ID="..."
export AWS_SECRET_ACCESS_KEY="..."
export AWS_SESSION_TOKEN="..."
export AWS_REGION="us-east-1"
```

Then start the complete local backend from the repository root in terminal 1:

```bash
python3 -m venv .venv
.venv/bin/pip install -r backend/requirements-local.txt
aws sts get-caller-identity
.venv/bin/uvicorn backend.local_server:app --host 127.0.0.1 --port 8080
```

The local server prints the active AWS account and ARN at startup. Confirm that this is the identity you intend to use. In terminal 2, run:

```bash
cd frontend
npm ci
npm run dev
```

Open the local URL printed by Vite. With the default `VITE_RUNTIME_MODE=local`, the development server uses `http://localhost:8080/api/*` for all four HTTP stages and `ws://localhost:8080/` for voice, requires no hosted endpoint variable, and ignores `VITE_API_BASE_URL`. Setting `VITE_RUNTIME_MODE=hosted` explicitly exercises the bounded hosted services instead. Never put AWS credentials in a `VITE_*` variable or commit `.env.local`.

Hosted cost guardrails are deliberately disabled in this pure local path. Local Analyst and Evaluator calls retain the 8,192-token output budget, and local voice sessions have no application-imposed eight-minute limit. The product-wide 5,000-character job-description limit and 4 MiB PDF limit still apply, as do AWS model availability and account quotas.

If port `8080` is already in use, identify and stop the previous local backend before retrying:

```bash
lsof -nP -iTCP:8080 -sTCP:LISTEN
```

The frontend is configured for port `8080`, so changing only the Uvicorn port will not reconnect it.

## Hosted Architecture

The hosted architecture uses Amplify Hosting for React, AgentCore Runtime for the Python voice relay, a CloudFront API gateway backed by five private IAM-protected Lambda Function URLs, S3 for interview configuration, and Bedrock for GPT OSS 120B and Nova 2 Sonic. The client does not require a user login; its Voice Session Lambda signs five-minute AgentCore connection URLs with a role scoped to the configured runtime and its endpoints. Keep account IDs, credentials, and physical resource names out of version control.

Two serialized GitHub Actions release paths keep the hosted application current when matching changes reach `main`: application changes test and deploy the CDK backend before building and publishing the same revision to Amplify, while voice-relay changes test and deploy AgentCore. Both reject stale revisions and share one production concurrency lock. The workflows use GitHub OIDC to assume a short-lived AWS role instead of storing permanent AWS access keys in GitHub.

The hosted surface uses exact Amplify/localhost CORS origins, high-usage/error/throttle alarms, and a default $25 account-wide AWS monthly cost budget with email notifications. Direct Function URL requests are rejected; CloudFront Origin Access Control signs each origin request. The notification email must confirm its SNS subscription before messages are delivered. Hosted Analyst and Evaluator use one model attempt with a 55-second read timeout and 4,096-token output cap; hosted Analyst resume input is capped at 60,000 characters; every job description is capped at 5,000 characters; hosted Evaluator input is capped at 60,000 conversation and 120,000 Analyst-output characters; hosted Nova sessions have an eight-minute application limit. These controls reduce accidental cost and abuse exposure, but the login-free CloudFront endpoint remains internet-accessible and alarms and budgets notify rather than automatically block requests. The stack provides an emergency switch that sets all five functions to zero concurrency. Optional per-function caps (2 Analyst, 2 Evaluator, 4 Interviewer, 4 PDF Parser, and 2 Voice Session) default off because small/new AWS accounts may not have enough Lambda concurrency quota to deploy them.

AWS WAF is intentionally not provisioned, avoiding its fixed web-ACL baseline cost. CloudFront is usage-priced, so the public gateway still needs the workload limits and monitoring above.

## Important Notes

- CloudFront forwards JSON requests to private Function URLs; handlers parse `event['body']`
- CORS is configured on the Function URL settings, not in Python code
- Permissions require both `lambda:InvokeFunctionUrl` AND `lambda:InvokeFunction`
- The frontend and PDF Parser both enforce a 4 MiB (4,194,304-byte) PDF limit; Lambda Function URL request payloads are capped at 6 MiB
- Hosted endpoint values are used only when `VITE_RUNTIME_MODE=hosted`
