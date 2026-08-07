# Evaluator Agent

Evaluates mock interview performance for co-op seeking students.

## Architecture

Stateless AWS Lambda function invoked via Function URL. Receives interview conversation + analyst output, calls Bedrock Converse API for scoring, then aggregates and returns a feedback report.

During local development, the React frontend reaches this function through its Function URL. The current CDK Function URL is public (`NONE` authentication), so it must be protected before the eventual Amplify-hosted application is shared publicly. This function is separate from the Python voice relay, which runs locally during development and on AgentCore in the hosted architecture.

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
- **Model**: global.anthropic.claude-sonnet-4-6
- **Timeout**: 300 seconds (allows two 120-second application attempts plus overhead)

## IAM Permissions

The standalone SAM template and CDK stack scope `bedrock:InvokeModel` to the Sonnet 4.6 inference profile and its required foundation-model resources:

```json
{
  "Effect": "Allow",
  "Action": ["bedrock:InvokeModel"],
  "Resource": [
    "arn:aws:bedrock:us-east-1:<account-id>:inference-profile/global.anthropic.claude-sonnet-4-6",
    "arn:aws:bedrock:us-east-1::foundation-model/anthropic.claude-sonnet-4-6",
    "arn:aws:bedrock:::foundation-model/anthropic.claude-sonnet-4-6"
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
