# Guide Panel v2 — Design

> Maintained design. Last verified against the current frontend: 2026-08-08. This document supersedes the earlier predictive-question Guide Panel designs.

## Overview

`GuidePanel` is a presentation-only React component shown when Practice Mode is enabled. It converts selected fields from the Analyst output into two compact preparation sections:

```text
GuidePanel
├── Key Competencies
│   └── RoleSkillsHint (maximum 3 skills)
└── Experiences to Prepare
    └── ExperienceCard[] (maximum 3, relevance descending)
```

The component does not promise that Nova will ask about a displayed item. Nova receives broader Analyst output and controls the spoken conversation through the AgentCore relay.

## Data Flow

```text
Analyst Lambda
  └─ analyst_output
      ├─ interview_plan[].target_skill
      ├─ target_role.evaluation_priorities
      └─ selected_experiences[]
             ↓
        GuidePanel useMemo
             ├─ RoleSkillsHint
             └─ ExperienceCard
```

## Component Responsibilities

### `GuidePanel.tsx`

- Return no personalized section when `analystOutput` is absent.
- Deduplicate plan skills and pass them with evaluation priorities to `RoleSkillsHint`.
- Sort a copy of `selected_experiences` by `relevance_score` descending.
- Limit experience cards to three.
- Match each experience to an interview-plan item through `source_experience_id` when possible.
- Use the plan topic/skill, falling back to the experience title, for STAR classification and chips.

### `RoleSkillsHint.tsx`

- Merge target skills and evaluation priorities.
- Remove duplicates and empty values.
- Display no more than three items under `Key Competencies`.

### `ExperienceCard.tsx`

- Display the experience title.
- Display advisory STAR classification and keyword chips.
- Avoid `Expected Question` or other predictive language.
- Omit organization in the maintained compact layout.

## State and Runtime Boundaries

The panel receives `analystOutput` through frontend session state. It does not mutate interview state, send WebSocket messages, or call backend services. Toggling Practice Mode changes presentation only.

## Styling and Accessibility

- Reuse the shared Midnight Green theme variables and application accent color.
- Render experience cards as `<li>` elements within a semantic list.
- Keep text labels for meaning that is also conveyed with color.
- Permit vertical scrolling without changing the surrounding interview layout.

## Explicit Non-Goals

- Predicting Nova's exact questions.
- Showing a generic STAR tutorial layer.
- Displaying résumé/job alignment summaries.
- Displaying organization names.
- Changing Analyst, Interviewer, AgentCore, Nova, S3, or Evaluator behavior.
