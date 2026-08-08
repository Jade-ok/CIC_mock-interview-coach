/**
 * Property-Based Test for Property 14: end_interview tool auto-end flow.
 *
 * **Validates: Requirements 4.1, 4.7**
 *
 * Property 14: For any `tool_use` event with `toolName === "end_interview"`,
 * after current audio playback completes, the interview session should auto-end
 * and transition to the feedback phase.
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { sessionReducer, initialState } from '@/reducers/sessionReducer';
import type { SessionState, SessionAction } from '@/types/session';
import type { EvaluatorOutput } from '@/types/evaluator';

const evaluatorOutput: EvaluatorOutput = {
  per_question_scores: [],
  overall_scores: {
    dimensions: {
      concrete_example: 3,
      situation_action_result: 3,
      link_to_job: 3,
      quantifiable_outcome: 3,
    },
    total: 3,
  },
  question_count: 0,
  readiness_label: 'Developing well',
  strengths: [],
  improvements: [],
  keywords_covered: [],
  keywords_not_covered: [],
  contextual_advice: [],
  interview_metadata: {
    candidate_level: 'student_intern',
    target_role: 'Software Engineer Intern',
    status: 'ended_early',
    completion_reason: 'user_ended_early',
    main_questions_completed: 0,
    follow_ups_completed: 0,
    ended_early: true,
  },
};

describe('Property 14: end_interview tool → auto end → feedback transition', () => {
  it('END_INTERVIEW with reason auto always transitions to feedback phase from interview', () => {
    /**
     * Property: For any interview state (with arbitrary transcript, elapsed time, turn state),
     * dispatching END_INTERVIEW with reason 'auto' should always transition phase to 'feedback'.
     */
    fc.assert(
      fc.property(
        // Generate arbitrary transcript entries
        fc.array(
          fc.record({
            role: fc.constantFrom('interviewer' as const, 'user' as const),
            text: fc.string({ minLength: 1, maxLength: 200 }),
            timestamp: fc.date().map((d) => d.toISOString()),
          }),
          { minLength: 0, maxLength: 20 }
        ),
        // Generate arbitrary elapsed seconds
        fc.nat({ max: 3600 }),
        // Generate arbitrary turn state
        fc.constantFrom('ai_speaking' as const, 'user_turn' as const, 'idle' as const),
        (transcript, elapsedSeconds, turnState) => {
          // Setup: state is in interview phase with some transcript
          const interviewState: SessionState = {
            ...initialState,
            phase: 'interview',
            turnState,
            transcript,
            elapsedSeconds,
            wsConnectionState: 'connected',
            agent1Ready: true,
            wsReady: true,
          };

          // Action: dispatch END_INTERVIEW with reason 'auto'
          const action: SessionAction = { type: 'END_INTERVIEW', payload: { reason: 'auto' } };
          const nextState = sessionReducer(interviewState, action);

          // Property: phase must be 'feedback'
          expect(nextState.phase).toBe('feedback');
          // Property: transcript is preserved (not cleared)
          expect(nextState.transcript).toEqual(transcript);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('AGENT3_LOADING sets loading flag, AGENT3_SUCCESS stores result, AGENT3_FAILED stores error', () => {
    /**
     * Property: The Agent 3 lifecycle actions correctly update the feedback state
     * regardless of what transcript/feedbackResult existed before.
     */
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 100 }),
        (errorMessage) => {
          const feedbackState: SessionState = {
            ...initialState,
            phase: 'feedback',
          };

          // AGENT3_LOADING → sets loading, clears error
          const loadingState = sessionReducer(feedbackState, { type: 'AGENT3_LOADING' });
          expect(loadingState.agent3Loading).toBe(true);
          expect(loadingState.error).toBeNull();

          // AGENT3_SUCCESS → stores result, clears loading
          const successState = sessionReducer(loadingState, {
            type: 'AGENT3_SUCCESS',
            payload: evaluatorOutput,
          });
          expect(successState.agent3Loading).toBe(false);
          expect(successState.feedbackResult).toEqual(evaluatorOutput);

          // AGENT3_FAILED → stores error, clears loading
          const failedState = sessionReducer(loadingState, {
            type: 'AGENT3_FAILED',
            payload: { message: errorMessage },
          });
          expect(failedState.agent3Loading).toBe(false);
          expect(failedState.error).not.toBeNull();
          expect(failedState.error!.code).toBe('AGENT3_FAILED');
          expect(failedState.error!.message).toBe(errorMessage);
          expect(failedState.error!.retryable).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });
});
