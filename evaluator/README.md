# Evaluator Agent

Evaluates mock interview performance for co-op seeking students.

## Architecture

Stateless AWS Lambda function invoked via Function URL. Receives interview conversation + analyst output, calls Bedrock Converse API for scoring, then aggregates and returns a feedback report.

## Input

See `schemas/evaluator_input.json` for the full input schema.

Required fields:
- `conversation` — array of 1-6 question-answer turn objects
- `interview_metadata` — session metadata (passed through to response)
- `analyst_output` — structured analysis from the Analyst agent

## Output

See `schemas/evaluator_output.json` for the full output schema.

## Environment

- **Runtime**: Python 3.12
- **Region**: us-west-2
- **Model**: global.anthropic.claude-fable-5
- **Timeout**: 60 seconds

## IAM Permissions

```json
{
  "Effect": "Allow",
  "Action": ["bedrock:InvokeModel"],
  "Resource": "arn:aws:bedrock:us-west-2::foundation-model/anthropic.claude-*"
}
```

## Local Development

```bash
pip install -r evaluator/requirements.txt
pip install pytest
python -m pytest evaluator/tests/ -v
```

## Deployment

```bash
sam build
sam deploy --guided
```
