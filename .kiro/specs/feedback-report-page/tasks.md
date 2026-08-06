# Tasks

## Task 1: Type Definitions and Utility Setup

- [ ] Create `frontend/src/types/evaluator.ts` with EvaluatorOutput, PerQuestionScore, OverallScores, and InterviewMetadata interfaces
- [ ] Create `frontend/src/utils/dimensionLabels.ts` with dimension key → human-readable label/description mapping
- [ ] Create `frontend/src/utils/readinessSubheadings.ts` with readiness label → supportive subheading mapping
- [ ] Add CSS custom properties for the feedback page to the global theme (or a dedicated CSS module)

## Task 2: ScoreBar Component

- [ ] Create `frontend/src/components/FeedbackReport/ScoreBar.tsx` — 5-segment bar visualization
- [ ] Implement filled/unfilled logic: segments filled up to the score value, unfilled for the rest
- [ ] Support `size` prop ('sm' | 'md') for different contexts
- [ ] Add `aria-label` with numeric score for accessibility
- [ ] Write unit tests: renders correct filled/unfilled count for scores 1-5, handles float scores for averages

## Task 3: HeroSection Component

- [ ] Create `frontend/src/components/FeedbackReport/HeroSection.tsx`
- [ ] Display readiness_label as large heading
- [ ] Display supportive subheading mapped from readiness label
- [ ] Display "INTERVIEW FEEDBACK · {target_role}" context line
- [ ] Display total score (e.g. "3.0 / 5 overall") and question count (e.g. "4 of 6 questions answered")
- [ ] Write unit tests: correct label, subheading, score formatting, question count display

## Task 4: DimensionCard and DimensionScoresGrid

- [ ] Create `frontend/src/components/FeedbackReport/DimensionCard.tsx` — single dimension display
- [ ] Display human-readable label, description, numeric score, and ScoreBar
- [ ] Create `frontend/src/components/FeedbackReport/DimensionScoresGrid.tsx` — 2x2 grid layout of 4 DimensionCards
- [ ] Implement responsive layout: 2x2 grid on desktop, single column on mobile
- [ ] Write unit tests: all 4 dimensions render with correct labels and scores

## Task 5: FeedbackColumns (Strengths and Improvements)

- [ ] Create `frontend/src/components/FeedbackReport/FeedbackColumns.tsx`
- [ ] Render "What you did well" section with all strengths items as paragraphs
- [ ] Render "What to work on next" section with all improvements items as bulleted list
- [ ] Style direct quotes with distinct quotation styling (italic or quote marks)
- [ ] Implement responsive layout: side-by-side on desktop, stacked on mobile
- [ ] Write unit tests: renders all strengths and improvements, correct section headings

## Task 6: ContextualAdvice Section

- [ ] Create `frontend/src/components/FeedbackReport/ContextualAdvice.tsx`
- [ ] Display "For your next interview" heading with subheading
- [ ] Render each advice item as a numbered entry
- [ ] Write unit tests: renders all advice items with correct numbering

## Task 7: QuestionCard and QuestionBreakdown

- [ ] Create `frontend/src/components/FeedbackReport/QuestionCard.tsx` — single question display
- [ ] Display turn type badge ("Main question" or "Follow-up") with distinct styling
- [ ] Display question text (bold) and answer summary
- [ ] Display 4 ScoreBar components (one per dimension) with dimension labels
- [ ] Create `frontend/src/components/FeedbackReport/QuestionBreakdown.tsx` — section container
- [ ] Display intro line about question count and early-exit messaging
- [ ] Render QuestionCards in conversation order
- [ ] Write unit tests: correct turn badge, question/answer text, score bars rendered, handles 1-6 questions

## Task 8: FooterCTA Component

- [ ] Create `frontend/src/components/FeedbackReport/FooterCTA.tsx`
- [ ] Display motivational message "Every practice round makes the real one easier."
- [ ] Render "Practice again" as primary button (filled style)
- [ ] Render "View full transcript" as secondary button (outlined style)
- [ ] Use accent color (`#FF5C5C`) background for footer band
- [ ] Wire onPracticeAgain and onViewTranscript callbacks
- [ ] Write unit tests: buttons trigger callbacks, motivational text present

## Task 9: FeedbackReport Page Container

- [ ] Create `frontend/src/components/FeedbackReport/FeedbackReport.tsx` — page-level container
- [ ] Compose all section components in correct order: Header → Hero → Dimensions → Columns → Advice → Questions → Footer
- [ ] Create `frontend/src/components/FeedbackReport/FeedbackReport.module.css` — page-level styles
- [ ] Create `frontend/src/components/FeedbackReport/index.ts` — barrel export
- [ ] Pass data from EvaluatorOutput prop to each sub-component
- [ ] Write integration test: full render with mock EvaluatorOutput data, all sections present

## Task 10: Integration with Existing App

- [ ] Connect FeedbackReport to the existing FeedbackScreen component (phase === 'feedback')
- [ ] Map AGENT3_SUCCESS payload to EvaluatorOutput type
- [ ] Wire onPracticeAgain to dispatch RESET action
- [ ] Wire onViewTranscript to open transcript view (or placeholder)
- [ ] Verify the full flow: mock evaluator response → FeedbackReport renders correctly
