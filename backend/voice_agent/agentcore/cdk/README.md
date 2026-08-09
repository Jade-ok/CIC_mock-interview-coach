# AgentCore CDK Project

This CDK project is managed by the AgentCore CLI and defines the hosted relay infrastructure with `@aws/agentcore-cdk` L3 constructs.

## Structure

- `bin/cdk.ts` — Entry point. Reads project configuration from `agentcore/` and creates a stack per deployment target.
- `lib/cdk-stack.ts` — Defines `AgentCoreStack`, which wraps the `AgentCoreApplication` L3 construct.
- `test/cdk.test.ts` — Unit tests for stack synthesis.

## Local validation

The AgentCore CLI and CI generate ignored `agentcore/aws-targets.json` for the selected environment. For a fresh manual validation, copy `agentcore/aws-targets.example.json` to that ignored path and replace its placeholder target values first.

- `npm run build` compile TypeScript to JavaScript
- `npm run test` run unit tests
- `npx cdk synth` emit the synthesized CloudFormation template
