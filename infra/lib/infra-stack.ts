import * as cdk from 'aws-cdk-lib/core';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';

export class InfraStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // ------------------------------------------------------------------
    // S3 Bucket — interview structure + interview profile configs
    // ------------------------------------------------------------------
    const configBucket = new s3.Bucket(this, 'InterviewConfigBucket', {
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
    });

    // ------------------------------------------------------------------
    // Shared CORS options for all Function URLs
    // ------------------------------------------------------------------
    const corsOptions: lambda.FunctionUrlCorsOptions = {
      allowedOrigins: ['*'],
      allowedMethods: [lambda.HttpMethod.POST],
      allowedHeaders: ['Content-Type'],
    };

    // ------------------------------------------------------------------
    // 1. Analyst Lambda — Bedrock (Claude)
    // ------------------------------------------------------------------
    const analystFn = new lambda.Function(this, 'AnalystFunction', {
      functionName: 'mock-interview-analyst',
      runtime: lambda.Runtime.PYTHON_3_12,
      code: lambda.Code.fromAsset('../analyst'),
      handler: 'analyst.handler.lambda_handler',
      timeout: cdk.Duration.seconds(60),
      memorySize: 512,
    });

    analystFn.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['bedrock:InvokeModel'],
        resources: ['*'],
      })
    );

    const analystUrl = analystFn.addFunctionUrl({
      authType: lambda.FunctionUrlAuthType.NONE,
      cors: corsOptions,
    });

    // ------------------------------------------------------------------
    // 2. Evaluator Lambda — Bedrock (Claude)
    // ------------------------------------------------------------------
    const evaluatorFn = new lambda.Function(this, 'EvaluatorFunction', {
      functionName: 'mock-interview-evaluator',
      runtime: lambda.Runtime.PYTHON_3_12,
      code: lambda.Code.fromAsset('../evaluator'),
      handler: 'evaluator.handler.lambda_handler',
      timeout: cdk.Duration.seconds(60),
      memorySize: 512,
    });

    evaluatorFn.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['bedrock:InvokeModel'],
        resources: ['*'],
      })
    );

    const evaluatorUrl = evaluatorFn.addFunctionUrl({
      authType: lambda.FunctionUrlAuthType.NONE,
      cors: corsOptions,
    });

    // ------------------------------------------------------------------
    // 3. Interviewer Lambda — context builder (S3 read, no LLM)
    // ------------------------------------------------------------------
    const interviewerFn = new lambda.Function(this, 'InterviewerFunction', {
      functionName: 'mock-interview-interviewer',
      runtime: lambda.Runtime.PYTHON_3_12,
      code: lambda.Code.fromAsset('../interviewer'),
      handler: 'interviewer.handler.lambda_handler',
      timeout: cdk.Duration.seconds(30),
      memorySize: 256,
      environment: {
        CONFIG_BUCKET: configBucket.bucketName,
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
      functionName: 'mock-interview-pdf-parser',
      runtime: lambda.Runtime.PYTHON_3_12,
      code: lambda.Code.fromAsset('../pdf_parser', {
        bundling: {
          image: lambda.Runtime.PYTHON_3_12.bundlingImage,
          command: [
            'bash',
            '-c',
            'pip install pypdf -t /asset-output && cp -r . /asset-output',
          ],
        },
      }),
      handler: 'pdf_parser.handler.lambda_handler',
      timeout: cdk.Duration.seconds(30),
      memorySize: 256,
    });

    const pdfParserUrl = pdfParserFn.addFunctionUrl({
      authType: lambda.FunctionUrlAuthType.NONE,
      cors: corsOptions,
    });

    // ------------------------------------------------------------------
    // 5. Polly Lambda — Amazon Polly TTS
    // ------------------------------------------------------------------
    const pollyFn = new lambda.Function(this, 'PollyFunction', {
      functionName: 'mock-interview-polly',
      runtime: lambda.Runtime.PYTHON_3_12,
      code: lambda.Code.fromAsset('../polly'),
      handler: 'polly.handler.lambda_handler',
      timeout: cdk.Duration.seconds(30),
      memorySize: 256,
    });

    pollyFn.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['polly:SynthesizeSpeech'],
        resources: ['*'],
      })
    );

    const pollyUrl = pollyFn.addFunctionUrl({
      authType: lambda.FunctionUrlAuthType.NONE,
      cors: corsOptions,
    });

    // ------------------------------------------------------------------
    // Outputs — Function URLs for the frontend .env
    // ------------------------------------------------------------------
    new cdk.CfnOutput(this, 'AnalystUrl', { value: analystUrl.url });
    new cdk.CfnOutput(this, 'EvaluatorUrl', { value: evaluatorUrl.url });
    new cdk.CfnOutput(this, 'InterviewerUrl', { value: interviewerUrl.url });
    new cdk.CfnOutput(this, 'PdfParserUrl', { value: pdfParserUrl.url });
    new cdk.CfnOutput(this, 'PollyUrl', { value: pollyUrl.url });
    new cdk.CfnOutput(this, 'ConfigBucketName', { value: configBucket.bucketName });
  }
}
