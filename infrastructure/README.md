# Infrastructure

AWS CDK application for the Mock Interview Coach Lambda/S3 backend. It is one deployment boundary within the planned full-stack architecture.

## Provisioned Resources

- Four Python 3.12 Lambdas: PDF Parser, Analyst, Interviewer, and Evaluator
- Public Function URLs for those Lambdas
- An S3 bucket containing the files from `backend/config/`
- Bedrock permissions for Analyst and Evaluator
- S3 read permission for Interviewer

The target deployment also includes:

- React/Vite hosted by AWS Amplify Hosting
- Browser authentication with an AgentCore-supported authorization flow
- An authenticated `wss://` connection to the Python voice relay on Amazon Bedrock AgentCore Runtime
- Nova 2 Sonic invoked only by the relay

AgentCore is a serverless managed container runtime, but it is not part of this CDK stack; deploy the relay separately from `backend/voice_agent/`. Amplify Hosting and authentication are also not provisioned here yet.

The Lambda Function URLs are currently public (`NONE` authentication with wildcard CORS). Protect them or put them behind an authenticated API boundary before treating the Amplify deployment as public production infrastructure.

## Prerequisites

- Node.js and npm
- AWS CLI credentials for the target account
- Docker running for PDF Parser dependency bundling
- CDK bootstrap completed in `us-east-1`

## Commands

Run from `infrastructure/`:

```bash
npm ci
npm run build
npx cdk synth
npx cdk diff
npx cdk deploy
```

### Optional isolated Claude stack

For a temporary split-account deployment, create Analyst and Evaluator in a
separate stack without modifying `MockInterviewStack`:

```bash
npx cdk deploy \
  --app "npx tsc && npx tsx bin/claude-agents.ts" \
  MockInterviewWorkshopClaudeStack \
  --profile mock-interview-workshop
```

This optional stack contains only the two Claude Lambdas, scoped Bedrock
permissions, and Function URLs. It is independent of PDF Parser, Interviewer,
S3 configuration, AgentCore, and Amplify. Use its outputs temporarily, then
switch the frontend back to the canonical account and destroy this isolated
stack when it is no longer needed.

`npm test` is configured for Jest, but this directory currently contains no infrastructure test suite.

See `../docs/guides/infra-breakdown.md` for resource layout, outputs, deployment scope, and troubleshooting.
