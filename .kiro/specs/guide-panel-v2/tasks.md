# Guide Panel v2 — Tasks

## 사전 조건

- design.md의 미결정 사항(결정 1, 결정 2)에 대해 옵션을 선택받은 후 진행한다.
- 아래 태스크는 추천 옵션(결정 1: Option A 단일 스크롤, 결정 2: Option A 통합 표시) 기준으로 작성됨. 다른 옵션 선택 시 해당 태스크의 구현 세부사항이 변경됨.

---

## Task 1: Layer1Tips 컴포넌트 생성

**파일:** `src/components/GuidePanel/Layer1Tips.tsx`

**내용:**
- STAR 구조 설명 상수 정의 (S/T/A/R 각 letter, label, desc)
- 답변 팁 상수 정의 (3개 문자열 배열)
- STAR 뱃지 행 렌더링 — 기존 `.star-card__element-badge` 클래스 재사용
- 팁 리스트 `<ul>` 렌더링
- Props 없음 (순수 정적 컴포넌트)

**검증:**
- 컴포넌트 단독 렌더 시 STAR 4개 뱃지 + 팁 3개 항목 표시 확인
- analystOutput 없이도 정상 렌더 확인

---

## Task 2: RoleSkillsHint 컴포넌트 생성

**파일:** `src/components/GuidePanel/RoleSkillsHint.tsx`

**Props:**
```typescript
interface RoleSkillsHintProps {
  targetSkills: string[];       // interview_plan[].target_skill unique 목록
  evaluationPriorities: string[]; // target_role.evaluation_priorities
}
```

**내용:**
- 두 배열을 합쳐서 중복 제거, 최대 8개 칩으로 표시
- 섹션 제목: "이 직무가 중시하는 역량"
- 칩 스타일: 기존 `.star-card__chip` 재사용
- 합산 결과가 비어있으면 섹션 자체를 렌더하지 않음

**검증:**
- skills 6개 + priorities 4개 (중복 2개) 입력 시 → 칩 8개 렌더 확인
- 빈 배열 입력 시 → 아무것도 렌더하지 않음 확인

---

## Task 3: ExperienceCard 컴포넌트 생성

**파일:** `src/components/GuidePanel/ExperienceCard.tsx`

**Props:**
```typescript
interface ExperienceCardProps {
  index: number;
  title: string;
  organization: string;
  classification: StarClassification;
  keywordChips: string[];
}
```

**내용:**
- 기존 `.star-card` 레이아웃 구조 그대로 재사용
- 라벨: "준비해두면 좋은 경험 {index}" (기존 "Expected Question N" 대체)
- 주제: `{title} · {organization}`
- STAR 카테고리: "이런 각도로 정리해보세요: {classification.label}" (참고 톤)
- 강조 STAR 요소 뱃지: `classification.starElements`
- reasoning: `classification.reasoning`
- 스킬 칩: `keywordChips`

**검증:**
- index=1, 유효한 props 전달 시 "준비해두면 좋은 경험 1" 라벨 확인
- "Expected Question" 텍스트가 존재하지 않음 확인

---

## Task 4: AlignmentSummary 컴포넌트 생성

**파일:** `src/components/GuidePanel/AlignmentSummary.tsx`

**Props:**
```typescript
interface AlignmentSummaryProps {
  strengths: Array<{ resume_evidence: string; job_requirement: string }>;
  opportunities: Array<{ text: string; requirement: string; reason: string }>;
}
```

**내용:**
- "이미 잘 맞는 부분" 섹션: strengths 각 항목을 accent 좌측 보더(`.guide-panel__alignment-item--strength`)로 표시
- "보완하면 더 좋을 부분" 섹션: opportunities 각 항목을 기본 카드 스타일로 표시
- 각 섹션이 비어있으면 해당 섹션 숨김
- 둘 다 비어있으면 컴포넌트 전체를 렌더하지 않음
- areas_to_explore 항목은 호출측에서 "이 주제와 연결할 경험이 있다면 준비해보세요" 톤으로 변환 후 전달

**검증:**
- strengths 2개 + opportunities 3개 입력 시 양쪽 섹션 렌더 확인
- strengths만 있고 opportunities 비어있으면 "보완" 섹션 숨김 확인
- "약점", "부족", "없음" 텍스트가 렌더 결과에 없음 확인

---

## Task 5: GuidePanel.tsx 리팩터링 — 통합 조립

**파일:** `src/components/GuidePanel.tsx` (기존 파일 수정)

**내용:**
1. 기존 `interview_plan` 기반 카드 렌더 로직 제거
2. Layer 1: `<Layer1Tips />` 항상 렌더
3. Layer 2 (analystOutput 존재 시):
   - `useMemo`로 `roleSkills`, `experienceCards`, `alignment` 계산
   - `<RoleSkillsHint />` 렌더
   - `<ExperienceCard />` × N 렌더 (relevance_score DESC 정렬)
   - `<AlignmentSummary />` 렌더
4. 섹션 구분: `.guide-panel__section-divider` + `.guide-panel__section-title`
5. "Expected Question" 텍스트 완전 제거 확인

**데이터 변환 로직 (useMemo 내부):**
```typescript
// roleSkills
const targetSkills = [...new Set(plan.map(p => p.target_skill))];
const evalPriorities = targetRole?.evaluation_priorities ?? [];

// experienceCards
const cards = experiences
  .sort((a, b) => b.relevance_score - a.relevance_score)
  .map((exp, idx) => {
    const planItem = plan.find(p => p.source_experience_id === exp.experience_id);
    const classification = classifyStarCategory(
      planItem?.topic ?? exp.title,
      planItem?.target_skill ?? ''
    );
    const chips = deriveKeywordChips(
      { target_skill: planItem?.target_skill ?? '', topic: exp.title },
      targetRole
    );
    return { index: idx + 1, exp, classification, chips };
  });

// alignment
const strengths = strongMatches.map(m => ({
  resume_evidence: m.resume_evidence,
  job_requirement: m.job_requirement,
}));
const opportunities = [
  ...partialMatches.map(m => ({
    text: m.resume_evidence,
    requirement: m.job_requirement,
    reason: m.match_reason,
  })),
  ...areasToExplore.map(a => ({
    text: '이 주제와 연결할 경험이 있다면 준비해보세요',
    requirement: a.topic,
    reason: a.reason,
  })),
];
```

**검증:**
- analystOutput=null 시 Layer 1만 렌더, Layer 2 없음 확인
- analystOutput 존재 시 Layer 1 + Layer 2 모두 렌더 확인
- "Expected Question", "예상 질문" 텍스트 부재 확인
- `question_type` 필드를 UI 렌더에 사용하지 않음 확인

---

## Task 6: CSS 추가 — 새 클래스 정의

**파일:** `src/components/GuidePanel.tsx` 내 `<style>` 블록 (기존 패턴 유지)

**추가 클래스:**
- `.guide-panel__section-divider`: `border-top: 1px solid rgba(255,255,255,0.08); margin: 12px 0;`
- `.guide-panel__section-title`: `font-size: 13px; font-weight: 600; color: var(--color-text-secondary); margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.3px;`
- `.guide-panel__tip-list`: `list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 6px;`
- `.guide-panel__tip-item`: `font-size: 13px; color: var(--color-text-secondary); line-height: 1.5; padding-left: 16px; position: relative;` + `::before` accent 체크마크
- `.guide-panel__alignment-item`: `font-size: 13px; color: var(--color-text-secondary); padding: 8px 10px; border-radius: 3px; background: rgba(255,255,255,0.03);`
- `.guide-panel__alignment-item--strength`: `border-left: 2px solid var(--color-accent);`

**검증:**
- 전체 Guide Panel이 Midnight green 테마와 시각적으로 일관되는지 확인
- 하드코딩 색상(#xxx 직접 사용)이 CSS 변수 외에 없음 확인

---

## Task 7: 기존 테스트 업데이트

**파일:** `src/components/__tests__/GuidePanel.test.tsx`

**내용:**
1. "Expected Question" 관련 어설션 제거/교체
2. 새 테스트 추가:
   - `analystOutput=null` → Layer 1 팁 렌더 + Layer 2 없음
   - `analystOutput` 존재 → Layer 1 + 경험 카드 + 역량 칩 + 정합성 요약 렌더
   - "Expected Question" / "예상 질문" 텍스트 부재 확인
   - "준비해두면 좋은 경험" 라벨 존재 확인
   - STAR 뱃지 4개(S/T/A/R) Layer 1에 존재 확인
   - question_type 기반 분기 없음 확인 (모든 카드 동일 구조)

**검증:**
- `npm run test -- --run` 통과 확인

---

## Task 8: InterviewScreen 연동 확인

**파일:** `src/components/InterviewScreen.tsx`

**내용:**
- `<GuidePanel analystOutput={state.analystOutput} />` 호출부 — props 인터페이스 변경 없으므로 수정 불필요할 것으로 예상
- 다만 렌더 결과가 사이드바 영역에서 정상 표시되는지 확인
- overflow-y: auto가 새 콘텐츠 양(Layer 1 + 최대 5 카드 + 정합성)에서도 정상 동작 확인

**검증:**
- 빌드 오류 없음 (`npm run build`)
- 타입 오류 없음 (`npx tsc --noEmit`)

---

## 실행 순서 요약

```
Task 1 (Layer1Tips) ─┐
Task 2 (RoleSkills) ─┤
Task 3 (ExpCard)    ─┼─ 독립적으로 병렬 가능
Task 4 (Alignment)  ─┘
         │
         ▼
Task 5 (GuidePanel 통합) ← 1~4 완료 후
         │
         ▼
Task 6 (CSS) ← 5와 동시 또는 직후
         │
         ▼
Task 7 (테스트) ← 5~6 완료 후
         │
         ▼
Task 8 (빌드/타입 검증) ← 마지막
```
