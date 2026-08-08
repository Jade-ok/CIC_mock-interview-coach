# Guide Panel v2 — Design

## 개요

기존 `GuidePanel.tsx`를 리팩터링하여 2-Layer 구조로 전환한다.
- **Layer 1**: 고정 콘텐츠 (STAR 구조 설명 + 답변 팁) — analystOutput 유무와 무관하게 항상 표시
- **Layer 2**: 개인화 콘텐츠 — analystOutput 존재 시에만 표시

기존 `.star-card` 계열 CSS 클래스, `starCategoryMatcher.ts` 유틸, Midnight green 테마 변수를 그대로 재사용한다.

---

## 컴포넌트 구조

```
GuidePanel (리팩터링)
├── Layer1Tips (새 컴포넌트 or 인라인 섹션)
│   └── 고정 STAR 설명 + 답변 팁
├── Layer2Personalized (analystOutput 존재 시)
│   ├── RoleSkillsHint (직무 역량 힌트)
│   ├── ExperienceCards (정리해두면 좋은 경험)
│   │   └── ExperienceCard × N (최대 5장)
│   └── AlignmentSummary (이력서-직무 정합성)
│       ├── StrongMatches
│       └── GrowthOpportunities (partial_matches + areas_to_explore)
```

### 파일 구조

```
src/components/
  GuidePanel.tsx          ← 리팩터링 (Layer 1 + Layer 2 래퍼)
  GuidePanel/
    Layer1Tips.tsx         ← 새 파일: 고정 팁 콘텐츠
    ExperienceCard.tsx    ← 새 파일: 기존 star-card 재활용
    RoleSkillsHint.tsx    ← 새 파일: 역량 칩 목록
    AlignmentSummary.tsx  ← 새 파일: 정합성 요약
```

기존 `GuidePanel.tsx`가 단일 파일이므로, 서브 컴포넌트만 폴더로 분리하고 `GuidePanel.tsx` 자체는 같은 위치에 유지하여 import 경로를 보존한다.

---

## Layer 1: 고정 인터뷰 팁

### 데이터 소스
하드코딩 상수 (런타임 데이터 의존 없음)

### 콘텐츠 구성

```typescript
const STAR_TIP = {
  title: "STAR 구조로 답변을 정리하세요",
  elements: [
    { letter: "S", label: "Situation", desc: "상황을 한 줄로 설명" },
    { letter: "T", label: "Task", desc: "본인에게 주어진 과제/목표" },
    { letter: "A", label: "Action", desc: "직접 취한 구체적 행동" },
    { letter: "R", label: "Result", desc: "결과와 배운 점" },
  ],
};

const ANSWER_TIPS = [
  "내가 한 일을 구체적으로 — 'we'보다 'I'로 시작하세요",
  "결과를 수치나 변화로 표현하면 설득력이 올라갑니다",
  "배운 점이나 다음엔 어떻게 할지로 마무리하면 인상적이에요",
];
```

### UI 렌더링
- STAR 4글자를 가로 뱃지 행으로 표시 (기존 `.star-card__element-badge` 클래스 재사용)
- 답변 팁은 `<ul>` 리스트, 각 항목 앞에 불릿 대신 accent 컬러 체크마크 아이콘

---

## Layer 2: 개인화 콘텐츠

### 2-A: 직무 역량 힌트 (RoleSkillsHint)

**데이터 소스:**
- `interview_plan[].target_skill` — 중복 제거 후 수집
- `target_role.evaluation_priorities`

**렌더링:**
- 섹션 제목: "이 직무가 중시하는 역량"
- 역량을 칩(`.star-card__chip` 재사용)으로 나열
- 칩 개수: `target_skill` unique + `evaluation_priorities` 합쳐서 최대 8개 (중복 제거, 초과 시 잘림)

**톤 예시:**
> "면접에서 아래 역량이 확인될 가능성이 높습니다. 경험을 떠올릴 때 이 키워드를 연결해보세요."

---

### 2-B: 정리해두면 좋은 경험 카드 (ExperienceCard)

**데이터 소스:** `selected_experiences[]`

**기존 star-card와의 차이점:**

| 속성 | v1 (현재) | v2 (신규) |
|------|-----------|-----------|
| 라벨 | "Expected Question N" | "준비해두면 좋은 경험 N" |
| 주제 텍스트 | `interview_plan[].topic` | `experience.title` + `organization` |
| STAR 카테고리 | 단정 표시 | "이런 각도로 정리해보세요: {label}" (참고 톤) |
| 스킬 칩 | deriveKeywordChips(plan item) | deriveKeywordChips(experience → topic 매핑) |
| 관련 경험 | 선택적 표시 | 제거 (카드 자체가 경험이므로) |

**STAR 카테고리 연결 로직:**
- `interview_plan`에서 `source_experience_id`가 이 경험을 참조하는 항목을 찾는다.
- 있으면 해당 plan item의 `topic + target_skill`로 `classifyStarCategory()` 호출.
- 없으면 `experience.title`로 `classifyStarCategory(title, '')` 호출 (best-effort).
- 결과의 `reasoning`을 "이런 각도로 정리해보세요:" 접두사와 함께 표시.

**카드 수:** `selected_experiences` 전체 (최대 5개). `relevance_score` 내림차순 정렬.

---

### 2-C: 이력서-직무 정합성 요약 (AlignmentSummary)

**데이터 소스:**
- `resume_job_alignment.strong_matches`
- `resume_job_alignment.partial_matches`
- `resume_job_alignment.areas_to_explore`

**렌더링:**

두 섹션으로 구분:

1. **"이미 잘 맞는 부분"** (strong_matches)
   - 각 항목: `resume_evidence` 텍스트 + 연결된 `job_requirement` 칩
   - accent 컬러(`#9AE05C`) 좌측 보더

2. **"보완하면 더 좋을 부분"** (partial_matches + areas_to_explore 통합)
   - 각 항목: 텍스트 요약
   - 별도 보더 색상 없이 기본 카드 스타일 (부정적 강조 방지)

**톤 원칙:**
- "약점", "부족", "없음" 같은 부정어 금지
- areas_to_explore는 "이 부분을 경험으로 연결할 스토리가 있다면 준비해두면 좋아요" 톤으로 표시
- 불안 조성이 아닌 기회 제시 프레이밍

---

## 미결정 사항 — 옵션 제시

### 결정 1: Layer 1과 Layer 2의 시각적 구분 방식

**Option A: 단일 스크롤 + 섹션 헤더 구분**

```
┌─────────────────────────┐
│ 📋 Interview Guide      │
│                         │
│ ─── 답변 준비 팁 ───    │
│ [STAR 설명]             │
│ [답변 팁 리스트]        │
│                         │
│ ─── 나의 준비 자료 ─── │
│ [역량 힌트]             │
│ [경험 카드 1]           │
│ [경험 카드 2]           │
│ [...]                   │
│ [정합성 요약]           │
└─────────────────────────┘
```

- 장점: 구현 단순, 전체 정보를 한눈에 스크롤 가능, 모바일 친화적
- 단점: Layer 2가 길면 Layer 1 팁이 스크롤 밖으로 밀림

**Option B: Layer 1 상단 고정 + Layer 2 스크롤**

```
┌─────────────────────────┐
│ 📋 Interview Guide      │
│ ┌─────────────────────┐ │
│ │ STAR: S·T·A·R 뱃지  │ │  ← sticky/고정
│ │ 핵심 팁 한 줄        │ │
│ └─────────────────────┘ │
│ ─── 나의 준비 자료 ─── │
│ [역량 힌트]        ↕scroll│
│ [경험 카드 1]           │
│ [경험 카드 2]           │
│ [...]                   │
└─────────────────────────┘
```

- 장점: STAR 뱃지가 항상 보여서 답변 중 참고 가능
- 단점: 고정 영역이 세로 공간 차지, Layer 1 내용을 압축해야 함

**Option C: 접이식(Collapsible) Layer 1**

```
┌─────────────────────────┐
│ 📋 Interview Guide      │
│                         │
│ ▸ 답변 준비 팁 (접기)   │  ← 클릭 시 토글
│                         │
│ ─── 나의 준비 자료 ─── │
│ [전체 Layer 2 콘텐츠]   │
└─────────────────────────┘
```

- 장점: 사용자가 팁을 이미 숙지하면 접어서 공간 확보
- 단점: 초보 사용자가 접힌 상태를 못 볼 수 있음

**추천: Option A** — 사이드바 공간이 제한적이고, 초보 대상 앱이므로 정보 은닉보다 노출을 우선. Layer 1 내용을 컴팩트하게(STAR 뱃지 한 행 + 팁 3줄) 유지하면 스크롤 문제 최소화 가능.

---

### 결정 2: areas_to_explore(갭) 노출 수준

**Option A: 통합 표시 — partial_matches와 함께 "보완하면 더 좋을 부분"으로 병합**

- areas_to_explore 각 항목의 `topic`을 partial_matches와 동일한 리스트에 넣되, 접두사 "관련 경험이 있다면 준비해두면 좋아요:" 추가
- 장점: 별도 "갭" 섹션이 없어 불안감 최소화
- 단점: partial_matches(있긴 한 것)와 areas_to_explore(아예 없는 것)의 성격 차이가 뭉개짐

**Option B: 별도 서브섹션 — "추가로 연결할 수 있는 주제"**

- 섹션 타이틀을 긍정 프레이밍으로 설정
- 각 항목: "이 주제와 연결할 경험이 있다면 언급해보세요: {topic}"
- 장점: 정보 명확, 사용자가 실제로 관련 경험이 있으면 도움됨
- 단점: "이력서에 없는 것"을 보여주므로 민감한 사용자에겐 부담

**Option C: 숨김 — areas_to_explore를 아예 표시하지 않음**

- 장점: 불안 요소 완전 제거
- 단점: 실제로 관련 경험이 있지만 이력서에 안 적은 사용자에게 유용한 정보 손실

**추천: Option A** — 학생 대상 앱에서 "없는 것"을 강조하는 것은 부정적 UX. partial_matches와 통합하되 톤을 부드럽게 유지하면 정보는 전달하면서 불안감을 줄일 수 있음.

---

## 데이터 흐름

```
analystOutput (from sessionReducer)
  │
  ├─ null → Layer 1만 렌더
  │
  └─ exists → useMemo로 아래 계산:
       │
       ├─ roleSkills: interview_plan[].target_skill (unique)
       │              + target_role.evaluation_priorities (unique, 합산 max 8)
       │
       ├─ experienceCards: selected_experiences[]
       │   .sort(relevance_score DESC)
       │   .map(exp => {
       │     planItem = interview_plan.find(p => p.source_experience_id === exp.experience_id)
       │     classification = classifyStarCategory(planItem?.topic ?? exp.title, planItem?.target_skill ?? '')
       │     chips = deriveKeywordChips({ target_skill: planItem?.target_skill ?? '', topic: exp.title }, target_role)
       │     return { exp, classification, chips }
       │   })
       │
       └─ alignment: {
            strengths: strong_matches[],
            opportunities: [...partial_matches, ...areas_to_explore.map(a => ({
              resume_evidence: `이 주제와 연결할 경험이 있다면 준비해보세요`,
              job_requirement: a.topic,
              match_reason: a.reason
            }))]
          }
```

---

## CSS 전략

- 기존 `.guide-panel`, `.star-card`, `.star-card__*` 클래스를 유지/재사용
- 새로 추가되는 클래스:
  - `.guide-panel__section-divider` — Layer 간 시각적 구분선
  - `.guide-panel__section-title` — 섹션 제목 스타일
  - `.guide-panel__tip-list` — Layer 1 팁 리스트
  - `.guide-panel__alignment-item` — 정합성 항목 행
  - `.guide-panel__alignment-item--strength` — accent 좌측 보더
- 모든 색상은 기존 CSS 변수(`--color-accent`, `--color-text-primary`, `--color-text-secondary`, `--color-tile-bg`) 사용
- 새 하드코딩 색상 없음
