# Tasks

> Active tracker. Last verified: 2026-08-07. FeedbackReport is integrated with the existing FeedbackScreen. Amplify publishing and authenticated AgentCore WSS are separate pending deployment tasks.

## Task 1: Type Definitions and Utility Setup

- [x] Create `frontend/src/types/evaluator.ts` with EvaluatorOutput, PerQuestionScore, OverallScores, and InterviewMetadata interfaces
- [x] Create `frontend/src/utils/dimensionLabels.ts` with dimension key → human-readable label/description mapping
- [x] Create `frontend/src/utils/readinessSubheadings.ts` with readiness label → supportive subheading mapping
- [x] Add CSS custom properties for the feedback page to the global theme (or a dedicated CSS module)

## Task 2: ScoreBar Component

- [x] Create `frontend/src/components/FeedbackReport/ScoreBar.tsx` — 5-segment bar visualization
- [x] Implement filled/unfilled logic: segments filled up to the score value, unfilled for the rest
- [x] Support `size` prop ('sm' | 'md') for different contexts
- [x] Add `aria-label` with numeric score for accessibility
- [x] Write unit tests: renders correct filled/unfilled count for scores 1-5, handles float scores for averages

## Task 3: HeroSection Component

- [x] Create `frontend/src/components/FeedbackReport/HeroSection.tsx`
- [x] Display readiness_label as large heading
- [x] Display supportive subheading mapped from readiness label
- [x] Display "INTERVIEW FEEDBACK · {target_role}" context line
- [x] Display total score (e.g. "3.0 / 5 overall") and question count (e.g. "4 of 6 questions answered")
- [x] Write unit tests: correct label, subheading, score formatting, question count display

## Task 4: DimensionCard and DimensionScoresGrid

- [x] Create `frontend/src/components/FeedbackReport/DimensionCard.tsx` — single dimension display
- [x] Display human-readable label, description, numeric score, and ScoreBar
- [x] Create `frontend/src/components/FeedbackReport/DimensionScoresGrid.tsx` — 2x2 grid layout of 4 DimensionCards
- [x] Implement responsive layout: 2x2 grid on desktop, single column on mobile
- [x] Write unit tests: all 4 dimensions render with correct labels and scores

## Task 5: FeedbackColumns (Strengths and Improvements)

- [x] Create `frontend/src/components/FeedbackReport/FeedbackColumns.tsx`
- [x] Render "What you did well" section with all strengths items as paragraphs
- [x] Render "What to work on next" section with all improvements items as bulleted list
- [x] Style direct quotes with distinct quotation styling (italic or quote marks)
- [x] Implement responsive layout: side-by-side on desktop, stacked on mobile
- [x] Write unit tests: renders all strengths and improvements, correct section headings

## Task 6: ContextualAdvice Section

- [x] Create `frontend/src/components/FeedbackReport/ContextualAdvice.tsx`
- [x] Display "For your next interview" heading with subheading
- [x] Render each advice item as a numbered entry
- [x] Write unit tests: renders all advice items with correct numbering

## Task 7: QuestionCard and QuestionBreakdown

- [x] Create `frontend/src/components/FeedbackReport/QuestionCard.tsx` — single question display
- [x] Display turn type badge ("Main question" or "Follow-up") with distinct styling
- [x] Display question text (bold) and answer summary
- [x] Display 4 ScoreBar components (one per dimension) with dimension labels
- [x] Create `frontend/src/components/FeedbackReport/QuestionBreakdown.tsx` — section container
- [x] Display intro line about question count and early-exit messaging
- [x] Render QuestionCards in conversation order
- [x] Write unit tests: correct turn badge, question/answer text, score bars rendered, handles 1-6 questions

## Task 8: FooterCTA Component

- [x] Create `frontend/src/components/FeedbackReport/FooterCTA.tsx`
- [x] Display motivational message "Every practice round makes the real one easier."
- [x] Render "Practice again" as primary button (filled style)
- [x] Render "View full transcript" as secondary button (outlined style)
- [x] Use accent color (`#FF5C5C`) background for footer band
- [x] Wire onPracticeAgain and onViewTranscript callbacks
- [x] Write unit tests: buttons trigger callbacks, motivational text present

## Task 9: FeedbackReport Page Container

- [x] Create `frontend/src/components/FeedbackReport/FeedbackReport.tsx` — page-level container
- [x] Compose all section components in correct order: Header → Hero → Dimensions → Columns → Advice → Questions → Footer
- [x] Create `frontend/src/components/FeedbackReport/FeedbackReport.css` — page-level styles
- [x] Create `frontend/src/components/FeedbackReport/index.ts` — barrel export
- [x] Pass data from EvaluatorOutput prop to each sub-component
- [x] Write integration test: full render with mock EvaluatorOutput data, all sections present

## Task 10: Integration with Existing App

- [x] Connect FeedbackReport to the existing FeedbackScreen component (phase === 'feedback')
- [x] Render AGENT3_SUCCESS results through EvaluatorOutput after aligning the frontend request with the Evaluator contract
- [x] Wire onPracticeAgain to dispatch RESET action in the integrated screen
- [ ] Add a transcript view and then expose the currently hidden View Full Transcript controls
- [x] Verify the full flow: mock evaluator response → FeedbackReport renders correctly
