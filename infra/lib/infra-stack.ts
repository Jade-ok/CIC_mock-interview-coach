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
      runtime: lambda.Runtime.PYTHON_3_12,
      code: lambda.Code.fromAsset('../analyst'),
      handler: 'handler.lambda_handler',
      timeout: cdk.Duration.seconds(150),
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
      runtime: lambda.Runtime.PYTHON_3_12,
      code: lambda.Code.fromAsset('../evaluator'),
      handler: 'lambda_handler.handler',
      timeout: cdk.Duration.seconds(90),
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
      runtime: lambda.Runtime.PYTHON_3_12,
      code: lambda.Code.fromAsset('../interviewer'),
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
      handler: 'handler.lambda_handler',
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
      runtime: lambda.Runtime.PYTHON_3_12,
      code: lambda.Code.fromAsset('../polly'),
      handler: 'handler.lambda_handler',
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
