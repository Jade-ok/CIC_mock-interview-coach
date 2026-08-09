import * as cdk from 'aws-cdk-lib/core';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';

export interface DeploymentAutomationStackProps extends cdk.StackProps {
  readonly githubOwner: string;
  readonly githubOwnerId: string;
  readonly githubRepository: string;
  readonly githubRepositoryId: string;
}

/**
 * One-time CI bootstrap for GitHub Actions.
 *
 * Application deployments use this role only to discover the current hosted
 * resources and assume the account-local CDK bootstrap roles. No long-lived
 * AWS access keys are stored in GitHub.
 */
export class DeploymentAutomationStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: DeploymentAutomationStackProps) {
    super(scope, id, props);

    const amplifyAppId = new cdk.CfnParameter(this, 'AmplifyAppId', {
      type: 'String',
      description: 'Existing manual Amplify app updated by the frontend workflow',
      allowedPattern: 'd[a-z0-9]+',
    });

    const githubProvider = new iam.OpenIdConnectProvider(this, 'GitHubOidcProvider', {
      url: 'https://token.actions.githubusercontent.com',
      clientIds: ['sts.amazonaws.com'],
    });

    const subject =
      `repo:${props.githubOwner}@${props.githubOwnerId}/` +
      `${props.githubRepository}@${props.githubRepositoryId}:ref:refs/heads/main`;
    const deployRole = new iam.Role(this, 'GitHubActionsDeployRole', {
      assumedBy: new iam.WebIdentityPrincipal(githubProvider.openIdConnectProviderArn, {
        StringEquals: {
          'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com',
          'token.actions.githubusercontent.com:sub': subject,
        },
      }),
      description: `Deploys ${props.githubOwner}/${props.githubRepository} from GitHub Actions`,
      maxSessionDuration: cdk.Duration.hours(1),
    });

    deployRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ['sts:AssumeRole'],
        resources: [
          `arn:${cdk.Aws.PARTITION}:iam::${cdk.Aws.ACCOUNT_ID}:role/cdk-hnb659fds-*-${cdk.Aws.ACCOUNT_ID}-${cdk.Aws.REGION}`,
        ],
      })
    );

    deployRole.addToPolicy(
      new iam.PolicyStatement({
        actions: [
          'cloudformation:DescribeStacks',
          'cloudformation:GetTemplate',
          'cloudformation:ListStacks',
          'ssm:GetParameter',
          'bedrock-agentcore:ListAgentRuntimes',
        ],
        resources: ['*'],
      })
    );

    const amplifyAppArn = `arn:${cdk.Aws.PARTITION}:amplify:${cdk.Aws.REGION}:${cdk.Aws.ACCOUNT_ID}:apps/${amplifyAppId.valueAsString}`;
    deployRole.addToPolicy(
      new iam.PolicyStatement({
        actions: [
          'amplify:GetApp',
          'amplify:GetBranch',
          'amplify:UpdateBranch',
          'amplify:CreateDeployment',
          'amplify:StartDeployment',
          'amplify:GetJob',
        ],
        resources: [amplifyAppArn, `${amplifyAppArn}/*`],
      })
    );

    new cdk.CfnOutput(this, 'GitHubActionsDeployRoleArn', {
      value: deployRole.roleArn,
      description: 'Set this value as the AWS_DEPLOY_ROLE_ARN GitHub Actions variable',
    });
  }
}
