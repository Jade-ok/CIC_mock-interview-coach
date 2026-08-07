# Evaluator Agent

Evaluates mock interview performance for co-op seeking students.

## Architecture

Stateless AWS Lambda function invoked via Function URL. Receives interview conversation + analyst output, calls Bedrock Converse API for scoring, then aggregates and returns a feedback report.

In the target deployment, the React frontend is hosted on AWS Amplify Hosting and reaches this function through the HTTP backend path. The current CDK Function URL is public (`NONE` authentication); protecting the HTTP APIs is required before a public production launch. This function is separate from the AgentCore Runtime voice relay, which handles only the real-time Nova 2 Sonic stream.

## Input

See `../../../schemas/interviewer_output.json` for the current input shape.

Required fields:
- `conversation` — array of 1-6 question-answer turn objects
- `interview_metadata` — session metadata (passed through to response)
- `analyst_output` — structured analysis from the Analyst agent

## Output

See `../../../schemas/evaluator_output.json` for the current output shape.

## Environment

- **Runtime**: Python 3.12
- **Region**: us-east-1
- **Model**: global.anthropic.claude-sonnet-5
- **Timeout**: 60 seconds

## IAM Permissions

The standalone SAM template uses the scoped policy below. The current CDK stack grants `bedrock:InvokeModel` with `Resource: "*"`, so the two deployment options are not policy-identical.

```json
{
  "Effect": "Allow",
  "Action": ["bedrock:InvokeModel"],
  "Resource": [
    "arn:aws:bedrock:us-east-1:<account-id>:inference-profile/global.anthropic.claude-sonnet-5",
    "arn:aws:bedrock:us-east-1::foundation-model/anthropic.claude-sonnet-5",
    "arn:aws:bedrock:::foundation-model/anthropic.claude-sonnet-5"
  ]
}
```

## Local Development

```bash
pip install -r backend/functions/evaluator/requirements.txt
pip install pytest
python -m pytest backend/functions/evaluator/tests/ -v
```

## Deployment

This is a standalone SAM deployment and creates resources separately from the CDK `MockInterviewStack`. Use CDK for the canonical four-Lambda backend; use SAM only when a separate Evaluator stack is intentional.

```bash
cd backend/functions/evaluator
sam build
sam deploy --guided
```
