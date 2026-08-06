# Project Rules

Shared conventions for the mock interview app. All 5 members follow these so every Lambda comes out consistent.

## Runtime & Language

- Lambda runtime: Python 3.12. Use `python3`, not `python`.
- No pydantic. Use plain dicts.
- `boto3` ships with the runtime, don't bundle it. Bundle `pypdf` only (`pdf_parser`).

## Models

Each agent uses a different model — this is intentional.

| Agent | Model ID |
|-------|----------|
| analyst | global.anthropic.claude-fable-5 |
| interviewer | global.anthropic.claude-opus-4-7 |
| evaluator | global.anthropic.claude-fable-5 |
| polly | no Bedrock — uses Amazon Polly only |
| pdf_parser | no Bedrock — uses pypdf only |

If a model feels too slow during testing, swap to `global.anthropic.claude-sonnet-4-6` by changing the model ID string in that Lambda only. No other code changes needed.

## Bedrock

- Region: `us-west-2` for Bedrock, Polly, and all Lambdas.
- Use the Converse API with `tool_use` to force JSON output. Never parse plain text.
- Retry each Bedrock call once (max 2 attempts) on failure or invalid response.

## Architecture

- Stateless. No database, no S3, no API Gateway. The browser holds all state and sends the full history every turn.
- LLM does subjective judgment only (rubric booleans). Score calculation, classification, and follow-up decisions are done deterministically in Python.

## AI Lambda Internal Structure (analyst, interviewer, evaluator)

```
module/
  __init__.py
  handler.py          # entry point
  orchestrator.py     # business logic wiring
  validation.py       # input validation
  prompt_builder.py   # Claude prompt construction
  bedrock_client.py   # Bedrock Converse API call
  parser.py           # response parsing/validation
```

- `pdf_parser`: same shape but no Bedrock (uses pypdf).
- `polly`: single `handler.py` only, no Bedrock.

## Deployment Gotchas

These cost us time before — don't repeat them:

- Each handler supports two modes: direct (`event = payload`) and Function URL (`event = {"body": "<JSON string>"}`). Read from `event['body']` for URL calls.
- CORS is set on the Function URL config, not in Python code. CORS errors → fix the URL config in the console, not the handler.
- 403 needs two permission statements, not one: `lambda:InvokeFunctionUrl` AND `lambda:InvokeFunction`.
- Trailing whitespace after a URL in `.env` causes a 403 that is hard to trace.
- Request payload limit is 6 MiB. PDF upload capped at 4 MB client-side.
- zip packaging: if code imports from `analyst.xxx`, zip the whole folder (`zip -r analyst.zip analyst/`), handler is `analyst.handler.lambda_handler`. Bundle pypdf with `pip3 install pypdf -t pdf_parser/`.
