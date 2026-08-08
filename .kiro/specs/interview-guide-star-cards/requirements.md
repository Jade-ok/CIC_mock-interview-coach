# Requirements Document

## Introduction

Replace the current competency-guide keyword-matching cards in the GuidePanel with static, analyst-driven STAR-method interview preparation cards. The new cards are derived from the Analyst output (`analystOutput.interview_plan`) at render time and provide the candidate with predicted questions, relevant skill chips, and STAR-framework answering hints. All existing guide-highlighting logic (keyword matcher, competencyGuides state) is removed as part of this change.

## Glossary

- **GuidePanel**: The React sidebar component rendered inside `InterviewScreen` when Practice Mode is enabled. Displays interview preparation cards.
- **AnalystOutput**: The JSON object returned by the Analyst Lambda, stored in `SessionState.analystOutput`. Contains `interview_plan`, `target_role`, and `selected_experiences`.
- **InterviewPlan**: The `analystOutput.interview_plan` array. Each item contains `topic`, `target_skill`, `source_experience_id`, and other metadata.
- **StarCard**: A single card rendered in the GuidePanel representing one predicted interview question with STAR-method guidance.
- **STAR Category**: One of 8 predefined behavioural-interview categories (plus a default), each with trigger keywords, recommended STAR elements, and reasoning text.
- **STAR Category Table**: A hardcoded lookup table of 8 categories used to classify each interview plan item by matching trigger keywords against `topic + target_skill`.
- **Keyword Chips**: Pill-shaped UI elements showing the `target_skill` and any overlapping required/preferred skills from `target_role`.
- **CompetencyGuide**: The legacy type and state that is being removed in this feature.
- **KeywordMatcher**: The legacy utility (`keywordMatcher.ts`) that is being removed in this feature.

## Requirements

### Requirement 1: STAR Category Classification

**User Story:** As a candidate, I want each predicted question to be automatically classified into a STAR behavioural category, so that I receive targeted answering guidance.

#### Acceptance Criteria

1. WHEN the GuidePanel computes STAR categories, THE STAR Category Table SHALL contain exactly 8 categories in the following priority order: (1) Above & Beyond / Problem Solving, (2) Team Experience, (3) Initiative, (4) Leadership, (5) Failure / Mistake, (6) Pressure and Time Management, (7) Problem Solving, (8) Communication.
2. WHEN the GuidePanel classifies an interview plan item, THE GuidePanel SHALL concatenate the item's `topic` and `target_skill` with a space separator and convert the result to lowercase.
3. WHEN the GuidePanel matches an item against the STAR Category Table, THE GuidePanel SHALL iterate categories 1 through 8 in order and select the first category whose trigger keyword list contains at least one keyword found (via `includes()`) in the combined lowercase string.
4. IF no category's trigger keywords match the combined string, THEN THE GuidePanel SHALL assign the default category with STAR elements Situation, Task, Action, Result and default reasoning text.
5. THE STAR Category Table SHALL define each category with: a label, an array of trigger keywords, an array of recommended STAR elements, and a Korean reasoning string.

### Requirement 2: Card Data Derivation

**User Story:** As a candidate, I want the preparation cards to reflect the Analyst's personalized interview plan, so that my practice guidance is relevant to the target role.

#### Acceptance Criteria

1. WHEN `analystOutput` is available, THE GuidePanel SHALL derive card data from the first 3 items of `analystOutput.interview_plan` in array order.
2. WHEN `analystOutput.interview_plan` contains fewer than 3 items, THE GuidePanel SHALL render only as many cards as items exist.
3. WHEN computing keyword chips for a card, THE GuidePanel SHALL include the item's `target_skill` and any skills from `analystOutput.target_role.required_skills` or `analystOutput.target_role.preferred_skills` that are also present (case-insensitive match) in the item's `target_skill` or `topic`.
4. WHEN a card's `source_experience_id` matches an entry in `analystOutput.selected_experiences`, THE GuidePanel SHALL display that experience's `title` and `organization` on the card.
5. IF a card's `source_experience_id` is null or does not match any selected experience, THEN THE GuidePanel SHALL hide the related-experience line for that card.

### Requirement 3: Card Rendering

**User Story:** As a candidate, I want each card to clearly show the predicted question topic, relevant skills, and STAR answering hints, so I can prepare effectively.

#### Acceptance Criteria

1. THE GuidePanel SHALL render a maximum of 3 StarCards.
2. THE GuidePanel SHALL display a top label reading "예상 질문 N" where N equals the card's 1-based index.
3. THE GuidePanel SHALL display the `topic` field as the most visually prominent text element on each card.
4. THE GuidePanel SHALL display keyword chips below the topic showing the derived skill tags.
5. THE GuidePanel SHALL display the matched STAR category's label, recommended element badges, and Korean reasoning string in a visually subdued style below the keyword chips.
6. WHEN a related experience is available, THE GuidePanel SHALL display the experience title and organization below the STAR hint section.

### Requirement 4: Static Computation Timing

**User Story:** As a candidate, I want the cards to appear immediately when Practice Mode is enabled, without waiting for speech events.

#### Acceptance Criteria

1. THE GuidePanel SHALL compute all card data from `analystOutput` at component render time, not in response to speech or transcript events.
2. WHEN `analystOutput` is null or `analystOutput.interview_plan` is empty, THE GuidePanel SHALL render an empty state with no cards.

### Requirement 5: Legacy Competency Guide Removal

**User Story:** As a developer, I want the unused competency-guide infrastructure removed, so the codebase stays clean and maintainable.

#### Acceptance Criteria

1. THE codebase SHALL NOT contain the `CompetencyGuide` type definition after this change.
2. THE codebase SHALL NOT contain the `competencyGuides` field in `SessionState` after this change.
3. THE codebase SHALL NOT contain the `competency_guides` field in `Agent1Response` after this change.
4. THE codebase SHALL NOT contain the `competency_guides` field in `Agent3Request` after this change.
5. THE codebase SHALL NOT contain the `keywordMatcher.ts` utility file after this change.
6. THE codebase SHALL NOT contain any import or usage of the `matchKeywords` function after this change.
7. WHEN the `callAgent3` function sends a request to the evaluator, THE `callAgent3` function SHALL continue to include `analyst_output` and `transcript` fields in the request body.

### Requirement 6: Panel Visibility Preservation

**User Story:** As a candidate, I want the guide panel to remain toggled by Practice Mode as before, so my workflow is unchanged.

#### Acceptance Criteria

1. THE InterviewScreen SHALL continue to render the GuidePanel only when `state.practiceMode` is true.
2. THE InterviewScreen SHALL NOT modify the panel visibility logic as part of this change.
3. THE PracticeBubbles component SHALL remain unchanged by this feature.

### Requirement 7: Design Theme Compliance

**User Story:** As a candidate, I want the new cards to match the existing dark-theme visual style for a cohesive experience.

#### Acceptance Criteria

1. THE StarCard background SHALL use `var(--color-tile-bg, #1C1C1E)` or a derived semi-transparent variant consistent with the existing card styling.
2. THE StarCard text SHALL use `var(--color-text-primary, #FFFFFF)` for primary content and `var(--color-text-secondary, #A0A0A5)` for subdued content.
3. THE keyword chip styling SHALL use a semi-transparent background with secondary text color, matching the existing pill styling.
4. THE STAR element badges SHALL use `var(--color-guide-highlight, #4A9EFF)` as their accent color.
5. THE StarCard border-radius SHALL be 10px, matching the existing guide card radius.

### Requirement 8: Build Integrity

**User Story:** As a developer, I want the build and type checks to pass after all removals and additions, so no regressions are introduced.

#### Acceptance Criteria

1. WHEN all changes are applied, THE project SHALL pass TypeScript compilation with zero type errors.
2. WHEN all changes are applied, THE project SHALL pass the existing Vite build without errors.
3. WHEN all changes are applied, THE project SHALL pass all existing Vitest test suites without failures.
