# Mock Interview Coach

AI-powered mock interview application. Analyzes resumes, generates interview questions, and evaluates answers for co-op seeking students.

## Architecture

The browser manages all state. Each Lambda is stateless. No database, no S3 session state, no API Gateway.

```
frontend/                    → Browser UI (holds state)
backend/functions/analyst/  → Resume analysis (Claude Sonnet 5)
backend/functions/interviewer/ → Interview context builder
backend/functions/evaluator/   → Answer evaluation (Claude Sonnet 5)
backend/functions/pdf_parser/  → PDF text extraction (pypdf)
backend/voice_agent/         → Nova Sonic WebSocket relay
infrastructure/              → AWS CDK deployment
```

## Tech Stack

- **Runtime**: Python 3.12 (AWS Lambda)
- **LLM**: Amazon Bedrock Converse API (`tool_use` pattern)
- **Speech**: Amazon Nova Sonic (WebSocket via the AgentCore relay)
- **PDF**: pypdf
- **Region**: us-east-1

## Lambda Module Structure

AI Lambdas (analyst, evaluator) follow this structure:

```
module/
  __init__.py
  handler.py          # Lambda entry point
  orchestrator.py     # Business logic wiring
  validation.py       # Input validation
  prompt_builder.py   # Prompt construction
  bedrock_client.py   # Bedrock Converse API call
  parser.py           # Response parsing/validation
```

The Interviewer Lambda is a context-builder (no LLM call):

```
backend/functions/interviewer/
  __init__.py
  handler.py          # Lambda entry point
  validation.py       # Input validation
  config_loader.py    # S3 fetch for interview structure + profile
  context_builder.py  # Assembles runtime context for Nova Sonic
```

## Models

| Agent | Model / Service |
|-------|-----------------|
| analyst | Bedrock — `global.anthropic.claude-sonnet-5` |
| interviewer | Amazon Nova Sonic (speech-to-speech via WebSocket) |
| evaluator | Bedrock — `global.anthropic.claude-sonnet-5` |
| pdf_parser | pypdf only |

## Contracts

Inter-agent payload schemas are defined in `schemas/`:

| File | Purpose |
|------|---------|
| `analyst_output.json` | Analyst → Interviewer & Evaluator |
| `interviewer_output.json` | Completed interview payload sent to the Evaluator |
| `evaluator_output.json` | What the Evaluator returns (scores + feedback) |

## Deployment

```bash
# Deploy the Lambda functions and configuration bucket
cd infrastructure
npm ci
npx cdk deploy

# Deploy the Nova Sonic voice relay
cd ../backend/voice_agent
agentcore deploy -a mock-interview-voice-agent

# The evaluator's standalone SAM template remains available if needed
cd ../functions/evaluator
sam build && sam deploy --guided
```

## Important Notes

- Function URL calls: parse JSON from `event['body']`
- CORS is configured on the Function URL settings, not in Python code
- Permissions require both `lambda:InvokeFunctionUrl` AND `lambda:InvokeFunction`
- PDF upload limits are not yet aligned: the frontend permits 10 MB, while the PDF Parser rejects decoded files over 4 MB; Lambda Function URL payloads are capped at 6 MiB
- Trailing whitespace after URLs in `.env` causes 403 errors
