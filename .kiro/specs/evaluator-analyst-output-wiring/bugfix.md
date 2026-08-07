# Bugfix Requirements Document

## Introduction

The evaluator (Agent 3) does not receive `analyst_output` from the pipeline. Agent 1 computes `analyst_output` (containing interview_plan, competency analysis, etc.) but does not return it in `Agent1Response`. Consequently, it is never stored in session state and never passed to `callAgent3()`. This means the evaluator Lambda lacks the context needed for accurate, competency-aware scoring of interview responses.

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN Agent 1 completes successfully THEN the system discards `analyst_output` by not including it in the `Agent1Response` return value

1.2 WHEN the session reducer handles `AGENT1_SUCCESS` THEN the system does not store `analyst_output` because it is absent from the payload and `SessionState` has no field for it

1.3 WHEN the interview ends and `callAgent3()` is invoked from `InterviewScreen.tsx` THEN the system sends an `Agent3Request` without `analyst_output` (the field is undefined)

1.4 WHEN the interview ends and `callAgent3()` is invoked from `App.tsx` (feedback retry) THEN the system sends an `Agent3Request` without `analyst_output` (the field is undefined)

### Expected Behavior (Correct)

2.1 WHEN Agent 1 completes successfully THEN the system SHALL include `analyst_output` in the `Agent1Response` return value

2.2 WHEN the session reducer handles `AGENT1_SUCCESS` THEN the system SHALL store `analyst_output` in `SessionState.analystOutput`

2.3 WHEN the interview ends and `callAgent3()` is invoked from `InterviewScreen.tsx` THEN the system SHALL pass `state.analystOutput` as `analyst_output` in the `Agent3Request`

2.4 WHEN the interview ends and `callAgent3()` is invoked from `App.tsx` (feedback retry) THEN the system SHALL pass `state.analystOutput` as `analyst_output` in the `Agent3Request`

### Unchanged Behavior (Regression Prevention)

3.1 WHEN Agent 1 completes successfully THEN the system SHALL CONTINUE TO return `nova_sonic_context` and `competency_guides` in `Agent1Response`

3.2 WHEN `callAgent3()` is invoked THEN the system SHALL CONTINUE TO pass `transcript` and `competency_guides` in the `Agent3Request`

3.3 WHEN `analyst_output` is not available (undefined/null) THEN the system SHALL CONTINUE TO call the evaluator with an empty object fallback (existing `request.analyst_output || {}` behavior in `agent3Client.ts`)

3.4 WHEN the session is reset THEN the system SHALL CONTINUE TO clear all session state including the new `analystOutput` field
