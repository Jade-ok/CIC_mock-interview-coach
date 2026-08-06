# Mock Interview App

AI 기반 모의 면접 애플리케이션. 이력서를 분석하고, 면접 질문을 생성하며, 답변을 평가합니다.

## Architecture

브라우저가 상태를 관리하고, 각 Lambda는 stateless로 동작합니다. (DB, S3, API Gateway 없음)

```
frontend/        → 브라우저 UI (상태 보관)
analyst/         → 이력서 분석 (Claude Fable 5)
interviewer/     → 면접 질문 생성 (Claude Opus 4)
evaluator/       → 답변 평가 (Claude Fable 5)
polly/           → TTS 음성 합성 (Amazon Polly)
pdf_parser/      → PDF 텍스트 추출 (pypdf)
```

## Tech Stack

- **Runtime**: Python 3.12 (AWS Lambda)
- **LLM**: Amazon Bedrock Converse API (`tool_use` 방식)
- **TTS**: Amazon Polly
- **PDF**: pypdf
- **Region**: us-west-2

## Lambda Module Structure

AI Lambda (analyst, interviewer, evaluator)는 동일한 구조를 따릅니다:

```
module/
  __init__.py
  handler.py          # Lambda entry point
  orchestrator.py     # 비즈니스 로직
  validation.py       # 입력 검증
  prompt_builder.py   # 프롬프트 구성
  bedrock_client.py   # Bedrock API 호출
  parser.py           # 응답 파싱/검증
```

## Models

| Agent | Model ID |
|-------|----------|
| analyst | global.anthropic.claude-fable-5 |
| interviewer | global.anthropic.claude-opus-4-7 |
| evaluator | global.anthropic.claude-fable-5 |
| polly | Amazon Polly (Bedrock 미사용) |
| pdf_parser | pypdf (Bedrock 미사용) |

## Deployment

```bash
# Lambda zip 패키징 예시
zip -r analyst.zip analyst/

# pdf_parser는 pypdf 번들 필요
pip3 install pypdf -t pdf_parser/
zip -r pdf_parser.zip pdf_parser/
```

### 주의사항

- Function URL 호출 시 `event['body']`에서 JSON 파싱
- CORS는 Function URL 설정에서 관리 (코드 아님)
- 권한: `lambda:InvokeFunctionUrl` + `lambda:InvokeFunction` 둘 다 필요
- PDF 업로드 제한: 클라이언트 4MB / Lambda 6MiB
