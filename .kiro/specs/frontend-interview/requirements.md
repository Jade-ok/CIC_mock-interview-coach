# Requirements Document

## Introduction

AI Mock Interview Coach의 프론트엔드 중 업로드 화면과 인터뷰 화면을 다룬다. 사용자는 이력서(PDF)와 채용공고(JD)를 업로드하고, Amazon Nova Sonic 기반 실시간 음성 인터뷰를 진행한다. 인터뷰는 화상면접과 유사한 UX(다크 테마, 참가자 타일, 하단 컨트롤 바)로 구성되며, Practice Mode를 통해 실시간 텍스트 힌트를 볼 수 있다. Feedback 화면은 별도 spec에서 다룬다.

## Ownership & Boundaries

**본 spec은 프론트엔드 구현만을 대상으로 한다.** 아래 항목들은 팀 내 다른 spec(analyst/interviewer/evaluator)에서 별도로 구현되며, 본 spec에서는 **이미 존재하는 외부 인터페이스**로 간주하고 소비만 한다. Kiro는 아래 항목들에 대한 구현 코드(서버, 인프라, 프롬프트, tool 정의 등)를 생성하지 않는다:

- **Nova_Sonic 세션/프롬프트/tool 정의** (`end_interview` tool 포함) — interviewer spec 담당
- **Agent_1 API** (`nova_sonic_context`, `competency_guides` 반환) — analyst spec 담당
- **Agent_3 API** (transcript 평가) — evaluator spec 담당
- **WebSocket_Server** (Nova_Sonic 중계, 지속 연결 관리) — 별도 인프라 spec 또는 팀원 담당

본 spec에서 이 항목들이 요구사항에 등장하는 이유는 프론트엔드가 **어떤 인터페이스를 기대하는지** 명세하기 위함이며 (API 계약), 구현 책임은 아니다. tasks.md 생성 시 이 항목들과 관련된 태스크는 "외부 인터페이스 mock/stub 처리" 수준으로만 다루고, 실제 백엔드/Nova Sonic 구현 태스크는 생성하지 않는다.

## Glossary

- **Upload_Screen**: 사용자가 이력서(PDF)와 채용공고(JD)를 제출하는 화면
- **Interview_Screen**: Nova Sonic과 실시간 음성 인터뷰를 진행하는 화면
- **Waiting_Room**: 제출 후 Agent 1 분석 완료 및 WebSocket 연결 완료까지 대기하는 화면
- **Feedback_Screen**: 인터뷰 종료 후 Agent 3 평가 결과를 표시하는 화면 (별도 spec)
- **Nova_Sonic**: Amazon Nova Sonic 실시간 음성 AI 모델
- **WebSocket_Server**: Lambda가 아닌 지속 연결 가능한 백엔드 서버로 Nova Sonic과의 통신을 중계
- **Agent_1**: 이력서/JD를 분석하여 `nova_sonic_context`와 `competency_guides`를 생성하는 백엔드 에이전트
- **Agent_3**: 인터뷰 종료 후 transcript를 받아 피드백을 생성하는 백엔드 에이전트
- **Practice_Mode**: 인터뷰 중 텍스트 힌트(질문 말풍선)를 표시하는 프론트엔드 전용 모드
- **Guide_Panel**: 인터뷰 화면 사이드바에 competency keywords를 표시하는 패널
- **Transcript**: 인터뷰 세션 전체의 대화 기록. `{ role: "interviewer" | "user", text: string, timestamp: string(ISO 8601) }` 형태의 리스트. `timestamp`는 프론트 로컬 수신 시간(참고용, 순서는 리스트 삽입 순서로 보장)
- **Barge_In**: 사용자가 AI 응답 재생 중 발화를 시작하여 재생을 중단시키는 행위. 서버(Nova_Sonic)측에서 감지하여 인터럽션 이벤트를 전송하며, 프론트는 자체 VAD를 수행하지 않는다 (best-effort — 네트워크 지연에 따라 이벤트 수신이 늦어질 수 있음을 인지)
- **Competency_Guides**: Agent 1이 생성한 직무별 역량 키워드 및 설명 리스트

## Requirements

### Requirement 1: 이력서/JD 업로드

**User Story:** As a 사용자, I want 이력서와 채용공고를 업로드하고 싶다, so that 이 직무에 맞춘 개인화된 모의면접을 받을 수 있다.

#### Acceptance Criteria

1. WHEN 사용자가 파일 선택 또는 드래그앤드롭으로 PDF를 첨부하면, THE Upload_Screen SHALL 파일을 업로드 필드에 등록하고 파일명을 표시한다.
2. IF 첨부된 파일이 PDF 형식이 아니거나 10MB를 초과하면, THEN THE Upload_Screen SHALL 해당 조건에 맞는 에러 메시지를 표시하고 업로드를 거부한다.
3. THE Upload_Screen SHALL JD 입력용 텍스트 영역(textarea)을 제공한다.
4. WHILE 이력서 파일 또는 JD 텍스트 중 하나라도 비어있는 상태인 동안, THE Upload_Screen SHALL 제출 버튼을 비활성화 상태로 유지한다 (공백/최소 길이 등 내용 유효성 검증은 의도적으로 하지 않음 — 필요 시 Agent_1/백엔드에서 처리).
5. WHEN 사용자가 제출 버튼을 클릭하면, THE Upload_Screen SHALL 이력서 PDF와 JD 텍스트를 백엔드(Agent_1)로 전송한다.

### Requirement 2: 세션 연결 대기실

**User Story:** As a 사용자, I want 제출 후 자연스럽게 면접 대기 상태를 경험하고 싶다, so that 화상면접과 유사한 몰입감으로 인터뷰를 시작할 수 있다.

#### Acceptance Criteria

1. WHEN 제출이 완료되면, THE Waiting_Room SHALL 로딩 아이콘과 함께 "호스트가 들여보내주길 기다리는 중입니다" 문구를 표시한다.
2. WHILE Agent_1 분석 결과와 WebSocket_Server 연결이 모두 완료되지 않은 동안, THE Waiting_Room SHALL 대기실 화면을 유지한다.
3. WHEN Agent_1 분석 결과(`nova_sonic_context`, `competency_guides`)와 WebSocket_Server 연결이 모두 준비되면, THE Waiting_Room SHALL Interview_Screen으로 전환하고 Practice_Mode를 ON 상태로 초기화한다.
4. IF Agent_1 호출 또는 WebSocket_Server 연결이 실패하면, THEN THE Waiting_Room SHALL 실패한 항목만 재시도하고, 나머지 하나가 이미 성공한 경우 그 결과는 재사용한다.
5. IF 대기실 상태가 30초를 초과하면, THEN THE Waiting_Room SHALL 타임아웃 에러 메시지와 재시도 버튼(실패한 항목만 재시도)을 표시한다.
6. WHEN 대기실 화면에서 에러가 발생하면, THE Waiting_Room SHALL 업로드 화면으로 돌아가는 옵션도 함께 제공한다.

### Requirement 3: 실시간 음성 인터뷰 진행

**User Story:** As a 사용자, I want Nova Sonic과 실시간 음성으로 대화하고 싶다, so that 실제 면접과 유사한 경험으로 연습할 수 있다.

#### Acceptance Criteria

1. WHEN Interview_Screen에 진입하면, THE Interview_Screen SHALL 마이크 입력을 지속적으로 캡처하여 WebSocket_Server로 스트리밍한다.
2. WHEN Nova_Sonic이 응답 오디오를 전송하면, THE Interview_Screen SHALL 오디오를 재생하고 웨이브폼 애니메이션을 활성화 상태로 표시한다.
3. THE Interview_Screen SHALL WebSocket_Server를 통해 Nova_Sonic으로부터 오디오 청크와 별도로 텍스트 이벤트(interviewer 발화 텍스트, 사용자 발화 ASR 결과 텍스트)를 수신하는 것을 전제로 한다 (백엔드 의존 — 프론트가 자체 STT를 수행하지 않음).
4. WHEN 사용자가 발화를 시작하면(Barge_In), THE Interview_Screen SHALL Nova_Sonic이 보내는 인터럽션 이벤트를 수신하는 즉시 현재 재생 중인 오디오를 정지하고 재생 대기열을 비운다.
5. THE Interview_Screen SHALL 현재 turn 상태("ai_speaking" 또는 "user_turn")를 시각적으로 구분하여 표시한다.
6. THE Interview_Screen SHALL 텍스트 입력을 통한 답변 제출 기능을 제공한다.
7. WHILE 텍스트 입력창에 텍스트가 입력되어 있는 동안(첫 글자 입력 시점부터 제출 완료까지), THE Interview_Screen SHALL 마이크 입력이 interviewer에게 전달되지 않도록 한다 (동시 입력에 의한 레이스 컨디션 방지).
8. WHEN 사용자가 텍스트로 답변을 제출하면, THE Interview_Screen SHALL 제출된 답변을 채팅 말풍선 형태로 화면에 다시 표시하지 않는다 (Practice_Mode 상태와 무관하게 항상 미표시). THE Interview_Screen SHALL 이 텍스트 답변이 WebSocket 텍스트 이벤트 스트림을 통해 다시 수신되어 Transcript에 자동 포함되는 것을 전제로 한다.
9. IF 브라우저가 마이크 권한을 거부하거나 마이크를 지원하지 않으면, THEN THE Interview_Screen SHALL 에러 메시지를 표시하고 텍스트 전용 모드로 전환한다.
10. WHILE 텍스트 전용 모드인 동안, THE Interview_Screen SHALL interviewer의 오디오 응답 재생은 그대로 유지한다 (마이크 입력 경로만 텍스트로 대체, 출력은 영향 없음).
11. THE Interview_Screen SHALL 인터뷰 경과 시간을 화면에 표시한다.
12. THE Interview_Screen SHALL 인터뷰 진행 중 질문 번호나 진행률 표시를 제공하지 않는다 (프론트엔드가 질문 수를 카운팅하지 않고 Requirement 4의 종료 신호에만 수동적으로 반응하는 설계에 따름).
13. THE Interview_Screen SHALL MVP 기준으로 사용자 카메라를 사용하지 않는다 (향후 사용자가 원할 시 켜고 끌 수 있도록 확장 가능하게 설계).
14. IF WebSocket_Server 연결이 인터뷰 도중 끊기면, THEN THE Interview_Screen SHALL 최대 2회 자동 재연결을 시도한다. 재연결 성공 시 기존 Nova_Sonic 세션이 이어지는 것을 전제로 하며, 세션이 더 이상 유효하지 않다는 응답을 받거나 재연결 자체가 실패하면 에러 메시지와 함께 업로드 화면으로 돌아가는 옵션(입력값 초기화)을 표시한다.
15. WHILE 인터뷰 세션이 진행 중인 동안, THE Interview_Screen SHALL 사용자가 새로고침하거나 탭/창을 닫으려 할 때 브라우저 기본 이탈 경고(`beforeunload`)를 표시한다 (Transcript 유실 방지 목적).

### Requirement 4: 인터뷰 종료

**User Story:** As a 사용자, I want 인터뷰를 정상적으로 마치거나 원할 때 그만두고 싶다, so that 통제감을 가지고 피드백으로 넘어갈 수 있다.

#### Acceptance Criteria

1. THE Interview_Screen SHALL 질문 소진 여부를 직접 판단하지 않으며, 이 판단은 전적으로 Nova_Sonic(백엔드)이 수행한다. WHEN Nova_Sonic이 `end_interview` tool 신호를 전송하면, THE Interview_Screen SHALL 현재 재생 중인 오디오(마지막 인터뷰어 발화)가 끝날 때까지 기다린 후 인터뷰 세션을 종료한다 (재생 도중 갑자기 끊기지 않도록).
2. THE Interview_Screen SHALL 인터뷰 화면 하단에 항상 노출되는 종료 버튼을 제공한다.
3. WHEN 사용자가 종료 버튼을 클릭하면, THE Interview_Screen SHALL 확인 모달을 표시한다.
4. IF 사용자가 확인 모달에서 종료를 확정하면, THEN THE Interview_Screen SHALL WebSocket 세션을 종료하고, 누적된 Transcript를 HTTP 요청으로 Agent_3 엔드포인트에 전달한다.
5. IF Agent_3 전달 요청이 실패하면(네트워크 오류, 5xx 등), THEN THE Feedback_Screen SHALL 에러 상태를 표시하고 재시도 옵션(동일 Transcript로 재요청)을 제공한다. 자동으로 빈 결과나 "평가 대기 중" 상태로 넘어가지 않는다.
6. IF 사용자가 확인 모달에서 취소를 선택하면, THEN THE Interview_Screen SHALL 인터뷰를 계속 진행한다.
7. WHEN 인터뷰가 종료되면(자동 종료 또는 수동 종료 무관), THE Interview_Screen SHALL 즉시 Feedback_Screen으로 전환하고, Agent_3 응답을 기다리는 동안 로딩 상태를 표시한다.
8. THE Interview_Screen SHALL 자동 종료 신호 수신 여부와 관계없이 종료 버튼을 항상 활성 상태로 유지한다.

### Requirement 5: Practice Mode

**User Story:** As a 사용자, I want 필요할 때 텍스트 힌트를 보고 싶다, so that 처음 연습할 때 부담 없이 익힐 수 있다.

**설계 근거**: 기본값을 ON으로 시작하는 이유는 처음 쓰는 사용자에게 안전한 기본 경험을 제공하기 위함이다. 숙련 사용자는 언제든 OFF로 전환 가능하며 이 선택은 세션 내내 유지된다.

#### Acceptance Criteria

1. THE Interview_Screen SHALL Practice_Mode 토글을 제공하며, 인터뷰 진행 중 언제든 전환 가능해야 한다.
2. WHEN Practice_Mode 토글 상태가 변경되면, THE Interview_Screen SHALL Nova_Sonic 세션이나 백엔드 로직에 영향을 주지 않는다 (프론트 렌더링에만 영향).
3. WHILE Practice_Mode가 ON인 동안, THE Interview_Screen SHALL Nova_Sonic의 interviewer 질문 텍스트를 말풍선으로 표시한다.
4. THE Interview_Screen SHALL Practice_Mode 상태와 무관하게 사용자 자신의 답변은 텍스트로 표시하지 않는다.
5. WHILE Practice_Mode가 OFF인 동안, THE Interview_Screen SHALL 텍스트 말풍선을 표시하지 않는다.
6. WHEN Practice_Mode가 ON에서 OFF로 전환되면, THE Interview_Screen SHALL 기존에 표시 중이던 말풍선과 Guide_Panel 하이라이트를 즉시 제거한다.

### Requirement 6: Guide 패널

**User Story:** As a 사용자, I want 이 직무에서 어떤 역량이 중요한지 알고 싶다, so that 답변에서 무엇을 강조해야 할지 참고할 수 있다.

#### Acceptance Criteria

1. THE Interview_Screen SHALL 사이드바에 Competency_Guides 리스트를 상시 표시한다.
2. WHILE Practice_Mode가 ON이고 새로운 interviewer 텍스트가 도착한 동안, THE Guide_Panel SHALL 해당 텍스트와 Competency_Guides의 keywords를 매칭하여 관련 항목을 하이라이트한다.
3. WHILE Practice_Mode가 OFF인 동안, THE Guide_Panel SHALL 하이라이트 기능을 비활성화하고 리스트만 표시한다 (Practice_Mode OFF 전환 시 동작은 Requirement 5, AC 6 참조).

### Requirement 7: Transcript 관리

**User Story:** As a 사용자, I want 인터뷰 대화가 기록되길 원한다, so that 종료 후 피드백 생성에 활용될 수 있다.

#### Acceptance Criteria

1. THE Interview_Screen SHALL WebSocket_Server로부터 수신한 텍스트 이벤트를 시간 순서대로 누적하여 Transcript(Glossary 참조) 형태로 프론트엔드 상태에 보관한다.
2. WHEN 인터뷰가 종료되면, THE Interview_Screen SHALL 누적된 Transcript를 Agent_3에 전달한다.

### Requirement 8: 비기능 요구사항 — 통신 및 UI

**User Story:** As a 개발자, I want 시스템이 적절한 통신 방식과 일관된 UI를 사용하길 원한다, so that 안정적이고 몰입감 있는 사용자 경험을 제공할 수 있다.

#### Acceptance Criteria

1. THE Interview_Screen SHALL WebSocket_Server가 존재한다는 것을 전제로 Nova_Sonic과 통신한다 (Lambda Function URL 미사용, 엔드포인트 구현/인프라는 Ownership & Boundaries에 따라 범위 외).
2. THE Upload_Screen SHALL 다크 테마 기반의 화상회의 스타일 UI(어두운 배경, 하단 컨트롤 바)를 따른다.
3. THE Interview_Screen SHALL 다크 테마 기반의 화상회의 스타일 UI(어두운 배경, 참가자 타일, 하단 컨트롤 바)를 따른다. 색상/타이포그래피 토큰은 `.kiro/steering/design-theme.md` (Midnight green 테마)를 따른다.
4. THE Interview_Screen SHALL MVP 기준으로 사용자 카메라를 사용하지 않는다.

## Out of Scope

- **Feedback 화면**: Agent_3 출력 스키마 확정 후 별도 spec에서 작성 예정. 본 spec에서는 인터뷰 종료 시 Feedback_Screen으로 전환하는 지점(Requirement 4, AC 7)까지만 정의한다.
- **오디오 구현 상세**: 코덱, 샘플레이트, 청크 크기, 에코 캔슬레이션 구현은 design.md에서 다룬다.
- **Barge-in 서버측 감지 로직**: design.md에서 다룬다 (Glossary의 Barge_In 정의는 동작 전제만 명시).
- **Transcript 서버측 백업**: 프론트엔드 상태에만 보관하며, 새로고침/크래시 시 유실 위험이 있음. 서버측 동시 로깅은 백엔드 팀 책임이며 별도 요구사항으로 전달 필요.
- **Agent 1 API 엔드포인트 스펙**: analyst spec에서 정의한다.
- **Guide 키워드 매칭 알고리즘**: design.md에서 다룬다.
- **Nova Sonic 세션/프롬프트/tool 정의, WebSocket 서버 구현**: Ownership & Boundaries 참조.