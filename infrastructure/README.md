# Infrastructure

AWS CDK application for the deployed Mock Interview Coach Lambda/S3 backend. It is one boundary of the full-stack architecture alongside Amplify Hosting and AgentCore Runtime.

## Provisioned Resources

- Five Python 3.12 Lambdas: PDF Parser, Analyst, Interviewer, Evaluator, and Voice Session
- Private IAM-protected Function URLs for those Lambdas
- A public CloudFront distribution with Lambda Function URL Origin Access Control
- An S3 bucket containing the files from `backend/config/`
- Model-scoped Bedrock Mantle permissions for Analyst and Evaluator to use `openai.gpt-oss-120b`
- S3 read permission for Interviewer
- Optional reserved-concurrency caps for all five hosted functions (disabled by default until the account quota supports them)
- Invocation/error/throttle CloudWatch alarms, an SNS email topic, and a monthly AWS cost budget
- A parameterized emergency switch that disables the hosted functions by setting reserved concurrency to zero

The hosted application also includes:

- React/Vite hosted by AWS Amplify Hosting
- Short-lived SigV4-signed `wss://` URLs created by the Voice Session Lambda
- The Python voice relay on Amazon Bedrock AgentCore Runtime
- Nova 2 Sonic invoked only by the relay

AgentCore is a serverless managed container runtime and is not part of this CDK stack. Amplify Hosting is also separate from this stack.

The Lambda Function URLs use `AWS_IAM` authentication and accept origin calls from a single CloudFront distribution through Origin Access Control. The browser uses one public CloudFront API base URL; direct anonymous Function URL calls are rejected. The Voice Session role is scoped to one AgentCore runtime and its endpoints, and its signed URLs expire after five minutes. Alarms, the default $25 account-wide budget, hosted model/session caps, and the emergency switch reduce the remaining no-login exposure. Optional nonzero concurrency caps default off because the target AWS account must retain enough unreserved Lambda concurrency for them to deploy.

The stack does not provision AWS WAF, so it avoids WAF's fixed monthly web-ACL baseline. CloudFront remains usage-priced and publicly reachable; monitoring, bounded model calls, input limits, and the emergency switch remain necessary.

## Automated Delivery

Path-filtered GitHub Actions workflows publish changes from `main`. The application workflow serializes matching revisions by testing and deploying `MockInterviewStack` through CDK before building React/Vite and publishing that same revision to the existing manual Amplify app. Voice-relay changes update AgentCore separately; both paths reject stale revisions and share one production concurrency lock. AWS access uses temporary OIDC credentials from a role whose trust is restricted to the immutable repository identity and `refs/heads/main`; no long-lived AWS deployment keys are stored in GitHub.

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
