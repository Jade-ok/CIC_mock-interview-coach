# Infrastructure

AWS CDK application for the deployed Mock Interview Coach Lambda/S3 backend. It is one boundary of the full-stack architecture alongside Amplify Hosting and AgentCore Runtime.

## Provisioned Resources

- Five Python 3.12 Lambdas: PDF Parser, Analyst, Interviewer, Evaluator, and Voice Session
- Public Function URLs for those Lambdas
- An S3 bucket containing the files from `backend/config/`
- Model-scoped Bedrock Mantle permissions for Analyst and Evaluator to use `openai.gpt-oss-120b`
- S3 read permission for Interviewer

The hosted application also includes:

- React/Vite hosted by AWS Amplify Hosting
- Short-lived SigV4-signed `wss://` URLs created by the Voice Session Lambda
- The Python voice relay on Amazon Bedrock AgentCore Runtime
- Nova 2 Sonic invoked only by the relay

AgentCore is a serverless managed container runtime and is not part of this CDK stack. Amplify Hosting is also separate from this stack.

The Lambda Function URLs are public (`NONE` authentication with wildcard CORS). The Voice Session role is scoped to one AgentCore runtime and its endpoints, and its signed URLs expire after five minutes; the no-login architecture still requires budgets and monitoring because public endpoints can incur model usage.

## Automated Delivery

Path-filtered GitHub Actions workflows publish changes from `main`. Backend and configuration changes test and deploy `MockInterviewStack` through CDK, voice-relay changes update the AgentCore runtime through the AgentCore CLI, and frontend changes build React/Vite and publish to the existing manual Amplify app. AWS access uses temporary OIDC credentials from a role whose trust is restricted to the immutable repository identity and `refs/heads/main`; no long-lived AWS deployment keys are stored in GitHub.

The deployment role ARN and Amplify app ID are repository variables. Account IDs, physical resource names, endpoint URLs, and generated environment state stay out of tracked documentation.

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

`npm test` is configured for Jest with `--passWithNoTests`; infrastructure correctness is also checked by the TypeScript build and CDK synthesis.

See `../docs/guides/infra-breakdown.md` for resource layout and local troubleshooting.
