# Project Rules

Shared conventions for the mock interview app. All 5 members follow these so every Lambda comes out consistent.

## Runtime & Language

- Lambda runtime: Python 3.12. Use `python3`, not `python`.
- No pydantic. Use plain dicts.
- `boto3` ships with the runtime, don't bundle it. Bundle `pypdf` only (`pdf_parser`).

## Models & Services

Each agent uses a different model or service — this is intentional.

| Agent | Model / Service |
|-------|-----------------|
| analyst | Bedrock — `global.anthropic.claude-fable-5` |
| interviewer | Amazon Nova Sonic (speech-to-speech via WebSocket) — no Bedrock text model |
| evaluator | Bedrock — `global.anthropic.claude-fable-5` |
| polly | Amazon Polly only — no Bedrock |
| pdf_parser | pypdf only — no Bedrock |

If a Bedrock model feels too slow during testing, swap to `global.anthropic.claude-sonnet-4-6` by changing the model ID string in that Lambda only. No other code changes needed.

## Bedrock (analyst, evaluator only)

- Region: `us-east-1` for Bedrock, Polly, Nova Sonic, and all Lambdas.
- Use the Converse API with `tool_use` to force JSON output. Never parse plain text.
- Retry each Bedrock call once (max 2 attempts) on failure or invalid response.

## Nova Sonic (interviewer only)

- The Interviewer Lambda is a context-builder — it does NOT conduct the interview or call any LLM.
- It loads interview structure + interview profile from S3, combines them with the Analyst output, and returns the runtime context to the frontend.
- A Voice Agent Server (Python WebSocket, deployed on Bedrock AgentCore Runtime) proxies bidirectional audio between the browser and Nova Sonic.
- The frontend connects to AgentCore Runtime's managed WebSocket endpoint (SigV4-authenticated). AgentCore proxies to the Voice Agent Server container, which relays events to/from Nova Sonic.
- Nova Sonic handles all question generation, follow-ups, and speech.
- After the interview, the frontend sends the Analyst output + Q&A conversation to the Evaluator.

## Architecture

- Stateless. No database. The browser holds all state.
- S3 is used only for interview configuration files (interview structure, interview profile) — not for session state.
- Bedrock AgentCore Runtime manages the WebSocket proxy, scaling, and SigV4 auth for the voice interview. No API Gateway needed for the WebSocket layer.
- Lambda Function URLs are used for the Interviewer, Analyst, Evaluator, pdf_parser, and Polly endpoints (no API Gateway for those either, unless added later).
- LLM does subjective judgment only (analyst: candidate analysis, evaluator: answer scoring). Deterministic logic (score calculation, classification, flow decisions) is done in Python.
- The interviewer does not score or judge — it only builds context for Nova Sonic.

## Schemas

Inter-agent data contracts and configuration schemas are defined separately from module code:

| Schema | Purpose |
|--------|---------|
| Analyst → Interviewer | What the Analyst passes to the Interviewer (candidate data, job info, experiences) |
| Interviewer → Evaluator | What the frontend sends to the Evaluator after the interview (Analyst output + transcript) |
| Interview Structure | S3 config defining what the interview covers (points, topics, follow-up guidance, number of questions) |
| Interview Profile | S3 config defining how the interviewer behaves (tone, style, rules, difficulty level) |

Each module validates presence of its inputs but relies on the producing agent to validate conformance.

## Lambda Internal Structure

**AI Lambdas (analyst, evaluator):**
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

**Interviewer Lambda (context-builder, no LLM):**
```
interviewer/
  __init__.py
  handler.py          # entry point
  validation.py       # input validation
  config_loader.py    # S3 fetch for interview structure + profile
  context_builder.py  # assembles runtime context for Nova Sonic
```

**Other Lambdas:**
- `pdf_parser`: same shape as AI Lambdas but no Bedrock (uses pypdf).
- `polly`: single `handler.py` only, no Bedrock.

**Voice Agent Server (AgentCore Runtime, not Lambda):**
```
voice-agent/
  server.py               # FastAPI WebSocket server, event relay, large event splitting
  s2s_session_manager.py  # Manages bidirectional stream to Nova Sonic via Bedrock SDK
  s2s_events.py           # Event factory for Nova Sonic protocol
  Dockerfile              # Container image for AgentCore deployment
  requirements.txt        # fastapi, uvicorn, aws-sdk-bedrock-runtime
```

## Deployment Gotchas

These cost us time before — don't repeat them:

- Each handler supports two modes: direct (`event = payload`) and Function URL (`event = {"body": "<JSON string>"}`). Read from `event['body']` for URL calls.
- CORS is set on the Function URL config, not in Python code. CORS errors → fix the URL config in the console, not the handler.
- 403 needs two permission statements, not one: `lambda:InvokeFunctionUrl` AND `lambda:InvokeFunction`.
- Trailing whitespace after a URL in `.env` causes a 403 that is hard to trace.
- Request payload limit is 6 MiB. PDF upload capped at 4 MB client-side.
- zip packaging: if code imports from `analyst.xxx`, zip the whole folder (`zip -r analyst.zip analyst/`), handler is `analyst.handler.lambda_handler`. Bundle pypdf with `pip3 install pypdf -t pdf_parser/`.
