# Feedback Report Design

> Maintained design. Last verified: 2026-08-09.

## Overview

`FeedbackReport` is a React/TypeScript page rendered during the session's `feedback` phase. `FeedbackScreen` owns loading and error states, validates the Evaluator response, and passes a typed `EvaluatorOutput` plus retry callbacks into the report.

## Component tree

```text
FeedbackReport
├── sticky header and retry actions
├── HeroSection
│   ├── target role and report title
│   ├── overall score ring
│   └── weakest-dimension action
├── DimensionScoresGrid
│   └── DimensionCard × 4
│       └── ScoreBar and expandable rationale
├── FeedbackColumns (Overall Summary)
├── KeywordCoverage
├── QuestionBreakdown
│   └── QuestionCard × question_count
│       ├── weakest-score chip / expandable score rows
│       ├── qualitative feedback
│       └── optional transcript answer
├── ContextualAdvice
└── FooterCTA
```

## Interfaces and data flow

```typescript
interface FeedbackReportProps {
  data: EvaluatorOutput;
  onPracticeAgain: () => void;
  onNewSession: () => void;
  onViewTranscript?: () => void;
  transcript?: TranscriptEntry[];
}
```

`EvaluatorOutput` is defined in `frontend/src/types/evaluator.ts` and mirrors `schemas/evaluator_output.json`. The report uses:

- `overall_scores.total` and `.dimensions` for the hero and dimension cards;
- `strengths[0]` and `improvements[0]` for the concise overall summary;
- `keywords_covered` and `keywords_not_covered` for keyword chips;
- `per_question_scores` and `question_count` for the ordered breakdown;
- `contextual_advice` for the expandable numbered list;
- `interview_metadata.target_role` for the hero context.

When transcript entries are available, `QuestionBreakdown` merges adjacent entries with the same speaker and pairs interviewer turns with candidate turns. A paired answer is optional presentation data; Evaluator scores remain the source of report scoring.

## Interaction design

- The hero selects the lowest aggregate dimension and maps it to one short action.
- A dimension card expands to explain how many per-question scores meet the demonstrated threshold of 3/5.
- A question card initially emphasizes its weakest dimension; its chip toggles all four score bars.
- A question card independently toggles the matching transcript answer when one exists.
- Contextual advice shows two items initially and reveals the remainder on request.
- Transcript navigation is hidden until its callback exists.

## Presentation and accessibility

- Component-scoped CSS consumes variables from `feedback-theme.css`.
- The overall score uses an SVG ring; dimensions use five-segment bars with numeric labels.
- Interactive cards expose button semantics, keyboard activation, and expansion state.
- The desktop layout uses grids and horizontal navigation; mobile breakpoints stack and wrap content for a minimum 375 px viewport.

## Verification

Vitest and React Testing Library cover the composed report, score bars, interactive dimensions, hero action, summaries, question cards, advice expansion, retry callbacks, and optional transcript controls. The production Vite build verifies type and asset integration.
