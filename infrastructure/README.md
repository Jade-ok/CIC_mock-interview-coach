# Infrastructure

AWS CDK application for the Mock Interview Coach Lambda/S3 backend. It is one deployment boundary within the planned full-stack architecture.

## Provisioned Resources

- Five Python 3.12 Lambdas: PDF Parser, Analyst, Interviewer, Evaluator, and Voice Session
- Public Function URLs for those Lambdas
- An S3 bucket containing the files from `backend/config/`
- Bedrock permissions for Analyst and Evaluator
- S3 read permission for Interviewer

The target deployment also includes:

- React/Vite hosted by AWS Amplify Hosting
- Short-lived SigV4-signed `wss://` URLs created by the Voice Session Lambda
- The Python voice relay on Amazon Bedrock AgentCore Runtime
- Nova 2 Sonic invoked only by the relay

AgentCore is a serverless managed container runtime and is not part of this CDK stack. Amplify Hosting is also separate from this stack.

The Lambda Function URLs are public (`NONE` authentication with wildcard CORS). The Voice Session role is scoped to one AgentCore runtime and its endpoints, and its signed URLs expire after five minutes; the no-login architecture still requires budgets and monitoring because public endpoints can incur model usage.

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
