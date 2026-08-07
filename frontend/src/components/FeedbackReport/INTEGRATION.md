# FeedbackReport Integration Status

> Pending integration. Last verified: 2026-08-07.

The `FeedbackReport` component and its section components are implemented and tested, but the application does not currently render them. `FeedbackScreen.tsx` displays `feedbackResult` as formatted JSON.

Hosting the React build on AWS Amplify does not change this component contract. The feedback data still comes from the Evaluator Lambda HTTP path; AgentCore and Nova 2 Sonic handle the live voice session, not report rendering or evaluation.

## Required Integration

1. Align `agent3Client.ts` with `schemas/interviewer_output.json`.
2. Retain the complete Analyst output in session state.
3. Map the interview transcript to Evaluator conversation turns and metadata.
4. Type a successful Evaluator response as `EvaluatorOutput`.
5. Render `FeedbackReport` from `FeedbackScreen` when `feedbackResult` is present.

Example target usage:

```tsx
import { FeedbackReport } from './FeedbackReport';
import type { EvaluatorOutput } from '../types/evaluator';

if (feedbackResult) {
  return (
    <FeedbackReport
      data={feedbackResult as EvaluatorOutput}
      onPracticeAgain={onNewSession}
      onViewTranscript={() => {
        // Pending: open the transcript view.
      }}
    />
  );
}
```

Do not treat `AGENT3_SUCCESS` as correctly typed until the request and response handling in `agent3Client.ts` matches the backend. `AGENT3_SUCCESS` is a reducer action, not a SessionManager event.
