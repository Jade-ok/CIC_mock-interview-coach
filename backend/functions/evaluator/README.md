# Evaluator Agent

Evaluates mock interview performance for co-op seeking students.

## Architecture

Stateless AWS Lambda function invoked via Function URL. Receives interview conversation + analyst output, calls Bedrock Converse API for scoring, then aggregates and returns a feedback report.

## Input

See `contracts/evaluator_input.json` for the full input schema.

Required fields:
- `conversation` — array of 1-6 question-answer turn objects
- `interview_metadata` — session metadata (passed through to response)
- `analyst_output` — structured analysis from the Analyst agent

## Output

See `contracts/evaluator_output.json` for the full output schema.

## Environment

- **Runtime**: Python 3.12
- **Region**: us-east-1
- **Model**: global.anthropic.claude-sonnet-5
- **Timeout**: 60 seconds

## IAM Permissions

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

```bash
cd backend/functions/evaluator
sam build
sam deploy --guided
```
