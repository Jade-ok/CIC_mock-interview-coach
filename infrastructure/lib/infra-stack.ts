import * as cdk from 'aws-cdk-lib/core';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import { Construct } from 'constructs';
import * as path from 'path';

const TEXT_MODEL_ID = 'openai.gpt-oss-120b';

export class InfraStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const agentCoreRuntimeArn = new cdk.CfnParameter(this, 'AgentCoreRuntimeArn', {
      type: 'String',
      description: 'ARN of the AgentCore voice relay runtime for hosted browser sessions',
    });

    // ------------------------------------------------------------------
    // S3 Bucket — interview structure + interview profile configs
    // ------------------------------------------------------------------
    const configBucket = new s3.Bucket(this, 'InterviewConfigBucket', {
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
    });

    new s3deploy.BucketDeployment(this, 'InterviewConfigDeployment', {
      sources: [s3deploy.Source.asset(path.join(__dirname, '../../backend/config'))],
      destinationBucket: configBucket,
    });

    // ------------------------------------------------------------------
    // Shared CORS options for all Function URLs
    // ------------------------------------------------------------------
    const corsOptions: lambda.FunctionUrlCorsOptions = {
      allowedOrigins: ['*'],
      allowedMethods: [lambda.HttpMethod.POST],
      allowedHeaders: ['Content-Type'],
    };

    const functionAssetExcludes = [
      '.env*',
      '__pycache__',
      '**/__pycache__',
      '*.pyc',
      '**/*.pyc',
      'tests',
      'tests/**',
      'test_event.json',
    ];

    // ------------------------------------------------------------------
    // 1. Analyst Lambda — Bedrock Mantle (GPT OSS 120B)
    // ------------------------------------------------------------------
    const analystFn = new lambda.Function(this, 'AnalystFunction', {
      runtime: lambda.Runtime.PYTHON_3_12,
      code: lambda.Code.fromAsset(
        path.join(__dirname, '../../backend/functions/analyst'),
        { exclude: functionAssetExcludes }
      ),
      handler: 'handler.lambda_handler',
      // One initial Mantle call plus one schema-recovery call may each use
      // the Analyst client's 120-second read timeout.
      timeout: cdk.Duration.seconds(300),
      memorySize: 512,
    });

    const grantMantleInference = (fn: lambda.Function) => {
      fn.addToRolePolicy(
        new iam.PolicyStatement({
          actions: ['bedrock-mantle:CreateInference'],
          resources: ['*'],
          conditions: {
            StringEquals: { 'bedrock-mantle:Model': TEXT_MODEL_ID },
          },
        })
      );
      fn.addToRolePolicy(
        new iam.PolicyStatement({
          actions: [
            'bedrock-mantle:GetProject',
            'bedrock-mantle:ListProjects',
            'bedrock-mantle:ListTagsForResource',
          ],
          resources: ['*'],
        })
      );
    };

    grantMantleInference(analystFn);

    const analystUrl = analystFn.addFunctionUrl({
      authType: lambda.FunctionUrlAuthType.NONE,
      cors: corsOptions,
    });

    // ------------------------------------------------------------------
    // 2. Evaluator Lambda — Bedrock Mantle (GPT OSS 120B)
    // ------------------------------------------------------------------
    const evaluatorFn = new lambda.Function(this, 'EvaluatorFunction', {
      runtime: lambda.Runtime.PYTHON_3_12,
      code: lambda.Code.fromAsset(
        path.join(__dirname, '../../backend/functions/evaluator'),
        {
          exclude: [
            ...functionAssetExcludes,
            'README.md',
            'samconfig.toml',
            'template.yaml',
          ],
        }
      ),
      handler: 'lambda_handler.handler',
      // The Evaluator performs at most two 120-second Mantle attempts.
      timeout: cdk.Duration.seconds(300),
      memorySize: 512,
    });

    grantMantleInference(evaluatorFn);

    const evaluatorUrl = evaluatorFn.addFunctionUrl({
      authType: lambda.FunctionUrlAuthType.NONE,
      cors: corsOptions,
    });

    // ------------------------------------------------------------------
    // 3. Interviewer Lambda — context builder (S3 read, no LLM)
    // ------------------------------------------------------------------
    const interviewerFn = new lambda.Function(this, 'InterviewerFunction', {
      runtime: lambda.Runtime.PYTHON_3_12,
      code: lambda.Code.fromAsset(
        path.join(__dirname, '../../backend/functions/interviewer'),
        { exclude: functionAssetExcludes }
      ),
      handler: 'handler.lambda_handler',
      timeout: cdk.Duration.seconds(30),
      memorySize: 256,
      environment: {
        S3_BUCKET: configBucket.bucketName,
        INTERVIEW_STRUCTURE_KEY: 'interview_structure.json',
        INTERVIEW_PROFILE_KEY: 'student_interview_profile.json',
      },
    });

    configBucket.grantRead(interviewerFn);

    const interviewerUrl = interviewerFn.addFunctionUrl({
      authType: lambda.FunctionUrlAuthType.NONE,
      cors: corsOptions,
    });

    // ------------------------------------------------------------------
    // 4. PDF Parser Lambda — pypdf (bundled via Docker)
    // ------------------------------------------------------------------
    const pdfParserFn = new lambda.Function(this, 'PdfParserFunction', {
      runtime: lambda.Runtime.PYTHON_3_12,
      code: lambda.Code.fromAsset(path.join(__dirname, '../../backend/functions/pdf_parser'), {
        bundling: {
          image: lambda.Runtime.PYTHON_3_12.bundlingImage,
          command: [
            'bash',
            '-c',
            'pip install --no-compile pypdf -t /asset-output && cp ./*.py /asset-output',
          ],
        },
      }),
      handler: 'handler.lambda_handler',
      timeout: cdk.Duration.seconds(30),
      memorySize: 256,
    });

    const pdfParserUrl = pdfParserFn.addFunctionUrl({
      authType: lambda.FunctionUrlAuthType.NONE,
      cors: corsOptions,
    });

    // ------------------------------------------------------------------
    // 5. Voice session Lambda — short-lived AgentCore WebSocket URLs
    // ------------------------------------------------------------------
    const voiceSessionFn = new lambda.Function(this, 'VoiceSessionFunction', {
      runtime: lambda.Runtime.PYTHON_3_12,
      code: lambda.Code.fromAsset(
        path.join(__dirname, '../../backend/functions/voice_session'),
        { exclude: functionAssetExcludes }
      ),
      handler: 'handler.lambda_handler',
      timeout: cdk.Duration.seconds(10),
      memorySize: 128,
      environment: {
        AGENTCORE_RUNTIME_ARN: agentCoreRuntimeArn.valueAsString,
      },
    });

    voiceSessionFn.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['bedrock-agentcore:InvokeAgentRuntimeWithWebSocketStream'],
        resources: [
          agentCoreRuntimeArn.valueAsString,
          `${agentCoreRuntimeArn.valueAsString}/runtime-endpoint/*`,
        ],
      })
    );

    const voiceSessionUrl = voiceSessionFn.addFunctionUrl({
      authType: lambda.FunctionUrlAuthType.NONE,
      cors: corsOptions,
    });

    // ------------------------------------------------------------------
    // Outputs — hosted frontend configuration
    // ------------------------------------------------------------------
    new cdk.CfnOutput(this, 'AnalystUrl', { value: analystUrl.url });
    new cdk.CfnOutput(this, 'EvaluatorUrl', { value: evaluatorUrl.url });
    new cdk.CfnOutput(this, 'InterviewerUrl', { value: interviewerUrl.url });
    new cdk.CfnOutput(this, 'PdfParserUrl', { value: pdfParserUrl.url });
    new cdk.CfnOutput(this, 'VoiceSessionUrl', { value: voiceSessionUrl.url });
    new cdk.CfnOutput(this, 'ConfigBucketName', { value: configBucket.bucketName });
  }
}
