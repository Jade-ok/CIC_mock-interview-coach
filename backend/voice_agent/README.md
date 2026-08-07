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

From `backend/voice_agent/`, with AWS credentials and Nova model access available:

```bash
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/uvicorn server:app --host 0.0.0.0 --port 8080
```

Check `http://localhost:8080/ping` (AgentCore) or `http://localhost:8080/health` (local alias). Local WebSocket clients can use `ws://localhost:8080/`; AgentCore uses `/ws`.

The relay resolves credentials through boto3's standard chain. Teammates without AgentCore access can export temporary AWS credentials with Nova 2 Sonic access in the relay terminal:

```bash
export AWS_ACCESS_KEY_ID="..."
export AWS_SECRET_ACCESS_KEY="..."
export AWS_SESSION_TOKEN="..."
export AWS_REGION="us-east-1"
```

They then use `ws://localhost:8080/` and do not invoke AgentCore. In AgentCore, the same resolver uses runtime execution-role credentials. Never place either credential type in frontend variables.

## AgentCore Deployment

The relay uses the Node-based [`@aws/agentcore` CLI](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/runtime-get-started-cli.html). Install Node.js 20 or later and the CLI, then deploy from `backend/voice_agent/`:

```bash
npm install --global @aws/agentcore

AWS_PROFILE=<deployment-profile> AWS_REGION=us-east-1 \
  agentcore validate

AWS_PROFILE=<deployment-profile> AWS_REGION=us-east-1 \
  agentcore deploy --target <target-name>

AWS_PROFILE=<deployment-profile> AWS_REGION=us-east-1 \
  agentcore status --target <target-name>
```

Copy `agentcore/aws-targets.example.json` to ignored `agentcore/aws-targets.json` and replace the placeholder account and target name locally. Generated deployment state is also ignored so account IDs and runtime ARNs are never committed. The runtime uses AWS IAM authorization for initial deployment and testing. Amplify browser access still requires the planned Cognito/OIDC custom-JWT integration; never place AWS credentials in frontend environment variables.

The CLI uses the checked-in `Dockerfile` as a remote CodeBuild container build. Docker Desktop is not required for this deployment path, although it remains useful for local container testing.

AgentCore deployment is independent of the CDK stack in `infrastructure/`, and Amplify Hosting is a third deployment boundary. Deploying any one of the three does not deploy the others.

The repository-level `scripts/deploy.sh` deploys the Lambda/S3 CDK backend. AgentCore remains a separate deployment boundary and uses the commands above.

## Verification

`tests/unit/test_voice_protocol.py` covers the pure adapter and exercises the WebSocket endpoint with a fake Nova session manager, so it does not invoke paid services. Manual helpers remain under `backend/voice_agent/tools/`: `test_voice_agent.py`, `test_voice_client.html`, and `generate_test_context.py`. A live browser session covering real Nova audio, transcript, interruption, and shutdown remains pending.
