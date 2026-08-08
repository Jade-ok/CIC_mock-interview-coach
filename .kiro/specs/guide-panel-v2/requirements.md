# Guide Panel v2 — Requirements

## 배경

현재 Guide Panel은 `analyst_output.interview_plan`의 상위 3개 항목을 "Expected Question 1/2/3"으로 확정 표시한다. 그러나 실제 Nova Sonic 인터뷰에서 `selected_experiences` 5개 밖의 경험(resume_job_alignment 자유 텍스트, candidate_profile.experience_summary에만 언급된 경험)에 대해서도 질문이 발생하는 것을 확인했다. "정확히 이 주제에서만 질문이 나온다"는 전제가 데이터 구조상 보장되지 않는다.

## 콘텐츠 전략 전환

"어떤 질문이 나올지 예측" → "인터뷰에 익숙하지 않은 사용자에게 일반적 인터뷰 준비 가이드를 제공하되, 이력서/JD 기반으로 개인화해서 강화"

---

## 기능 요구사항

### REQ-1: 확정적 예측 표현 금지

- "이 질문이 나온다", "예상 질문", "Expected Question" 같은 확정적 표현을 사용하지 않는다.
- 대신 "이런 경험을 준비해두면 좋습니다", "이 부분을 정리해두면 어떤 질문이 와도 대응할 수 있어요" 같은 **준비 자료** 톤을 사용한다.

### REQ-2: Layer 1 — 일반 인터뷰 팁 (항상 노출)

- `analystOutput`이 null이든 존재하든 상관없이 **항상 노출**되는 고정 콘텐츠 영역이다.
- 포함 내용:
  - STAR 구조(Situation-Task-Action-Result) 간단 설명
  - 답변 구조화 팁 (예: "먼저 상황을 한 줄로, 본인이 한 행동을 구체적으로, 결과를 수치/변화로")
  - 답변 마무리 팁 (예: "배운 점이나 다음에 어떻게 할지로 마무리하면 인상적")
- `analystOutput` 없이도 독립적으로 유용해야 한다.

### REQ-3: Layer 2 — 개인화 콘텐츠 (`analystOutput` 필요)

- `analystOutput`이 존재할 때만 노출된다.

#### REQ-3a: 정리해두면 좋은 경험 카드

- 데이터 소스: `selected_experiences` (최대 5개)
- 각 카드에 표시: 경험 제목, 조직, STAR 카테고리 힌트(참고용), 강조할 스킬 칩
- 톤: "이 경험을 정리해두면 다양한 질문에 대응할 수 있어요"
- STAR 카테고리 연결에 기존 `starCategoryMatcher.ts` 로직을 활용한다.
- 카테고리는 단정("이 카테고리다")이 아닌 참고 제안 톤("이런 각도로 정리해보세요")으로 표시.

#### REQ-3b: 직무 역량 힌트

- 데이터 소스: `interview_plan[].target_skill`, `target_role.evaluation_priorities`
- "이 직무가 강조하는 역량" 목록으로 표시한다.
- **주의**: `interview_plan`은 더 이상 "이 질문이 나온다"는 예측 근거가 아니다. 오직 "이 직무가 어떤 역량을 중시하는지" 보여주는 배경 정보로만 활용.

#### REQ-3c: 이력서-직무 정합성 요약

- 데이터 소스: `resume_job_alignment.strong_matches`, `partial_matches`, `areas_to_explore`
- "이미 잘 맞는 부분" / "보완하면 좋을 부분"으로 구분 표시.
- `areas_to_explore`(갭)는 사용자 불안을 조성하지 않는 톤으로 표현 — "약점"이 아닌 "기회" 프레이밍.

### REQ-4: question_type 필드 미사용

- `interview_plan[].question_type` 필드는 UI 분기나 콘텐츠 결정에 사용하지 않는다.
- 사유: 거의 항상 "behavioral" 고정값이므로 분기 근거로 부적합.

### REQ-5: 기존 자산 재사용

- `starCategoryMatcher.ts`의 `classifyStarCategory`, `deriveKeywordChips`, `STAR_CATEGORIES` 상수를 그대로 재사용한다.
- 기존 Guide Panel의 카드 레이아웃 구조(`.star-card` 계열 클래스)와 색상 테마(Midnight green CSS 변수)를 유지한다.
- 컴포넌트를 처음부터 새로 작성하지 않고, 기존 `GuidePanel.tsx`를 리팩터링한다.

### REQ-6: 프론트엔드 전용

- 백엔드(`context_builder.py`, Nova Sonic 프롬프트, S3 설정 등) 변경 없이 프론트엔드 코드만으로 완결한다.

---

## 비기능 요구사항

### NFR-1: 접근성

- STAR 카테고리 뱃지 등 색상으로만 구분하는 요소에 텍스트 라벨을 병행한다.
- 카드 목록은 시맨틱 리스트(`<ul>/<li>`)를 유지한다.

### NFR-2: 성능

- Layer 2 카드 데이터는 `useMemo`로 계산하여 불필요한 재렌더링을 방지한다.
- `analystOutput` 참조가 바뀔 때만 재계산한다.

### NFR-3: 반응형

- Guide Panel은 인터뷰 화면 우측 사이드바에 위치하며, 세로 스크롤이 가능해야 한다.
- 카드가 5개 이상일 수 있으므로(selected_experiences 최대 5개 + Layer 1), overflow-y: auto를 유지한다.
