# Feedback Report Requirements

> Maintained requirements. Last verified: 2026-08-08. `FeedbackReport` is integrated into `FeedbackScreen` and consumes `schemas/evaluator_output.json` through the `EvaluatorOutput` TypeScript type.

## Purpose

The report turns Evaluator output into a concise, student-friendly review of an interview. It uses the Midnight Green theme and supports variable-length interviews.

## Requirements

### 1. Layout and navigation

- The report is a single vertically scrollable, responsive page.
- The sticky header shows the product name and the actions **Retry with This Resume** and **Retry with New Resume**.
- **View full transcript** appears only when a transcript-view callback is supplied.
- The same retry actions appear in the closing call-to-action area.

### 2. Hero summary

- The hero shows the target role, the heading **Your Interview Report**, and the overall score out of five.
- The hero identifies the lowest-scoring dimension and presents one concrete action under **YOUR ONE THING TO FIX**.
- The score ring has an accessible numeric label.
- `readiness_label` remains part of the Evaluator contract but is not displayed by the current hero.

### 3. Dimension scores

- All four dimensions are shown with a human-readable label, explanation, numeric average, and five-segment score bar.
- Dimension cards use the per-question scores to explain how many answers demonstrated that dimension.
- Cards with supporting data are keyboard accessible and expand on click, Enter, or Space.

### 4. Overall and keyword summaries

- **Overall Summary** displays the first available strength and first available improvement as a concise summary.
- **Role requirements you covered** shows covered and missed job-description keywords as distinct chips and includes a covered-count summary.
- Keyword coverage is omitted when both keyword arrays are empty.

### 5. Question-by-question feedback

- The page renders every item in `per_question_scores` in order and explains that only answered questions are scored.
- Each card shows its question number, question text, qualitative strength and improvement, and a chip for its weakest dimension.
- Activating the chip reveals all four dimension scores.
- When transcript answers are supplied, each matching card can show or hide the candidate's answer.
- The layout supports the schema's variable `question_count`; it does not promise a fixed number of questions or follow-ups.

### 6. Contextual advice

- **For your next interview** renders numbered advice tied to the résumé and target role.
- The first two items are initially visible; additional items can be expanded and collapsed.

### 7. Retry behavior

- **Retry with This Resume** preserves the current upload, analysis, and interview context while starting a fresh interview session.
- **Retry with New Resume** resets the application to the upload flow.

### 8. Data, accessibility, and responsiveness

- The component accepts a valid `EvaluatorOutput` and formats aggregate scores to one decimal place.
- Numeric text accompanies visual score indicators; buttons and interactive score cards expose accessible names and state.
- The page remains usable from 375 px mobile widths through desktop layouts, with navigation, cards, grids, and footer actions wrapping or stacking as needed.
- Theme values come from the feedback theme variables and the project system-font stack.
