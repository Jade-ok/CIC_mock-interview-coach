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

The active AWS credentials must be able to invoke both `openai.gpt-oss-120b` through Bedrock Mantle and `amazon.nova-2-sonic-v1:0` through Bedrock Runtime in `us-east-1`. All model usage belongs to the AWS account shown by `aws sts get-caller-identity`.

Use any credential method supported by the AWS SDK. For a configured AWS profile:

```bash
export AWS_PROFILE="<profile-name>"
export AWS_REGION="us-east-1"
```

For environment-based temporary credentials:

```bash
export AWS_ACCESS_KEY_ID="..."
export AWS_SECRET_ACCESS_KEY="..."
export AWS_SESSION_TOKEN="..."
export AWS_REGION="us-east-1"
```

Then start the complete local backend from the repository root:

```bash
python3 -m venv .venv
.venv/bin/pip install -r backend/requirements-local.txt
aws sts get-caller-identity
.venv/bin/uvicorn backend.local_server:app --host 127.0.0.1 --port 8080
```

The local server prints the active AWS account and ARN at startup. In a second terminal, run:

```bash
cd frontend
npm install
npm run dev
```

Local mode uses `http://localhost:8080/api/*` for all four HTTP stages and `ws://localhost:8080/` for voice. Never put AWS credentials in a `VITE_*` variable or commit `.env.local`.

## Hosted Architecture

The hosted architecture uses one AWS account: Amplify Hosting for React, AgentCore Runtime for the Python voice relay, Lambda/S3 for the HTTP backend, and Bedrock for GPT OSS 120B and Nova 2 Sonic. Keep account IDs, credentials, and physical resource names out of version control.

## Important Notes

- Function URL calls: parse JSON from `event['body']`
- CORS is configured on the Function URL settings, not in Python code
- Permissions require both `lambda:InvokeFunctionUrl` AND `lambda:InvokeFunction`
- The frontend and PDF Parser both enforce a 4 MB PDF limit; Lambda Function URL request payloads are capped at 6 MiB
- Hosted endpoint values are used only when `VITE_RUNTIME_MODE=hosted`
