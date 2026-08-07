# Design Theme — Frontend

> Active visual guidance. The current frontend uses both global `--color-*` tokens and FeedbackReport-specific tokens; consolidating them into one namespace remains planned.

Zoom 스타일 다크 화상회의 UI를 레퍼런스로 한다 (테마명: **Midnight green**, 스크린샷 톤에 가장 가깝게 맞춤). 프론트엔드 작업 전체(업로드/대기실/인터뷰 화면)에 아래 토큰을 일관되게 적용한다.

## Color Tokens

| 용도 | 색상 | 비고 |
|---|---|---|
| 배경 (전체 캔버스) | `#0A0A0A` | 거의 순검정, 참가자 타일 밖 여백 |
| 참가자 타일 배경 | `#1C1C1E` | 비디오/웨이브폼 영역 |
| 상단/하단 컨트롤 바 | `#2C2C2E` | 어두운 회색, 배경보다 한 톤 밝게 |
| 텍스트 (기본) | `#FFFFFF` | 참가자 이름, 타이머 등 |
| 텍스트 (보조) | `#A0A0A5` | 비활성 라벨, 타임스탬프 |
| 강조 (활성 화자 테두리, 웨이브폼) | `#9AE05C` (연두) | Turn indicator — ai_speaking 상태 시각화 |
| 종료/경고 | `#FF5C5C` (빨강) | 종료 버튼 텍스트/아이콘 |
| 강조 (guide 하이라이트) | `#4A9EFF` (파랑 계열) | 초록/빨강과 겹치지 않는 별도 색 — competency 하이라이트 전용 |

## Typography

- 기본 폰트: 시스템 UI 폰트 스택 (San Francisco / Segoe UI / Roboto 순 fallback)
- 참가자 라벨: 14px, medium weight, 좌하단 배지 형태 (반투명 검정 배경 위 흰 텍스트)
- 경과 시간/상태 텍스트: 13px, regular, 보조 텍스트 컬러

## Layout

- 참가자 타일: 라운드 코너 (8px radius), 타일 간 여백 최소
- 컨트롤 바: 화면 하단 고정, 아이콘 중앙 정렬, 아이콘 간 균등 간격
- 활성 화자 강조: 타일 테두리 2~3px, 강조색(`#9AE05C`) 적용 — Turn indicator(ai_speaking/user_turn)에 그대로 매핑

## 적용 원칙

- 신규 컴포넌트 제작 시 위 색상 토큰을 CSS 변수로 선언해서 재사용 (하드코딩 금지)
- 새 화면(대기실, guide 패널 등) 추가 시에도 동일 팔레트 유지 — 별도 밝은 테마 사용 금지
- 저장소에 기준 스크린샷이 추가되기 전까지는 이 파일의 토큰을 기준으로 사용한다
