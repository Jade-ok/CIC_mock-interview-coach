# Voice Agent Relay

FastAPI WebSocket relay designed for deployment to Amazon Bedrock AgentCore Runtime. It connects each browser WebSocket session to an Amazon Nova 2 Sonic bidirectional stream.

AgentCore Runtime is a serverless managed container runtime. This project supplies the Python container and pays for usage; AWS manages the underlying hosts and scaling. The relay is still backend application code, but there is no EC2 server to provision or administer.

## Files

- `server.py` — FastAPI WebSocket endpoints at `/` and `/ws`, plus `/ping` and `/health`
- `protocol.py` — browser `{type, payload}` to/from Nova event adapter
- `s2s_session_manager.py` — Nova stream lifecycle and audio queue
- `s2s_events.py` — Nova protocol event builders
- `Dockerfile` — Python 3.12 container on port 8080
- `agentcore/` — current AgentCore CLI configuration and generated CDK application

## Runtime

- Region: `us-east-1`
- Model: `amazon.nova-2-sonic-v1:0`
- Input audio: 16 kHz, 16-bit, mono LPCM
- Output audio: 24 kHz, 16-bit, mono LPCM

The browser and relay share the application-level `{type, payload}` contract defined by `frontend/src/services/webSocketClient.ts`. The relay owns Nova prompt/content identifiers, expands `session_start` into the required Nova event sequence, acknowledges setup with `session_start_ack`, routes audio through its bounded queue, and converts Nova audio/text/tool/interruption output back to browser events. For `end_interview`, the relay sends Nova's required `toolResult` immediately, waits for `completionEnd`, and only then releases the browser-facing `tool_use`; this preserves closing audio before shutdown. Focused unit tests cover the adapter; a live Nova browser session still needs end-to-end verification.

The target production path is:

```text
React/Vite on Amplify Hosting
  └─ authenticated WSS ─> AgentCore Runtime relay ─> Nova 2 Sonic
```

Amplify Hosting does not proxy or authenticate this WebSocket automatically. Browser authentication/authorization and the public `wss://` endpoint are planned but not implemented in the repository. Use short-lived credentials or tokens supported by the selected AgentCore authorizer; never bundle permanent AWS credentials into the frontend.

## Local Run

The combined local backend resolves credentials through boto3's standard chain. Use a configured AWS profile with access to GPT OSS 120B and Nova 2 Sonic:

```bash
export AWS_PROFILE="<profile-name>"
export AWS_REGION="us-east-1"
```

Alternatively, export access keys in the relay terminal. `AWS_SESSION_TOKEN` is required only for temporary credentials:

```bash
export AWS_ACCESS_KEY_ID="..."
export AWS_SECRET_ACCESS_KEY="..."
export AWS_SESSION_TOKEN="..."
export AWS_REGION="us-east-1"
```

The server prints the active AWS account and ARN during startup. All local model usage is attributed to that credential identity. The hosted AgentCore runtime uses its execution-role identity. AWS credentials belong in backend runtime configuration rather than frontend variables.

Start the complete local application backend from the repository root:

```bash
python3 -m venv .venv
.venv/bin/pip install -r backend/requirements-local.txt
aws sts get-caller-identity
.venv/bin/uvicorn backend.local_server:app --host 127.0.0.1 --port 8080
```

The combined server exposes HTTP handlers under `/api`, WebSocket routes at `/` and `/ws`, and health checks at `/api/health`, `/ping`, and `/health`.

## Hosted Runtime

The hosted architecture runs this relay on AgentCore and serves the React frontend through Amplify. AgentCore, Amplify, and the Lambda/S3 backend are separate infrastructure boundaries. Environment-specific target files, generated runtime state, account IDs, endpoints, and credentials are not committed.

## Verification

`tests/unit/test_voice_protocol.py` covers the pure adapter and exercises the WebSocket endpoint with a fake Nova session manager, so it does not invoke paid services. Manual helpers remain under `backend/voice_agent/tools/`: `test_voice_agent.py`, `test_voice_client.html`, and `generate_test_context.py`. A live browser session covering real Nova audio, transcript, interruption, and shutdown remains pending.
