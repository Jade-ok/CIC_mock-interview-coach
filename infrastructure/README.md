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

AgentCore is a serverless managed container runtime and is not part of this CDK stack. Amplify Hosting and authentication are also separate from this stack.

The Lambda Function URLs are currently public (`NONE` authentication with wildcard CORS). The hosted architecture requires an authenticated API boundary before the Amplify application is treated as public production infrastructure.

## Prerequisites

- Node.js and npm
- Docker running for PDF Parser dependency bundling

## Local Validation

Run from `infrastructure/`:

```bash
npm ci
npm run build
npx cdk synth
```

`npm test` is configured for Jest, but this directory currently contains no infrastructure test suite.

See `../docs/guides/infra-breakdown.md` for resource layout and local troubleshooting.
