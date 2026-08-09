# Implementation Plan: Interview Guide STAR Cards

> Historical implementation record for a superseded predictive-question design. See `../guide-panel-v2/tasks.md` for current implementation status.

## Overview

Replace the dynamic keyword-matching competency guide system with static, analyst-driven STAR-method preparation cards. The implementation proceeds bottom-up: types → utility → services/reducer cleanup → component rewrite → tests. The STAR category table uses the user-confirmed exact trigger keywords and Korean reasoning strings.

## Tasks

- [x] 1. Update types and remove legacy CompetencyGuide infrastructure
  - [x] 1.1 Remove CompetencyGuide type and update SessionState, Agent1Response, Agent3Request in `types/session.ts`
    - Delete the `CompetencyGuide` interface entirely
    - Remove `competencyGuides: CompetencyGuide[]` from `SessionState`
    - Remove `competency_guides: CompetencyGuide[]` from `Agent1Response`
    - Remove `competency_guides: CompetencyGuide[]` from `Agent3Request`
    - Keep `analystOutput`, `transcript`, and all other fields unchanged
    - _Requirements: 5.1, 5.2, 5.3, 5.4_

- [x] 2. Create STAR category matcher utility
  - [x] 2.1 Create `frontend/src/utils/starCategoryMatcher.ts` with types and category table
    - Define `StarCategory` interface (label, triggerKeywords, starElements, reasoning)
    - Define `StarClassification` interface (label, starElements, reasoning)
    - Implement the hardcoded 8-category table with EXACT trigger keywords and Korean reasoning:
      1. "Above & Beyond / Problem Solving" — keywords: `['beyond', 'extra', 'above']` — elements: `['Task', 'Action']` — reasoning: `'Why you set a higher bar than expected and how you solved it'`
      2. "Team Experience" — keywords: `['team', 'conflict', 'collaborat', 'disagreement']` — elements: `['Action', 'Result']` — reasoning: `'What you did within the team and how it affected relationships or outcomes'`
      3. "Initiative" — keywords: `['initiative', 'self-motivat', 'own idea', 'ownership', 'autonom']` — elements: `['Task']` — reasoning: `'Show that you set your own goal without being told'`
      4. "Leadership" — keywords: `['lead', 'leadership', 'mentor', 'delegate']` — elements: `['Action', 'Result']` — reasoning: `'How you moved the team and what changed as a result'`
      5. "Failure / Mistake" — keywords: `['failure', 'mistake', 'fail', 'wrong']` — elements: `['Learning', 'Action']` — reasoning: `'Focus on acknowledging the failure, what you learned, and what you changed'`
      6. "Pressure and Time Management" — keywords: `['deadline', 'pressure', 'time management', 'prioritiz']` — elements: `['Action']` — reasoning: `'Explain what you prioritized first and why'`
      7. "Problem Solving" — keywords: `['problem', 'solve', 'debug', 'issue', 'implement', 'technical', 'develop', 'design']` — elements: `['Action']` — reasoning: `'Explain your approach, iterations, and adjustments'`
      8. "Communication" — keywords: `['communicat', 'explain', 'non-technical']` — elements: `['Situation', 'Action']` — reasoning: `'Identify the audience and explain how you adapted your communication'`
    - Default classification: label `'General'`, elements `['Situation', 'Task', 'Action', 'Result']`, reasoning `'Keep Situation and Task brief; make your Actions and Results specific.'`
    - _Requirements: 1.1, 1.5_

  - [x] 2.2 Implement `classifyStarCategory(topic, targetSkill)` function
    - Concatenate topic + " " + targetSkill, lowercase the result
    - Iterate categories in priority order (index 0 highest)
    - For each category, check if ANY trigger keyword is found via `combined.includes(keyword)`
    - Return the first matching `StarClassification`; if none match, return default
    - Export the function
    - _Requirements: 1.2, 1.3, 1.4_

  - [x] 2.3 Implement and export `deriveKeywordChips(item, targetRole)` helper function
    - Always include item's `target_skill` as first chip
    - For each skill in required_skills + preferred_skills of targetRole, check case-insensitive `includes()` match against lowercased `target_skill + " " + topic`
    - Avoid duplicates
    - Return string array
    - _Requirements: 2.3_

- [x] 3. Update services and reducer to remove competencyGuides
  - [x] 3.1 Update `agent1Client.ts` — remove `mapToCompetencyGuides` and `competency_guides` from return
    - Delete the `mapToCompetencyGuides()` helper function entirely
    - Remove the `competency_guides` field from the returned object in `callAgent1()`
    - Remove the `CompetencyGuide` import from `@/types/session`
    - Keep `nova_sonic_context` and `analyst_output` unchanged
    - _Requirements: 5.3, 5.6_

  - [x] 3.2 Update `sessionReducer.ts` — remove `competencyGuides` from initialState and AGENT1_SUCCESS handler
    - Remove `competencyGuides: []` from `initialState`
    - Remove `competencyGuides: action.payload.competency_guides` from the `AGENT1_SUCCESS` case
    - _Requirements: 5.2_

  - [x] 3.3 Update `agent3Client.ts` — remove `competency_guides` usage from the request type
    - The `Agent3Request` type change from task 1.1 removes the field at the type level
    - Verify that `callAgent3` function body does not reference `request.competency_guides` (it currently doesn't use it in the request body)
    - Ensure `analyst_output` and `transcript` are still included in the request body
    - _Requirements: 5.4, 5.7_

- [x] 4. Rewrite GuidePanel component with STAR cards
  - [x] 4.1 Rewrite `frontend/src/components/GuidePanel.tsx` with new props and STAR card rendering
    - Change props interface to `{ analystOutput: Record<string, unknown> | null }`
    - Remove `guides`, `practiceMode`, `currentInterviewerText` props
    - Remove import of `matchKeywords` from `@/utils/keywordMatcher`
    - Import `classifyStarCategory` and `deriveKeywordChips` from `@/utils/starCategoryMatcher`
    - Define local types: `InterviewPlanItem`, `TargetRole`, `SelectedExperience`
    - Use `useMemo` to derive up to 3 `StarCardData` objects from analystOutput:
      - Extract `interview_plan` (first 3 items), `target_role`, `selected_experiences`
      - For each item: classify STAR category, derive keyword chips, resolve related experience using `experience_id` field (not `id`)
    - Render each card with: "Expected Question N" label, topic, keyword chips, STAR category label + element badges + reasoning, optional related experience
    - Render empty (no cards, no error) when analystOutput is null or plan is empty
    - Include all CSS styles using `<style>` tag (CSS-in-JS pattern matching existing codebase)
    - Use design theme variables: `--color-tile-bg`, `--color-text-primary`, `--color-text-secondary`, `--color-guide-highlight` (#4A9EFF)
    - _Requirements: 1.2, 1.3, 1.4, 2.1, 2.2, 2.3, 2.4, 2.5, 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 4.1, 4.2, 7.1, 7.2, 7.3, 7.4, 7.5_

  - [x] 4.2 Update `InterviewScreen.tsx` — pass `analystOutput` to GuidePanel, remove old props
    - Change GuidePanel usage from `<GuidePanel guides={state.competencyGuides} practiceMode={state.practiceMode} currentInterviewerText={latestInterviewerText} />` to `<GuidePanel analystOutput={state.analystOutput} />`
    - Remove `state.competencyGuides` reference from `triggerAgent3` callback (remove from `callAgent3` argument)
    - Keep panel visibility gating (`state.practiceMode &&`) unchanged
    - _Requirements: 5.2, 6.1, 6.2_

- [x] 5. Delete legacy files
  - [x] 5.1 Delete `frontend/src/utils/keywordMatcher.ts`
    - Remove the file entirely
    - _Requirements: 5.5, 5.6_

- [x] 6. Checkpoint — Ensure TypeScript compiles and Vite build passes
  - Ensure all tests pass, ask the user if questions arise.
  - Run `tsc --noEmit` and `vite build` to verify no type errors or broken imports
  - _Requirements: 8.1, 8.2_

- [x] 7. Write tests
  - [x] 7.1 Write unit tests for `classifyStarCategory` in `frontend/src/utils/__tests__/starCategoryMatcher.test.ts`
    - Test each of the 8 categories matches correctly with a known keyword
    - Test priority order: input matching both "Team Experience" and "Problem Solving" returns "Team Experience"
    - Test default fallback for unmatched input
    - Test case insensitivity (mixed-case input matches lowercase keyword)
    - Test keyword in topic vs target_skill both work
    - Test empty strings return default
    - _Requirements: 1.1, 1.2, 1.3, 1.4_

  - [x] 7.2 Write unit tests for `deriveKeywordChips` in the same test file
    - Test always includes target_skill as first element
    - Test includes matching required_skills (case-insensitive)
    - Test includes matching preferred_skills
    - Test no duplicate chips
    - Test empty/missing targetRole returns only target_skill
    - _Requirements: 2.3_

  - [x] 7.3 Write property tests for classification in `frontend/src/utils/__tests__/starCategoryMatcher.pbt.test.ts`
    - **Property 1: Classification uses lowercased concatenation** — for random topic/targetSkill, result is same regardless of casing
    - **Validates: Requirements 1.2**
    - **Property 2: First-match priority ordering** — inputs containing keywords from multiple categories always return the higher-priority one
    - **Validates: Requirements 1.3**
    - **Property 3: Default fallback for unmatched inputs** — random strings not containing any trigger keyword return default
    - **Validates: Requirements 1.4**
    - **Property 4: Card count bounded by min(plan length, 3)** — for any plan array of length N, derived cards = min(N, 3)
    - **Validates: Requirements 2.1, 2.2, 3.1, 4.2**
    - **Property 5: Keyword chips always include target_skill** — for any item, first chip is always target_skill
    - **Validates: Requirements 2.3**
    - **Property 6: Experience resolution correctness** — matching experience_id resolves to {title, organization}; null/unmatched yields null
    - **Validates: Requirements 2.4, 2.5**

  - [x] 7.4 Write component tests for GuidePanel in `frontend/src/components/__tests__/GuidePanel.test.tsx`
    - Test renders 3 cards from valid analyst output with 5 plan items
    - Test renders fewer cards when plan has < 3 items
    - Test empty state when analystOutput is null
    - Test empty state when interview_plan is empty array
    - Test card labels show "Expected Question 1", "Expected Question 2", "Expected Question 3"
    - Test topic text is displayed
    - Test keyword chips rendered
    - Test STAR section rendered (category label, element badges, reasoning text)
    - Test related experience shown when experience_id matches
    - Test related experience hidden when source_experience_id is null
    - _Requirements: 2.1, 2.2, 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 4.1, 4.2_

- [x] 8. Final checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.
  - Run `vitest run` to verify all test suites pass
  - _Requirements: 8.1, 8.2, 8.3_

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- The STAR category table uses the user-confirmed EXACT Korean reasoning strings and trigger keywords (not the ones in the design doc)
- The `experience_id` field name (not `id`) is used when looking up selected_experiences, per the analyst schema
- Panel visibility gating by `state.practiceMode` is deliberately unchanged — no task modifies that logic
- PracticeBubbles component is untouched
- `callAgent3` continues to send `analyst_output` + `transcript` — only `competency_guides` is removed
- Property tests use fast-check for random input generation
- The design uses TypeScript (React + Vite), so no language selection is needed

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["2.1"] },
    { "id": 2, "tasks": ["2.2", "2.3", "3.1", "3.2", "3.3"] },
    { "id": 3, "tasks": ["4.1", "5.1"] },
    { "id": 4, "tasks": ["4.2"] },
    { "id": 5, "tasks": ["7.1", "7.2", "7.3", "7.4"] }
  ]
}
```
