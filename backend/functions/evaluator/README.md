# Evaluator Agent

Evaluates mock interview performance for co-op seeking students.

## Architecture

Receives interview conversation + analyst output, calls Bedrock Mantle Chat Completions for scoring, then aggregates and returns a feedback report. The same handler runs behind the local `/api/evaluator` adapter and in the hosted Lambda architecture.

During local development, `backend.local_server:app` invokes the handler directly. Its Bedrock request uses the AWS identity active in the local SDK credential chain.

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
- **Model**: openai.gpt-oss-120b
- **Timeout**: 300 seconds (allows two 120-second application attempts plus overhead)

## IAM Permissions

The standalone SAM template and CDK stack allow Mantle inference only for GPT OSS 120B, plus the Mantle project lookup actions required by the service:

```json
{
  "Effect": "Allow",
  "Action": ["bedrock-mantle:CreateInference"],
  "Resource": "*",
  "Condition": {
    "StringEquals": {"bedrock-mantle:Model": "openai.gpt-oss-120b"}
  }
}
```

The role also permits `bedrock-mantle:GetProject`, `ListProjects`, and `ListTagsForResource`.

## Local Development

```bash
pip install -r backend/functions/evaluator/requirements.txt
pip install pytest
python -m pytest backend/functions/evaluator/tests/ -v
```
