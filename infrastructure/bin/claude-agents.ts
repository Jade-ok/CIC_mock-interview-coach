#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib/core';
import { ClaudeAgentsStack } from '../lib/claude-agents-stack';

const app = new cdk.App();
new ClaudeAgentsStack(app, 'MockInterviewWorkshopClaudeStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: 'us-east-1',
  },
  description: 'Isolated temporary Analyst and Evaluator deployment for Claude access',
});
