# Mock Interview Coach

AI-powered mock interview application. Analyzes resumes, generates interview questions, and evaluates answers for co-op seeking students.

## Architecture

The browser manages all state. Each Lambda is stateless. No database, no S3 session state, no API Gateway.

```
frontend/        → Browser UI (holds state)
analyst/         → Resume analysis (Claude Sonnet 5)
interviewer/     → Interview context builder (Nova Sonic via frontend WebSocket)
evaluator/       → Answer evaluation (Claude Sonnet 5)
pdf_parser/      → PDF text extraction (pypdf)
```

## Tech Stack

- **Runtime**: Python 3.12 (AWS Lambda)
- **LLM**: Amazon Bedrock Converse API (`tool_use` pattern)
- **Speech**: Amazon Nova Sonic (WebSocket, frontend-direct)
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
interviewer/
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

## Schemas

Inter-agent data contracts are defined in `schemas/`:

| File | Purpose |
|------|---------|
| `analyst_output.json` | Analyst → Interviewer & Evaluator |
| `evaluator_input.json` | What the Evaluator receives (Analyst output + transcript) |
| `evaluator_output.json` | What the Evaluator returns (scores + feedback) |

## Deployment

```bash
# Lambda zip packaging
zip -r analyst.zip analyst/

# pdf_parser requires pypdf bundled
pip3 install pypdf -t pdf_parser/
zip -r pdf_parser.zip pdf_parser/

# Evaluator uses SAM
cd evaluator && sam build && sam deploy --guided
```

## Important Notes

- Function URL calls: parse JSON from `event['body']`
- CORS is configured on the Function URL settings, not in Python code
- Permissions require both `lambda:InvokeFunctionUrl` AND `lambda:InvokeFunction`
- PDF upload limit: 4 MB client-side / 6 MiB Lambda payload
- Trailing whitespace after URLs in `.env` causes 403 errors
