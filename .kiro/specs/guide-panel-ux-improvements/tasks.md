# Implementation Plan: Guide Panel UX Improvements

## Overview

This plan implements five related UX improvements to the interview screen: English-only reasoning text, descriptive section labels on STAR cards, green accent color unification, mic-denied flow fix with text-mode removal, and vertical layout spacing adjustments. All changes are frontend-only (TypeScript/React). Tasks are ordered so that utility changes come first, then component changes build on top, and finally integration/layout touches complete the wiring.

## Tasks

- [x] 1. Translate reasoning strings to English in starCategoryMatcher.ts
  - [x] 1.1 Replace all Korean `reasoning` values in `STAR_CATEGORIES` array with English equivalents per the design document translation table
    - Update all 8 category entries: Above & Beyond, Team Experience, Initiative, Leadership, Failure/Mistake, Pressure/Time, Problem Solving, Communication
    - Update `DEFAULT_CLASSIFICATION.reasoning` to English
    - Keep all other fields (`label`, `triggerKeywords`, `starElements`) unchanged
    - _Requirements: 1.1, 1.2_

  - [x] 1.2 Write property test: all reasoning strings contain no Korean characters
    - **Property 1: All reasoning strings contain no Korean characters**
    - **Validates: Requirements 1.1, 1.2**
    - Test that every entry in `STAR_CATEGORIES` and `DEFAULT_CLASSIFICATION` has `reasoning` with zero characters in Korean Unicode ranges (U+AC00–U+D7AF, U+1100–U+11FF, U+3130–U+318F)

  - [x] 1.3 Write property test: classification is independent of reasoning text
    - **Property 3: Classification is independent of reasoning text**
    - **Validates: Requirements 1.5**
    - For random `(topic, targetSkill)` pairs, verify `classifyStarCategory` returns consistent `label` and `starElements` regardless of reasoning content — classification depends only on keyword matching

- [x] 2. Add descriptive section labels and update accent color in GuidePanel.tsx
  - [x] 2.1 Add section labels to STAR card structure in GuidePanel
    - Add "Question focus:" label above topic text
    - Add "Skills to highlight:" label above keyword chips
    - Add "Question type:" label above category label
    - Add "Emphasize in your answer:" label above starElements badges
    - Add conditional "Relevant experience:" label above experience section (only when experience exists)
    - Style all labels at 11px font-size with secondary text color (`#A0A0A5`)
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7_

  - [x] 2.2 Rename card label from Korean to English and change accent color to green
    - Change `"예상 질문 {card.index}"` to `"Expected Question {card.index}"`
    - Change `.star-card__label` color from `var(--color-guide-highlight, #4A9EFF)` to `var(--color-accent, #9AE05C)`
    - Change `.star-card__element-badge` color from `var(--color-guide-highlight, #4A9EFF)` to `var(--color-accent, #9AE05C)`
    - Change `.star-card__element-badge` background from `rgba(74, 158, 255, 0.12)` to `rgba(154, 224, 92, 0.12)`
    - Remove all references to `#4A9EFF` and `--color-guide-highlight` from GuidePanel styles
    - _Requirements: 1.3, 3.1, 3.2, 3.3, 3.4_

  - [x] 2.3 Write property test: rendered GuidePanel contains no Korean text
    - **Property 2: Rendered Guide Panel contains no Korean text**
    - **Validates: Requirements 1.4**
    - Generate random `analystOutput` with 1–3 `interview_plan` items, render `GuidePanel`, assert no Korean Unicode characters in rendered text content

  - [x] 2.4 Write unit tests for section labels and color changes
    - Test that "Expected Question 1/2/3" labels render correctly
    - Test that all 5 section labels ("Question focus:", "Skills to highlight:", "Question type:", "Emphasize in your answer:", "Relevant experience:") render when applicable
    - Test that "Relevant experience:" label does NOT render when experience is null
    - Test that rendered style block contains no `#4A9EFF` or `--color-guide-highlight`
    - _Requirements: 1.3, 2.1–2.7, 3.1–3.4_

- [x] 3. Checkpoint — Verify starCategoryMatcher and GuidePanel changes
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Fix mic-denied flow and remove text-mode UI from UserTile and ParticipantTiles
  - [x] 4.1 Remove `textOnly` prop from UserTile and ParticipantTiles
    - Remove `textOnly` parameter from `UserTile` function signature
    - Remove keyboard icon (⌨️) rendering branch
    - Remove "(Text Mode)" suffix from participant label
    - Remove all `textOnly` conditional logic — UserTile shows waveform when active, 👤 icon when idle
    - Remove `textOnly` parameter from `ParticipantTiles` function signature
    - Remove `textOnly` prop forwarding to `UserTile`
    - _Requirements: 4.2, 4.3, 4.4, 4.5_

  - [x] 4.2 Update mic-denied error banner condition and message in InterviewScreen
    - Change condition from `state.inputMode === 'text_only' && state.error?.code === 'MIC_DENIED'` to `state.error?.code === 'MIC_DENIED'`
    - Update error message to: "Microphone access is required. Please allow microphone permission in your browser settings and refresh the page."
    - Keep `role="alert"` for accessibility
    - Remove `textOnly={state.inputMode === 'text_only'}` prop from `ParticipantTiles` usage
    - _Requirements: 4.1, 4.6, 4.7_

  - [x] 4.3 Write unit tests for UserTile, ParticipantTiles, and mic-denied banner
    - Test UserTile does not render "(Text Mode)" text or ⌨️ icon
    - Test UserTile shows waveform when `isActive=true`, 👤 icon when `isActive=false`
    - Test ParticipantTiles renders without `textOnly` prop (TypeScript compilation)
    - Test mic-denied error banner renders correct message text
    - Test mic-denied error banner has `role="alert"` attribute
    - _Requirements: 4.1–4.7_

- [x] 5. Adjust vertical layout spacing for participant tiles and mic button
  - [x] 5.1 Update CSS layout in InterviewScreen for even vertical distribution
    - Add `min-height: 0` to `.participant-tiles` (enables flex children to shrink properly)
    - Add `flex: 1; min-height: 120px` to `.participant-tile` (proportional fill with minimum)
    - Change `.mic-button-wrapper` padding from `24px 0` to `padding: 12px 0 24px` (reduced top gap)
    - Change `.interview-screen__left` gap from `12px` to `8px` (tighter spacing)
    - Do NOT introduce any fixed pixel heights on participant tiles that prevent responsive scaling
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_

- [x] 6. Final checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- All changes are frontend-only — no backend Lambda, S3, or Bedrock changes required
- The design specifies that `UserTile` and `ParticipantTiles` are defined inline in `InterviewScreen.tsx` (not separate files)
- `state.inputMode` field is retained in the reducer — only UI references to text-only mode are removed

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "5.1"] },
    { "id": 1, "tasks": ["1.2", "1.3", "2.1", "4.1"] },
    { "id": 2, "tasks": ["2.2", "4.2"] },
    { "id": 3, "tasks": ["2.3", "2.4", "4.3"] }
  ]
}
```
