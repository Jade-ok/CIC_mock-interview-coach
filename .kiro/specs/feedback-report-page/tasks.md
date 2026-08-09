# Feedback Report Tasks

> Active tracker. Last verified: 2026-08-08.

## Implemented

- [x] Define `EvaluatorOutput` and dimension-label utilities.
- [x] Integrate the typed report into `FeedbackScreen` after a successful Evaluator response.
- [x] Render the target role, overall score ring, and weakest-dimension action in `HeroSection`.
- [x] Render four interactive dimension cards with accessible score bars and per-question rationale.
- [x] Render a concise **Overall Summary** from the leading strength and improvement.
- [x] Render covered and missed role keywords with a coverage count.
- [x] Render ordered question cards with qualitative feedback and expandable dimension scores.
- [x] Pair optional transcript entries with question cards and provide per-answer show/hide controls.
- [x] Render expandable, numbered contextual advice.
- [x] Provide **Retry with This Resume** and **Retry with New Resume** in the header and footer.
- [x] Hide transcript navigation when no transcript-view callback is implemented.
- [x] Support mobile and desktop layouts using the shared feedback theme variables.
- [x] Cover the report and its subcomponents with Vitest/React Testing Library tests.

## Remaining

- [ ] Implement a standalone full-transcript view and then supply `onViewTranscript` from `FeedbackScreen`.
