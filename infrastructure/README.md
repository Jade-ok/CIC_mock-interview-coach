# Infrastructure

AWS CDK application for the deployed Mock Interview Coach backend. It defines the CloudFront, Lambda, S3, DynamoDB, monitoring, and budget resources alongside the separate Amplify Hosting and AgentCore Runtime boundaries.

## Provisioned Resources

- Six Python Lambdas: Demo Session, PDF Parser, Analyst, Interviewer, Evaluator, and Voice Session
- Private IAM-protected Function URLs for those Lambdas
- A CloudFront distribution with Lambda Function URL Origin Access Control
- An S3 bucket containing the files from `backend/config/`
- An on-demand DynamoDB table containing only expiring hashed session/quota records
- A shared Lambda session-authorization layer
- Model-scoped Bedrock Mantle permissions for Analyst and Evaluator to use `openai.gpt-oss-120b`
- S3 read permission for Interviewer

The hosted application also includes:

- React/Vite hosted by AWS Amplify Hosting
- Short-lived SigV4-signed `wss://` URLs created by the Voice Session Lambda
- The Python voice relay on Amazon Bedrock AgentCore Runtime
- Nova 2 Sonic invoked only by the relay

AgentCore is a serverless managed container runtime and is not part of this CDK stack. Amplify Hosting is also separate from this stack.

The Lambda Function URLs use `AWS_IAM` authentication and accept origin calls from a single CloudFront distribution through Origin Access Control. Direct anonymous Function URL calls are rejected. The Voice Session role is scoped to one AgentCore runtime and its endpoints, and its signed URLs expire after five minutes.

## Security and Cost Controls

The application intentionally has no end-user login. The Demo Session Lambda atomically admits at most 100 hosted sessions globally and 100 per trusted viewer IP per UTC day by default. Its two-hour opaque tokens are stored only as SHA-256 digests, bound to the viewer-IP digest, and constrained by per-stage attempt counts. The values are deployment parameters, and pure local mode bypasses these hosted admission controls. Alarms, the default $25 account-wide budget, hosted model/session caps, and the emergency switch provide additional cost controls. Optional nonzero concurrency caps default off because the target AWS account must retain enough unreserved Lambda concurrency for them to deploy.

The stack does not provision AWS WAF, avoiding its fixed monthly web-ACL baseline. Monitoring, bounded model calls, input limits, and the emergency switch remain necessary.

## Automated Delivery

Path-filtered GitHub Actions workflows publish changes from `main`. The application workflow serializes matching revisions by testing and deploying `MockInterviewStack` through CDK before building React/Vite and publishing that same revision to the existing manual Amplify app. Voice-relay changes update AgentCore separately; both paths reject stale revisions and share one production concurrency lock. AWS access uses temporary OIDC credentials from a role whose trust is restricted to the immutable repository identity and `refs/heads/main`; no long-lived AWS deployment keys are stored in GitHub.

The deployment role ARN, Amplify app ID, and cost-alert email are repository variables. Optional hosted-limit variables supply the values described under Security and Cost Controls; source-level parameter bounds prevent larger values. Account IDs, physical resource names, endpoint URLs, email values, and generated environment state stay out of tracked documentation. Changes to `deployment-automation-stack.ts` or its entry point are excluded from the application workflow and require an explicit update of that bootstrap stack.

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
