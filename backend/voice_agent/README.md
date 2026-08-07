# Voice Agent Relay

FastAPI WebSocket relay designed for deployment to Amazon Bedrock AgentCore Runtime. It connects each browser WebSocket session to an Amazon Nova 2 Sonic bidirectional stream.

AgentCore Runtime is a serverless managed container runtime. This project supplies the Python container and pays for usage; AWS manages the underlying hosts and scaling. The relay is still backend application code, but there is no EC2 server to provision or administer.

## Files

- `server.py` — FastAPI WebSocket endpoints at `/` and `/ws`, plus `/health`
- `protocol.py` — browser `{type, payload}` to/from Nova event adapter
- `s2s_session_manager.py` — Nova stream lifecycle and audio queue
- `s2s_events.py` — Nova protocol event builders
- `Dockerfile` — Python 3.12 container on port 8080
- `.bedrock_agentcore.yaml` — local, generated AgentCore deployment configuration (ignored by Git)

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

Check `http://localhost:8080/health`. Local WebSocket clients can use `ws://localhost:8080/`; AgentCore uses `/ws`.

The relay resolves credentials through boto3's standard chain. For local development, set `AWS_PROFILE=mock-interview-dev` after signing in with IAM Identity Center. In AgentCore, the same resolver uses the runtime execution-role credentials; do not inject permanent access keys.

## AgentCore Deployment

This relay currently uses the legacy Python Starter Toolkit layout and commands below. AWS now recommends the Node-based [`@aws/agentcore` CLI](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/runtime-get-started-cli.html), which uses `agentcore/agentcore.json` and `agentcore/aws-targets.json` instead of `.bedrock_agentcore.yaml`. Do not mix the two formats. Migrating this custom FastAPI WebSocket project to the current CLI is pending and should be completed before production deployment.

If temporarily using the already-installed Starter Toolkit, configure AWS credentials for the deployment account and run:

From `backend/voice_agent/`:

```bash
AWS_PROFILE=mock-interview-dev agentcore configure

AWS_PROFILE=mock-interview-dev agentcore deploy -a mock-interview-voice-agent \
  --env AWS_REGION=us-east-1 \
  --env MODEL_ID=amazon.nova-2-sonic-v1:0

AWS_PROFILE=mock-interview-dev agentcore status
```

`agentcore configure` creates account-specific values in `.bedrock_agentcore.yaml`. That file is intentionally ignored so credentials and resource identifiers from one AWS account cannot be reused accidentally in another. Review the account, execution role, ECR repository, CodeBuild role/bucket, network configuration, and authorizer settings before deploying. A default local configuration has no JWT/authorizer configuration, so it does not yet satisfy the target authenticated browser connection.

AgentCore deployment is independent of the CDK stack in `infrastructure/`, and Amplify Hosting is a third deployment boundary. Deploying any one of the three does not deploy the others.

The repository-level `scripts/deploy.sh` deploys the CDK backend by default. Its legacy AgentCore step is intentionally disabled unless `DEPLOY_LEGACY_AGENTCORE=true` is supplied; when enabled, the script refuses to deploy if the generated YAML account or Region differs from the active AWS profile.

## Verification

`tests/unit/test_voice_protocol.py` covers the pure adapter and exercises the WebSocket endpoint with a fake Nova session manager, so it does not invoke paid services. Manual helpers remain under `backend/voice_agent/tools/`: `test_voice_agent.py`, `test_voice_client.html`, and `generate_test_context.py`. A live browser session covering real Nova audio, transcript, interruption, and shutdown remains pending.
