#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib/core';
import { DeploymentAutomationStack } from '../lib/deployment-automation-stack';

const app = new cdk.App();

new DeploymentAutomationStack(app, 'MockInterviewDeploymentAutomationStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: 'us-east-1',
  },
  githubOwner: 'Jade-ok',
  githubRepository: 'CIC_mock-interview-coach',
});
