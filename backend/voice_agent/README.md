# Voice Agent Relay

FastAPI WebSocket relay deployed to Amazon Bedrock AgentCore Runtime. It connects each browser WebSocket session to an Amazon Nova 2 Sonic bidirectional stream.

AgentCore Runtime is a serverless managed container runtime. This project supplies the Python container and pays for usage; AWS manages the underlying hosts and scaling. The relay is still backend application code, but there is no EC2 server to provision or administer.

## Files

- `server.py` — FastAPI WebSocket endpoint at `/` and health endpoint at `/health`
- `s2s_session_manager.py` — Nova stream lifecycle and audio queue
- `s2s_events.py` — Nova protocol event builders
- `Dockerfile` — Python 3.12 container on port 8080
- `.bedrock_agentcore.yaml` — AgentCore deployment configuration

## Runtime

- Region: `us-east-1`
- Model: `amazon.nova-2-sonic-v1:0`
- Input audio: 16 kHz, 16-bit, mono LPCM
- Output audio: 24 kHz, 16-bit, mono LPCM

The relay accepts and returns raw Nova `{"event": ...}` JSON. It does not currently translate the frontend's `{type, payload}` messages or emit `session_start_ack`; that adapter is required before the real frontend and relay are compatible.

The target production path is:

```text
React/Vite on Amplify Hosting
  └─ authenticated WSS ─> AgentCore Runtime relay ─> Nova 2 Sonic
```

Amplify Hosting does not proxy or authenticate this WebSocket automatically. Browser authentication/authorization and the public `wss://` endpoint are planned but not implemented in the repository. Use short-lived credentials or tokens supported by the selected AgentCore authorizer; never bundle permanent AWS credentials into the frontend.

## Local Run

From `backend/voice_agent/`, with AWS credentials and Nova model access available:

```bash
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/uvicorn server:app --host 0.0.0.0 --port 8080
```

Check `http://localhost:8080/health`. The WebSocket endpoint is `ws://localhost:8080/`.

## AgentCore Deployment

Install the AgentCore CLI first (provided by `bedrock-agentcore-starter-toolkit`) and configure AWS credentials for the deployment account.

From `backend/voice_agent/`:

```bash
agentcore deploy -a mock-interview-voice-agent \
  --env AWS_REGION=us-east-1 \
  --env MODEL_ID=amazon.nova-2-sonic-v1:0

agentcore status
```

Deployment uses account-specific values in `.bedrock_agentcore.yaml`. Review the account, execution role, ECR repository, CodeBuild role/bucket, network configuration, and authorizer settings before deploying from another AWS account. The checked-in file currently has no JWT/authorizer configuration, so it does not yet satisfy the target authenticated browser connection.

AgentCore deployment is independent of the CDK stack in `infrastructure/`, and Amplify Hosting is a third deployment boundary. Deploying any one of the three does not deploy the others.

## Verification Gap

Manual helpers are available under `backend/voice_agent/tools/`: `test_voice_agent.py`, `test_voice_client.html`, and `generate_test_context.py`. There is currently no automated relay integration test. Add a mock-Nova WebSocket test covering session start, one audio input/output exchange, text output, interruption, and session end.
