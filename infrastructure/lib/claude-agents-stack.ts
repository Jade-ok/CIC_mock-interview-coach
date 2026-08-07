import * as cdk from 'aws-cdk-lib/core';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { Construct } from 'constructs';
import * as path from 'path';

const MODEL_ID = 'global.anthropic.claude-sonnet-4-6';
const FOUNDATION_MODEL_ID = 'anthropic.claude-sonnet-4-6';

/** Isolated Analyst/Evaluator deployment for a temporary split account. */
export class ClaudeAgentsStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const cors: lambda.FunctionUrlCorsOptions = {
      allowedOrigins: ['*'],
      allowedMethods: [lambda.HttpMethod.POST],
      allowedHeaders: ['Content-Type'],
    };
    const commonExcludes = [
      '.env*', '__pycache__', '**/__pycache__', '*.pyc', '**/*.pyc',
      'tests', 'tests/**', 'test_event.json',
    ];

    const analyst = new lambda.Function(this, 'AnalystFunction', {
      runtime: lambda.Runtime.PYTHON_3_12,
      code: lambda.Code.fromAsset(
        path.join(__dirname, '../../backend/functions/analyst'),
        { exclude: commonExcludes }
      ),
      handler: 'handler.lambda_handler',
      timeout: cdk.Duration.seconds(300),
      memorySize: 512,
    });

    const evaluator = new lambda.Function(this, 'EvaluatorFunction', {
      runtime: lambda.Runtime.PYTHON_3_12,
      code: lambda.Code.fromAsset(
        path.join(__dirname, '../../backend/functions/evaluator'),
        {
          exclude: [
            ...commonExcludes,
            'README.md',
            'samconfig.toml',
            'template.yaml',
          ],
        }
      ),
      handler: 'lambda_handler.handler',
      timeout: cdk.Duration.seconds(300),
      memorySize: 512,
    });

    const bedrockResources = [
      `arn:${cdk.Aws.PARTITION}:bedrock:${cdk.Aws.REGION}:${cdk.Aws.ACCOUNT_ID}:inference-profile/${MODEL_ID}`,
      `arn:${cdk.Aws.PARTITION}:bedrock:${cdk.Aws.REGION}::foundation-model/${FOUNDATION_MODEL_ID}`,
      `arn:${cdk.Aws.PARTITION}:bedrock:::foundation-model/${FOUNDATION_MODEL_ID}`,
    ];
    for (const fn of [analyst, evaluator]) {
      fn.addToRolePolicy(new iam.PolicyStatement({
        actions: ['bedrock:InvokeModel'],
        resources: bedrockResources,
      }));
    }

    const analystUrl = analyst.addFunctionUrl({
      authType: lambda.FunctionUrlAuthType.NONE,
      cors,
    });
    const evaluatorUrl = evaluator.addFunctionUrl({
      authType: lambda.FunctionUrlAuthType.NONE,
      cors,
    });

    new cdk.CfnOutput(this, 'AnalystUrl', { value: analystUrl.url });
    new cdk.CfnOutput(this, 'EvaluatorUrl', { value: evaluatorUrl.url });
  }
}
