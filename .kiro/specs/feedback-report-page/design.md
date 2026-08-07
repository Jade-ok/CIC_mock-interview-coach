# Design Document — Feedback Report Page

## Overview

The Feedback Report Page is a read-only React page that renders the Evaluator agent's JSON output as a visually rich, student-friendly feedback report. It consumes the `EvaluatorOutput` type (matching `schemas/evaluator_output.json`) passed via props or session state, and renders it using the project's Midnight Green dark theme.

Key technical decisions:
- **Framework**: React 18 + TypeScript (consistent with existing frontend)
- **Styling**: CSS Modules with CSS custom properties (theme tokens from `design-theme.md`)
- **Testing**: Vitest + React Testing Library
- **Layout**: Single scrollable page with section-based composition
- **No routing library**: Page rendered as a component within the existing `App.tsx` phase-based navigation (`phase === 'feedback'`)

---

## Architecture

### Component Tree

```
FeedbackReport (page-level container)
├── FeedbackHeader
│   └── NavActions ("View full transcript", "Practice again")
├── HeroSection
│   ├── ReadinessLabel
│   └── ScoreSummary (total score + question count)
├── DimensionScoresGrid
│   └── DimensionCard (×4)
│       ├── DimensionLabel + Description
│       └── ScoreBar (5-segment visual)
├── FeedbackColumns
│   ├── StrengthsList
│   └── ImprovementsList
├── ContextualAdviceSection
│   └── AdviceItem (numbered)
├── QuestionBreakdown
│   ├── IntroLine
│   └── QuestionCard (×1-6)
│       ├── TurnBadge ("Main question" | "Follow-up")
│       ├── QuestionText + AnswerSummary
│       └── ScoreBar (×4)
└── FooterCTA
    ├── PracticeAgainButton (primary)
    └── ViewTranscriptButton (secondary)
```

---

## Component Interfaces

### FeedbackReport (Page Container)

```typescript
interface FeedbackReportProps {
  data: EvaluatorOutput;
  onPracticeAgain: () => void;
  onViewTranscript: () => void;
}
```

### EvaluatorOutput Type

```typescript
interface PerQuestionScore {
  question_text: string;
  answer_summary: string;
  scores: {
    concrete_example: number;      // 1-5 integer
    situation_action_result: number;
    link_to_job: number;
    quantifiable_outcome: number;
  };
}

interface OverallScores {
  dimensions: {
    concrete_example: number;      // 1.0-5.0 float
    situation_action_result: number;
    link_to_job: number;
    quantifiable_outcome: number;
  };
  total: number;
}

interface InterviewMetadata {
  candidate_level: string;
  target_role: string;
  status: 'completed' | 'ended_early';
  completion_reason: string;
  main_questions_completed: number;
  follow_ups_completed: number;
  ended_early: boolean;
}

interface EvaluatorOutput {
  per_question_scores: PerQuestionScore[];
  overall_scores: OverallScores;
  question_count: number;
  readiness_label: string;
  strengths: string[];
  improvements: string[];
  contextual_advice: string[];
  interview_metadata: InterviewMetadata;
}
```

### HeroSection

```typescript
interface HeroSectionProps {
  readinessLabel: string;
  totalScore: number;
  questionCount: number;
  targetRole: string;
}
```

**Readiness label → subheading mapping:**

| Label | Subheading |
|-------|-----------|
| Interview ready | You're well-prepared. Your answers are clear, structured, and connected to the role. |
| Strong foundation | You're on solid ground. A few refinements will make your answers stand out. |
| Developing well | You're building real interview skills. Your examples are genuine — now it's about telling them with more structure and impact. |
| Needs more practice | You have relevant experience — the next step is learning to present it clearly and concisely. |
| Needs clearer examples | Focus on preparing 2-3 specific stories you can tell confidently with clear structure. |

### DimensionCard

```typescript
interface DimensionCardProps {
  dimension: keyof OverallScores['dimensions'];
  score: number;          // 1.0-5.0
  label: string;          // Human-readable label
  description: string;    // What it measures
}
```

**Dimension display mapping:**

| Key | Label | Description |
|-----|-------|-------------|
| concrete_example | Concrete example | Did you point to a real project or moment? |
| situation_action_result | Situation → Action → Result | Was the story easy to follow? |
| link_to_job | Link to the job | Did you connect it to this role? |
| quantifiable_outcome | Quantifiable outcome | Did you show measurable impact? |

### ScoreBar

```typescript
interface ScoreBarProps {
  score: number;     // 1-5 (integer for per-question, float for averages)
  maxScore: 5;
  size?: 'sm' | 'md';  // sm for question cards, md for dimension grid
}
```

**Visual design:**
- 5 equal-width segments
- Filled segments: `#FF5C5C` (accent/warning from theme) — represents score
- Unfilled segments: `#2C2C2E` (control bar background) — represents gap
- Segments have 2px gap between them
- Height: 8px (md), 6px (sm)
- Border radius: 2px per segment

### QuestionCard

```typescript
interface QuestionCardProps {
  index: number;                    // 1-based question number
  turnType: 'main_question' | 'follow_up';
  questionText: string;
  answerSummary: string;
  scores: PerQuestionScore['scores'];
}
```

**Turn badge styles:**
- Main question: solid background `#2C2C2E`, white text
- Follow-up: bordered style, `#2C2C2E` border, secondary text color

### FooterCTA

```typescript
interface FooterCTAProps {
  onPracticeAgain: () => void;
  onViewTranscript: () => void;
}
```

**Visual design:**
- Background: `#FF5C5C` (accent color) for the full-width footer band
- "Practice again" button: filled white, dark text (primary)
- "View full transcript" button: outlined white border, white text (secondary)
- Motivational text: "Every practice round makes the real one easier." in white

---

## CSS Theme Integration

```css
:root {
  /* From steering/design-theme.md */
  --bg-canvas: #0A0A0A;
  --bg-tile: #1C1C1E;
  --bg-control: #2C2C2E;
  --text-primary: #FFFFFF;
  --text-secondary: #A0A0A5;
  --accent-green: #9AE05C;
  --accent-red: #FF5C5C;
  --accent-blue: #4A9EFF;

  /* Feedback page specific */
  --score-bar-filled: var(--accent-red);
  --score-bar-empty: var(--bg-control);
  --section-gap: 48px;
  --card-padding: 24px;
  --card-radius: 8px;

  /* Typography */
  --font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  --font-hero: 3rem;
  --font-section-title: 1.5rem;
  --font-body: 1rem;
  --font-small: 0.875rem;
}
```

---

## File Structure

```
frontend/src/
├── components/
│   └── FeedbackReport/
│       ├── FeedbackReport.tsx        # Page container
│       ├── FeedbackReport.module.css
│       ├── HeroSection.tsx
│       ├── DimensionScoresGrid.tsx
│       ├── DimensionCard.tsx
│       ├── ScoreBar.tsx
│       ├── FeedbackColumns.tsx
│       ├── ContextualAdvice.tsx
│       ├── QuestionBreakdown.tsx
│       ├── QuestionCard.tsx
│       ├── FooterCTA.tsx
│       └── index.ts                  # barrel export
├── types/
│   └── evaluator.ts                  # EvaluatorOutput type definition
└── utils/
    └── dimensionLabels.ts            # Dimension key → label/description mapping
```

---

## Responsive Breakpoints

| Viewport | Behavior |
|----------|----------|
| ≤ 640px (mobile) | Single column: dimension cards stack, strengths/improvements stack, full-width question cards |
| 641px – 1024px (tablet) | 2-column dimension grid, strengths/improvements side-by-side |
| ≥ 1025px (desktop) | 2×2 dimension grid, side-by-side feedback columns, max-width container (800px) centered |

---

## Data Flow

```
SessionManager (phase: 'feedback')
    │
    ├── AGENT3_SUCCESS action with EvaluatorOutput payload
    │
    └── FeedbackReport component receives data via:
        Option A: SessionContext (if integrated with existing state)
        Option B: Direct prop from FeedbackScreen parent

        FeedbackReport renders immediately — no loading state needed
        (loading/error states handled by parent FeedbackScreen component
         which already exists in the frontend-interview design)
```

---

## Testing Strategy

### Unit Tests (Vitest + React Testing Library)

- **ScoreBar**: renders correct number of filled/unfilled segments for scores 1-5
- **DimensionCard**: displays correct label, description, and formatted score
- **QuestionCard**: renders turn badge, question text, answer summary, and 4 score bars
- **HeroSection**: displays correct readiness label, subheading, score, and question count
- **FeedbackColumns**: renders all strengths and improvements items
- **ContextualAdvice**: renders numbered advice items
- **FooterCTA**: buttons trigger correct callbacks
- **FeedbackReport**: full render with mock data, verifies all sections present

### Integration Test

- Pass a complete `EvaluatorOutput` fixture (from `evaluator/tests/fixtures/sample_input.json` mock response)
- Verify all 6 questions render with correct scores
- Verify overall scores display correctly
- Verify readiness label and subheading match

---

## Accessibility Considerations

- Score bars include `aria-label` with numeric value (e.g. "Concrete example: 3.5 out of 5")
- Section headings use proper heading hierarchy (h1 for readiness label, h2 for sections, h3 for questions)
- Color is not the sole indicator of score — numeric values always displayed alongside bars
- Buttons have clear accessible labels
- Page content follows logical reading order matching visual layout
