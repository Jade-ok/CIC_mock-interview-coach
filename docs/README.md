# Documentation Index

Last verified: 2026-08-07.

## Current Guides

- `guides/frontend-backend-wiring.md` — implemented integration state, target Amplify/AgentCore topology, exact HTTP contracts, and known gaps
- `guides/infra-breakdown.md` — CDK resources, hosted architecture boundaries, outputs, and local troubleshooting
- `../backend/voice_agent/README.md` — local Nova relay and hosted AgentCore runtime architecture
- `../backend/functions/evaluator/README.md` — Evaluator input, output, implementation details, and local tests

## Historical Reference

- `guides/frontend-integration-guide.md` — retired Cognito/direct-Bedrock experiment; preserved for architecture context only

## Kiro Documentation Lifecycle

- `.kiro/steering/*.md` is active cross-project guidance.
- `.kiro/specs/**/requirements.md` and `design.md` are maintained requirements/design documents.
- Task files identify themselves as either active trackers or historical implementation records.
- Generated `*.meta.json` files preserve Kiro execution history and may contain historical wording.

The JSON files in `schemas/` are descriptive cross-component payload shapes, not machine-validatable JSON Schema documents. Runtime validators and handlers define enforced behavior. When documentation disagrees, use current code and `infrastructure/lib/infra-stack.ts` as implementation truth, then update the maintained document and its descriptive schema together.

## Architecture Status

The hosted architecture is a React/Vite frontend on AWS Amplify Hosting, with authenticated browser WebSocket sessions connecting to an Amazon Bedrock AgentCore Runtime voice relay. AgentCore is a serverless managed container runtime; AWS operates and scales the underlying compute while this project owns the Python relay. The relay invokes Nova 2 Sonic. Four Lambda functions provide PDF parsing, resume analysis, interview context construction, and evaluation, while S3 stores interview configuration and CDK defines the Lambda/S3 backend.

That target is not yet the implemented end-to-end state. The browser/relay protocol adapter and environment-driven WebSocket URL are implemented and unit-tested, with a local URL fallback and an opt-in mock. Live Nova verification, Amplify Hosting, and browser authentication are not defined or verified yet. Maintained guides must label those items as planned until their code and infrastructure exist.

For local development, one Python process runs the four HTTP handlers and Nova voice relay using the developer's AWS credential chain. The credentials must allow Sonnet 4.6 and Nova 2 Sonic, and startup prints the active AWS identity. See `guides/frontend-backend-wiring.md` for the complete workflow. Hosted operation uses the Amplify + AgentCore architecture.
