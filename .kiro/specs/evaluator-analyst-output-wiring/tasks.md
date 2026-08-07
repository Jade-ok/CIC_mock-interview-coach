# Implementation Plan

- [x] 1. Write bug condition exploration test
  - **Property 1: Bug Condition** - Analyst Output Missing from Agent3 Request
  - **CRITICAL**: This test MUST FAIL on unfixed code - failure confirms the bug exists
  - **DO NOT attempt to fix the test or the code when it fails**
  - **NOTE**: This test encodes the expected behavior - it will validate the fix when it passes after implementation
  - **GOAL**: Surface counterexamples that demonstrate the bug exists
  - **Scoped PBT Approach**: Scope the property to the concrete data flow: Agent 1 returns analyst_output → reducer stores it → callAgent3 receives it
  - Test that `callAgent1()` return value includes `analyst_output` field (will fail — field not returned)
  - Test that dispatching `AGENT1_SUCCESS` with `analyst_output` stores it in `state.analystOutput` (will fail — field doesn't exist on SessionState)
  - Test that `callAgent3()` is invoked with `analyst_output` when interview ends (will fail — never passed)
  - Test that `callAgent3()` is invoked with `analyst_output` on feedback retry (will fail — never passed)
  - Run tests on UNFIXED code
  - **EXPECTED OUTCOME**: Tests FAIL (this is correct - it proves the bug exists at each layer)
  - Document counterexamples: `callAgent1()` returns `{ nova_sonic_context, competency_guides }` without `analyst_output`; `state.analystOutput` is undefined; `callAgent3()` receives `{ transcript, competency_guides }` without `analyst_output`
  - Mark task complete when tests are written, run, and failures are documented
  - _Requirements: 1.1, 1.2, 1.3, 1.4_

- [x] 2. Write preservation property tests (BEFORE implementing fix)
  - **Property 2: Preservation** - Existing Fields and Fallback Unchanged
  - **IMPORTANT**: Follow observation-first methodology
  - Observe on UNFIXED code: `callAgent1()` returns `{ nova_sonic_context, competency_guides }` correctly
  - Observe on UNFIXED code: `callAgent3()` receives `transcript` and `competency_guides` unchanged
  - Observe on UNFIXED code: when `analyst_output` is undefined, `agent3Client.ts` uses `request.analyst_output || {}` fallback
  - Observe on UNFIXED code: `RESET` action returns state to `initialState`
  - Write property-based tests: for all valid Agent1Response payloads, `nova_sonic_context` and `competency_guides` are stored correctly in state
  - Write property-based tests: for all valid transcript/competency_guides combinations, `callAgent3()` always includes both fields in request body
  - Write property-based tests: for all inputs where `analyst_output` is null/undefined, the evaluator request body uses `{}` as fallback
  - Write property-based tests: RESET always clears all state back to initialState (including future `analystOutput` field)
  - Verify all tests PASS on UNFIXED code
  - **EXPECTED OUTCOME**: Tests PASS (this confirms baseline behavior to preserve)
  - Mark task complete when tests are written, run, and passing on unfixed code
  - _Requirements: 3.1, 3.2, 3.3, 3.4_

- [x] 3. Fix for analyst_output not reaching evaluator

  - [x] 3.1 Update `types/session.ts` — add `analyst_output` to `Agent1Response` and `analystOutput` to `SessionState`
    - Add `analyst_output?: Record<string, unknown>` to `Agent1Response` interface
    - Add `analystOutput: Record<string, unknown> | null` to `SessionState` interface
    - _Bug_Condition: isBugCondition(input) where Agent1 succeeded but state.analystOutput is undefined_
    - _Expected_Behavior: Agent1Response includes analyst_output; SessionState stores it_
    - _Preservation: nova_sonic_context, competency_guides fields remain unchanged_
    - _Requirements: 2.1, 2.2_

  - [x] 3.2 Update `sessionReducer.ts` — add `analystOutput: null` to `initialState` and save in `AGENT1_SUCCESS`
    - Add `analystOutput: null` to `initialState` object
    - In `AGENT1_SUCCESS` case, add `analystOutput: action.payload.analyst_output ?? null`
    - Verify `RESET` returns to `initialState` (already does via `return initialState` — new field included automatically)
    - _Bug_Condition: AGENT1_SUCCESS dispatched but analystOutput not stored_
    - _Expected_Behavior: state.analystOutput equals action.payload.analyst_output after AGENT1_SUCCESS_
    - _Preservation: agent1Ready, novaSonicContext, competencyGuides still set correctly; RESET clears all state_
    - _Requirements: 2.2, 3.4_

  - [x] 3.3 Update `agent1Client.ts` — include `analyst_output` in return value
    - Add `analyst_output: analystOutput` to the return object in `callAgent1()`
    - The `analystOutput` variable already exists (line 51) — just include it in the return
    - _Bug_Condition: callAgent1() discards analystOutput by not returning it_
    - _Expected_Behavior: callAgent1() return value includes analyst_output equal to analystResult.data_
    - _Preservation: nova_sonic_context and competency_guides continue to be returned unchanged_
    - _Requirements: 2.1, 3.1_

  - [x] 3.4 Update `InterviewScreen.tsx` — pass `analyst_output` to `callAgent3` in `triggerAgent3`
    - In `triggerAgent3` callback, add `analyst_output: state.analystOutput ?? undefined` to the `callAgent3()` argument
    - _Bug_Condition: triggerAgent3 invokes callAgent3 without analyst_output_
    - _Expected_Behavior: callAgent3 receives analyst_output from state.analystOutput_
    - _Preservation: transcript and competency_guides still passed unchanged_
    - _Requirements: 2.3, 3.2_

  - [x] 3.5 Update `App.tsx` — pass `analyst_output` to `callAgent3` in `handleFeedbackRetry`
    - In `handleFeedbackRetry` callback, add `analyst_output: state.analystOutput ?? undefined` to the `callAgent3()` argument
    - _Bug_Condition: handleFeedbackRetry invokes callAgent3 without analyst_output_
    - _Expected_Behavior: callAgent3 receives analyst_output from state.analystOutput_
    - _Preservation: transcript and competency_guides still passed unchanged_
    - _Requirements: 2.4, 3.2_

  - [x] 3.6 Update tests — sessionReducer tests at minimum
    - Add test: `AGENT1_SUCCESS` stores `analystOutput` in state when `analyst_output` is present in payload
    - Add test: `AGENT1_SUCCESS` stores `null` when `analyst_output` is undefined in payload
    - Add test: `RESET` clears `analystOutput` to null
    - Add test: `initialState` has `analystOutput: null`
    - _Requirements: 2.2, 3.4_

  - [x] 3.7 Verify bug condition exploration test now passes
    - **Property 1: Expected Behavior** - Analyst Output Reaches Evaluator
    - **IMPORTANT**: Re-run the SAME test from task 1 - do NOT write a new test
    - The test from task 1 encodes the expected behavior
    - When this test passes, it confirms the expected behavior is satisfied
    - Run bug condition exploration test from step 1
    - **EXPECTED OUTCOME**: Test PASSES (confirms bug is fixed)
    - _Requirements: 2.1, 2.2, 2.3, 2.4_

  - [x] 3.8 Verify preservation tests still pass
    - **Property 2: Preservation** - Existing Fields and Fallback Unchanged
    - **IMPORTANT**: Re-run the SAME tests from task 2 - do NOT write new tests
    - Run preservation property tests from step 2
    - **EXPECTED OUTCOME**: Tests PASS (confirms no regressions)
    - Confirm all tests still pass after fix (no regressions)

- [x] 4. Checkpoint - Ensure all tests pass
  - Run full test suite to ensure no regressions
  - Verify TypeScript compilation succeeds with no type errors
  - Ensure all tests pass, ask the user if questions arise.
