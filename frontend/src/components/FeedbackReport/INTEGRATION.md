# Integration with Existing App

## How to connect FeedbackReport to the existing FeedbackScreen

In `FeedbackScreen.tsx` (or equivalent), import and use:

```tsx
import { FeedbackReport } from '../FeedbackReport';
import type { EvaluatorOutput } from '../../types/evaluator';

// Inside FeedbackScreen render:
if (state.feedbackData) {
  return (
    <FeedbackReport
      data={state.feedbackData as EvaluatorOutput}
      onPracticeAgain={() => dispatch({ type: 'RESET' })}
      onViewTranscript={() => { /* TODO: open transcript view */ }}
    />
  );
}
```

## Data mapping

The `AGENT3_SUCCESS` action payload from the SessionManager maps directly to `EvaluatorOutput`:
- No transformation needed — the Evaluator Lambda output matches the `EvaluatorOutput` interface exactly.

## Actions

- `onPracticeAgain` → dispatches `{ type: 'RESET' }` to return to upload screen
- `onViewTranscript` → placeholder for future transcript view implementation
