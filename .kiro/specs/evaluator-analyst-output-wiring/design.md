# Evaluator Analyst Output Wiring Bugfix Design

## Overview

The evaluator (Agent 3) does not receive `analyst_output` from the frontend pipeline. Agent 1 computes `analyst_output` (containing `interview_plan`, competency analysis, etc.) in `agent1Client.ts` but discards it — only `nova_sonic_context` and `competency_guides` are returned in `Agent1Response`. The fix threads `analyst_output` through the session state so it reaches `callAgent3()` at evaluation time.

## Glossary

- **Bug_Condition (C)**: The condition where `callAgent3()` is invoked without `analyst_output` because it was never stored after Agent 1 completed
- **Property (P)**: `callAgent3()` receives `analyst_output` containing the full analyst data (interview_plan, competency analysis) when the evaluator is triggered
- **Preservation**: Existing pipeline behavior — `nova_sonic_context`, `competency_guides`, `transcript` continue to flow correctly; the `analyst_output || {}` fallback still handles null/undefined gracefully
- **`callAgent1()`**: The function in `frontend/src/services/agent1Client.ts` that orchestrates the pdf_parser → analyst → interviewer pipeline
- **`analystOutput`**: The full data object returned by the analyst Lambda, containing `interview_plan` and competency analysis
- **`SessionState`**: The centralized interview state managed by `sessionReducer`

## Bug Details

### Bug Condition

The bug manifests when the interview ends and the evaluator is triggered. `callAgent3()` builds a request body with `analyst_output: request.analyst_output || {}`, but `request.analyst_output` is always `undefined` because no caller passes it.

**Formal Specification:**
```
FUNCTION isBugCondition(input)
  INPUT: input of type { trigger: 'end_interview' | 'feedback_retry', state: SessionState }
  OUTPUT: boolean

  RETURN input.trigger IN ['end_interview', 'feedback_retry']
         AND state.analystOutput IS UNDEFINED
         AND analystLambdaReturnedData = TRUE
END FUNCTION
```

### Examples

- User uploads resume + JD → Agent 1 succeeds → interview ends → `callAgent3({ transcript, competency_guides })` — **missing** `analyst_output` (actual) vs. **should include** `analyst_output` (expected)
- User clicks "Retry" on feedback screen → `callAgent3({ transcript, competency_guides })` — **missing** `analyst_output` (actual) vs. **should include** `analyst_output` (expected)
- Agent 1 fails (no `analyst_output` available) → `callAgent3` with `analyst_output: undefined` → fallback `{}` used — this is **correct behavior** and must remain unchanged
- User resets session → `analystOutput` cleared to `null` — correct, no data leak between sessions

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- `Agent1Response` continues to include `nova_sonic_context` and `competency_guides`
- `callAgent3()` continues to receive `transcript` and `competency_guides`
- When `analyst_output` is `undefined` or `null`, `agent3Client.ts` continues to use the `request.analyst_output || {}` fallback
- Session `RESET` continues to clear all state back to `initialState`
- The `mapToCompetencyGuides()` function in `agent1Client.ts` continues to work unchanged

**Scope:**
All inputs that do NOT involve the `analyst_output` data path should be completely unaffected by this fix. This includes:
- WebSocket connection management
- Interview turn state transitions
- Transcript appending
- Timer ticking
- Practice mode toggling
- Input mode switching (voice/text)

## Hypothesized Root Cause

Based on the bug description, the issue is a straightforward data-flow omission across four layers:

1. **Missing return field in `callAgent1()`**: The `analystOutput` variable is computed on line 51 of `agent1Client.ts` but only used to derive `competencyGuides`. It is not included in the returned `Agent1Response` object.

2. **Missing type definition**: `Agent1Response` in `types/session.ts` only declares `nova_sonic_context` and `competency_guides` — no `analyst_output` field exists.

3. **Missing state storage**: `SessionState` has no `analystOutput` field, and `sessionReducer` does not save it from `AGENT1_SUCCESS` payload.

4. **Missing pass-through to Agent 3**: Both call sites (`InterviewScreen.tsx` and `App.tsx`) pass only `transcript` and `competency_guides` to `callAgent3()` — they never reference `state.analystOutput`.

## Correctness Properties

Property 1: Bug Condition - Analyst Output Reaches Evaluator

_For any_ invocation of `callAgent3()` where Agent 1 previously completed successfully and produced `analyst_output`, the request body SHALL contain `analyst_output` equal to the object returned by the analyst Lambda.

**Validates: Requirements 2.1, 2.2, 2.3, 2.4**

Property 2: Preservation - Existing Fields and Fallback Unchanged

_For any_ invocation of `callAgent3()` (whether `analyst_output` is present or not), the request body SHALL continue to contain `transcript`, `competency_guides`, and `interview_metadata` exactly as before, and when `analyst_output` is null/undefined the fallback `{}` SHALL still be used.

**Validates: Requirements 3.1, 3.2, 3.3, 3.4**

## Fix Implementation

### Changes Required

Assuming our root cause analysis is correct:

**File**: `frontend/src/types/session.ts`

**Changes**:
1. **Add `analyst_output` to `Agent1Response`**: Add optional field `analyst_output?: Record<string, unknown>` to the interface.
2. **Add `analystOutput` to `SessionState`**: Add field `analystOutput: Record<string, unknown> | null` to hold the analyst data.

```typescript
// In Agent1Response — add:
export interface Agent1Response {
  nova_sonic_context: string;
  competency_guides: CompetencyGuide[];
  analyst_output?: Record<string, unknown>;
}

// In SessionState — add:
export interface SessionState {
  // ... existing fields ...
  analystOutput: Record<string, unknown> | null;
}
```

---

**File**: `frontend/src/services/agent1Client.ts`

**Function**: `callAgent1`

**Changes**:
3. **Return `analyst_output` in the response object**: Include the `analystOutput` variable (already computed on line 51) in the return value.

```typescript
return {
  nova_sonic_context: novaSonicContext,
  competency_guides: competencyGuides,
  analyst_output: analystOutput,
};
```

---

**File**: `frontend/src/reducers/sessionReducer.ts`

**Changes**:
4. **Add `analystOutput: null` to `initialState`**: Ensures the new field is initialized and cleared on RESET.
5. **Save `analyst_output` in `AGENT1_SUCCESS` handler**: Store the payload's `analyst_output` in `state.analystOutput`.

```typescript
// In initialState — add:
analystOutput: null,

// In AGENT1_SUCCESS case — add:
case 'AGENT1_SUCCESS':
  return {
    ...state,
    agent1Ready: true,
    novaSonicContext: action.payload.nova_sonic_context,
    competencyGuides: action.payload.competency_guides,
    analystOutput: action.payload.analyst_output ?? null,
    error: null,
  };
```

---

**File**: `frontend/src/components/InterviewScreen.tsx`

**Function**: `triggerAgent3`

**Changes**:
6. **Pass `analyst_output: state.analystOutput` to `callAgent3`**: Thread the stored analyst output into the evaluator request.

```typescript
const result = await callAgent3({
  transcript: state.transcript,
  competency_guides: state.competencyGuides,
  analyst_output: state.analystOutput ?? undefined,
});
```

---

**File**: `frontend/src/App.tsx`

**Function**: `handleFeedbackRetry`

**Changes**:
7. **Pass `analyst_output: state.analystOutput` to `callAgent3`**: Same threading for the retry path.

```typescript
const result = await callAgent3({
  transcript: state.transcript,
  competency_guides: state.competencyGuides,
  analyst_output: state.analystOutput ?? undefined,
});
```

## Testing Strategy

### Validation Approach

The testing strategy follows a two-phase approach: first, surface counterexamples that demonstrate the bug on unfixed code, then verify the fix works correctly and preserves existing behavior.

### Exploratory Bug Condition Checking

**Goal**: Surface counterexamples that demonstrate the bug BEFORE implementing the fix. Confirm or refute the root cause analysis. If we refute, we will need to re-hypothesize.

**Test Plan**: Write unit tests that mock the Agent 1 pipeline and verify what `callAgent3()` receives when the interview ends. Run these tests on the UNFIXED code to observe failures.

**Test Cases**:
1. **Agent1 Response Shape Test**: Assert `callAgent1()` return value includes `analyst_output` (will fail on unfixed code)
2. **Reducer Storage Test**: Dispatch `AGENT1_SUCCESS` with `analyst_output` and assert `state.analystOutput` is set (will fail on unfixed code — field doesn't exist)
3. **InterviewScreen Agent3 Call Test**: Mock `callAgent3`, trigger end interview, assert it receives `analyst_output` (will fail on unfixed code)
4. **App Retry Agent3 Call Test**: Mock `callAgent3`, trigger retry, assert it receives `analyst_output` (will fail on unfixed code)

**Expected Counterexamples**:
- `callAgent1()` returns `{ nova_sonic_context, competency_guides }` without `analyst_output`
- `state.analystOutput` is `undefined` (field doesn't exist on `SessionState`)
- `callAgent3()` receives `{ transcript, competency_guides }` without `analyst_output`

### Fix Checking

**Goal**: Verify that for all inputs where the bug condition holds, the fixed function produces the expected behavior.

**Pseudocode:**
```
FOR ALL input WHERE isBugCondition(input) DO
  result := callAgent3_fixed(input)
  ASSERT result.requestBody.analyst_output == analystLambdaOutput
END FOR
```

### Preservation Checking

**Goal**: Verify that for all inputs where the bug condition does NOT hold, the fixed function produces the same result as the original function.

**Pseudocode:**
```
FOR ALL input WHERE NOT isBugCondition(input) DO
  ASSERT callAgent3_original(input).requestBody == callAgent3_fixed(input).requestBody
END FOR
```

**Testing Approach**: Property-based testing is recommended for preservation checking because:
- It generates many test cases automatically across the input domain
- It catches edge cases that manual unit tests might miss
- It provides strong guarantees that behavior is unchanged for all non-buggy inputs

**Test Plan**: Observe behavior on UNFIXED code first for non-analyst-output fields, then write property-based tests capturing that behavior.

**Test Cases**:
1. **Transcript Pass-Through Preservation**: Verify `transcript` continues to be passed to `callAgent3()` unchanged after fix
2. **Competency Guides Preservation**: Verify `competency_guides` continues to be passed to `callAgent3()` unchanged after fix
3. **Null Fallback Preservation**: Verify that when `analyst_output` is null/undefined, the evaluator request body uses `{}` as before
4. **Session Reset Preservation**: Verify RESET action clears `analystOutput` back to null along with all other state

### Unit Tests

- Test `callAgent1()` returns all three fields including `analyst_output`
- Test `sessionReducer` AGENT1_SUCCESS stores `analystOutput` in state
- Test `sessionReducer` RESET clears `analystOutput` to null
- Test InterviewScreen passes `analyst_output` to `callAgent3`
- Test App retry passes `analyst_output` to `callAgent3`

### Property-Based Tests

- Generate random analyst output objects and verify they survive the `callAgent1 → reducer → callAgent3` round-trip unchanged
- Generate random `Agent3Request` objects and verify `transcript` and `competency_guides` are never mutated by the presence of `analyst_output`
- Generate sessions where `analyst_output` is null/undefined and verify the `|| {}` fallback still applies

### Integration Tests

- Full pipeline test: upload → Agent 1 success → interview → end → verify evaluator request body contains `analyst_output`
- Retry path test: same flow but invoke retry and verify `analyst_output` still present
- Error recovery test: Agent 1 fails → no `analyst_output` → evaluator still called with `{}` fallback
