# Guide Panel v2 — Requirements

> Maintained requirements. Last verified against `frontend/src/components/GuidePanel.tsx`: 2026-08-08. This specification supersedes `interview-guide-star-cards` and `guide-panel-ux-improvements`.

## Purpose

The Guide Panel provides concise, personalized preparation material during Practice Mode. It does not predict the exact questions Nova will ask.

## Functional Requirements

### R1. Personalized content only

1. The panel must derive its content from the current `analystOutput`.
2. When `analystOutput` is absent, the panel may render its container without personalized sections.
3. The panel must not claim that a displayed topic or experience is a guaranteed interview question.
4. The maintained UI does not include a generic always-visible STAR-tips layer.

### R2. Key Competencies

1. The panel must combine `interview_plan[].target_skill` with `target_role.evaluation_priorities`.
2. Duplicate or empty competency values must be removed.
3. `RoleSkillsHint` must display at most three competencies.
4. The section heading must be `Key Competencies`.

### R3. Experiences to Prepare

1. The data source must be `selected_experiences`.
2. Experiences must be sorted by `relevance_score` in descending order.
3. The panel must render at most the three most relevant experiences.
4. Each card must display the experience title, an advisory STAR angle, and relevant keyword chips.
5. Organization names are not displayed in the maintained card design.
6. The section heading must be `Experiences to Prepare`.

### R4. STAR guidance

1. The implementation must reuse `classifyStarCategory`, `deriveKeywordChips`, and the category definitions in `starCategoryMatcher.ts`.
2. STAR classifications are preparation suggestions, not predictions or scoring.
3. All user-visible copy must be English.

### R5. Presentation and accessibility

1. Experience cards must use semantic list markup.
2. Text labels must accompany color distinctions.
3. The panel must remain vertically scrollable within the interview layout.
4. Derived panel data should be memoized and recomputed when `analystOutput` changes.

### R6. Scope

This is a frontend-only feature. It does not change Lambda handlers, S3 configuration, the AgentCore relay, or the Nova prompt.
