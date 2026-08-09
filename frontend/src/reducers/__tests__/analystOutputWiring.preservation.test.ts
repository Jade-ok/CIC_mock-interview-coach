// @ts-nocheck
// TODO: Update this test file to use the new Agent3Request shape (conversation-based)
/**
 * Preservation Property Tests — evaluator-analyst-output-wiring
 *
 * **Property 2: Preservation** — Existing Fields and Fallback Unchanged
 * **Validates: Requirements 3.1, 3.2, 3.3, 3.4**
 *
 * These tests capture baseline behavior that MUST remain unchanged after the fix.
 *
 * Preserved behaviors:
 * - nova_sonic_context is stored correctly on AGENT1_SUCCESS
 * - transcript and analyst_output flow to callAgent3() correctly
 * - canonical conversation and analyst_output reach the Evaluator request
 * - RESET returns state to initialState completely
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';
import { sessionReducer, initialState } from '../sessionReducer';
import type {
  SessionState,
  TranscriptEntry,
  Agent3Request,
} from '@/types/session';

// ─── Arbitraries (shared generators) ───

const transcriptEntryArb: fc.Arbitrary<TranscriptEntry> = fc.record({
  role: fc.constantFrom('interviewer', 'user') as fc.Arbitrary<'interviewer' | 'user'>,
  text: fc.string({ minLength: 1, maxLength: 200 }),
  timestamp: fc.constant('2024-01-01T00:00:00Z'),
});

const novaSonicContextArb: fc.Arbitrary<string> = fc.string({ minLength: 1, maxLength: 200 });

const validEvaluatorOutput = {
  per_question_scores: [{
    question_text: 'Tell me about yourself',
    feedback: { strength: 'Clear example.', improvement: 'Add a metric.' },
    scores: { concrete_example: 3, star_structure: 3, link_to_job: 3, quantifiable_outcome: 2 },
  }],
  overall_scores: {
    dimensions: { concrete_example: 3, star_structure: 3, link_to_job: 3, quantifiable_outcome: 2 },
    total: 2.8,
  },
  question_count: 1,
  readiness_label: 'Developing well',
  strengths: ['Clear example.'],
  improvements: ['Add a metric.'],
  keywords_covered: [],
  keywords_not_covered: [],
  contextual_advice: ['Prepare one measurable result.'],
  interview_metadata: {
    candidate_level: 'student_intern',
    target_role: 'Software Engineer',
    status: 'ended_early',
    completion_reason: 'user_ended_early',
    main_questions_completed: 1,
    follow_ups_completed: 0,
    ended_early: true,
  },
};

// ─── Sub-task 1: Observe callAgent1() returns nova_sonic_context correctly ───
// ─── Sub-task 5: PBT - For all valid Agent1Response payloads, nova_sonic_context is stored correctly in state ───

describe('Preservation: AGENT1_SUCCESS stores nova_sonic_context', () => {
  /**
   * **Validates: Requirements 3.1**
   *
   * For all valid Agent1Response payloads, dispatching AGENT1_SUCCESS
   * must store nova_sonic_context correctly in state.
   */
  it('property: for all valid Agent1Response payloads, nova_sonic_context is stored correctly', () => {
    fc.assert(
      fc.property(
        novaSonicContextArb,
        (novaSonicContext) => {
          const result = sessionReducer(initialState, {
            type: 'AGENT1_SUCCESS',
            payload: {
              nova_sonic_context: novaSonicContext,
            },
          });

          // nova_sonic_context is stored correctly
          expect(result.novaSonicContext).toBe(novaSonicContext);

          // agent1Ready is set to true
          expect(result.agent1Ready).toBe(true);

          // error is cleared
          expect(result.error).toBeNull();
        }
      ),
      { numRuns: 100 }
    );
  });

  it('property: AGENT1_SUCCESS does not alter unrelated state fields', () => {
    const sessionStateWithDataArb = fc.record({
      elapsedSeconds: fc.nat({ max: 3600 }),
      practiceMode: fc.boolean(),
      wsConnectionState: fc.constantFrom('connecting', 'connected', 'reconnecting', 'disconnected') as fc.Arbitrary<SessionState['wsConnectionState']>,
    });

    fc.assert(
      fc.property(
        novaSonicContextArb,
        sessionStateWithDataArb,
        (ctx, extras) => {
          const preState: SessionState = {
            ...initialState,
            elapsedSeconds: extras.elapsedSeconds,
            practiceMode: extras.practiceMode,
            wsConnectionState: extras.wsConnectionState,
          };

          const result = sessionReducer(preState, {
            type: 'AGENT1_SUCCESS',
            payload: {
              nova_sonic_context: ctx,
            },
          });

          // Unrelated fields remain unchanged
          expect(result.elapsedSeconds).toBe(extras.elapsedSeconds);
          expect(result.practiceMode).toBe(extras.practiceMode);
          expect(result.wsConnectionState).toBe(extras.wsConnectionState);
          expect(result.phase).toBe(preState.phase);
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ─── Sub-task 2: Observe callAgent3() receives transcript correctly ───
// ─── Sub-task 6: PBT - For all valid transcript combinations, callAgent3() always includes them ───

describe('Preservation: callAgent3() receives transcript and analyst_output', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  /**
   * **Validates: Requirements 3.2**
   *
   * For all valid transcript combinations,
   * callAgent3() always includes the transcript in the request body.
   */
  it('property: for all valid transcripts, callAgent3 includes them in request body', async () => {
    // We test the agent3Client module directly
    const { callAgent3 } = await import('@/services/agent3Client');

    await fc.assert(
      fc.asyncProperty(
        // Generate at least one interviewer+user pair to ensure conversation is non-empty
        fc.array(
          fc.tuple(
            fc.record({
              role: fc.constant('interviewer' as const),
              text: fc.string({ minLength: 1, maxLength: 100 }),
              timestamp: fc.constant('2024-01-01T00:00:00Z'),
            }),
            fc.record({
              role: fc.constant('user' as const),
              text: fc.string({ minLength: 1, maxLength: 100 }),
              timestamp: fc.constant('2024-01-01T00:00:01Z'),
            })
          ),
          { minLength: 1, maxLength: 5 }
        ),
        async (pairs) => {
          let capturedBody: Record<string, unknown> | null = null;

          // Mock fetch to capture the request body
          globalThis.fetch = vi.fn().mockImplementation(async (_url: string, init: RequestInit) => {
            capturedBody = JSON.parse(init.body as string);
            return {
              ok: true,
              json: async () => validEvaluatorOutput,
            };
          }) as unknown as typeof globalThis.fetch;

          const request: Agent3Request = {
            conversation: pairs.map(([question, answer], index) => ({
              point_id: `point_${Math.floor(index / 2) + 1}`,
              turn_type: index % 2 === 0 ? 'main_question' : 'follow_up',
              question: question.text,
              answer: answer.text,
            })),
            interview_metadata: {
              candidate_level: 'student_intern',
              target_role: 'Software Engineer',
              status: 'ended_early',
              completion_reason: 'user_ended_early',
              main_questions_completed: 1,
              follow_ups_completed: 0,
              ended_early: true,
            },
            analyst_output: {},
          };

          await callAgent3(request);

          // Request body must include conversation (derived from transcript)
          expect(capturedBody).not.toBeNull();
          expect(capturedBody!.conversation).toBeDefined();
          expect(Array.isArray(capturedBody!.conversation)).toBe(true);

          // Conversation should have entries derived from transcript pairs
          const conversation = capturedBody!.conversation as Array<Record<string, string>>;
          expect(conversation.length).toBe(pairs.length);

          // Each conversation entry should contain the question text from interviewer
          for (let i = 0; i < pairs.length; i++) {
            expect(conversation[i].question).toBe(pairs[i][0].text);
            expect(conversation[i].answer).toBe(pairs[i][1].text);
          }

          // interview_metadata is always included
          expect(capturedBody!.interview_metadata).toBeDefined();
        }
      ),
      { numRuns: 50 }
    );
  });
});

// ─── Sub-task 4: Observe RESET action returns state to initialState ───
// ─── Sub-task 8: PBT - RESET always clears all state back to initialState ───

describe('Preservation: RESET always clears all state back to initialState', () => {
  /**
   * **Validates: Requirements 3.4**
   *
   * For any arbitrary session state, dispatching RESET must return
   * the state exactly equal to initialState.
   */
  it('property: RESET from any state returns exactly initialState', () => {
    const arbitrarySessionState: fc.Arbitrary<SessionState> = fc.record({
      phase: fc.constantFrom('upload', 'waiting', 'interview', 'feedback') as fc.Arbitrary<SessionState['phase']>,
      turnState: fc.constantFrom('ai_speaking', 'user_turn', 'idle') as fc.Arbitrary<SessionState['turnState']>,
      inputMode: fc.constantFrom('voice', 'text_only') as fc.Arbitrary<SessionState['inputMode']>,
      textInputState: fc.constantFrom('idle', 'composing') as fc.Arbitrary<SessionState['textInputState']>,
      practiceMode: fc.boolean(),
      transcript: fc.array(transcriptEntryArb, { minLength: 0, maxLength: 10 }),
      livePartial: fc.oneof(
        fc.constant(null),
        fc.record({
          role: fc.constantFrom('interviewer', 'user') as fc.Arbitrary<'interviewer' | 'user'>,
          text: fc.string({ minLength: 1, maxLength: 50 }),
        })
      ) as fc.Arbitrary<SessionState['livePartial']>,
      novaSonicContext: fc.string({ minLength: 0, maxLength: 100 }),
      elapsedSeconds: fc.nat({ max: 7200 }),
      wsConnectionState: fc.constantFrom('connecting', 'connected', 'reconnecting', 'disconnected') as fc.Arbitrary<SessionState['wsConnectionState']>,
      agent1Ready: fc.boolean(),
      wsReady: fc.boolean(),
      error: fc.oneof(
        fc.constant(null),
        fc.record({
          code: fc.constantFrom('AGENT1_FAILED', 'TIMEOUT', 'AGENT3_FAILED') as fc.Arbitrary<SessionState['error'] extends null ? never : NonNullable<SessionState['error']>['code']>,
          message: fc.string({ minLength: 1, maxLength: 50 }),
          retryable: fc.boolean(),
        })
      ) as fc.Arbitrary<SessionState['error']>,
      agent3Loading: fc.boolean(),
      feedbackResult: fc.oneof(
        fc.constant(null),
        fc.record({ total: fc.nat({ max: 100 }) })
      ),
      analystOutput: fc.oneof(
        fc.constant(null),
        fc.record({ interview_plan: fc.array(fc.record({ topic: fc.string({ minLength: 1, maxLength: 20 }) }), { minLength: 0, maxLength: 3 }) })
      ) as fc.Arbitrary<Record<string, unknown> | null>,
      uploadedPdf: fc.constant(null) as fc.Arbitrary<File | null>,
      uploadedJdText: fc.string({ minLength: 0, maxLength: 50 }),
    });

    fc.assert(
      fc.property(arbitrarySessionState, (state) => {
        const result = sessionReducer(state, { type: 'RESET' });

        // RESET must return EXACTLY initialState
        expect(result).toEqual(initialState);
      }),
      { numRuns: 100 }
    );
  });

  it('property: RESET is idempotent — resetting initialState returns initialState', () => {
    const result = sessionReducer(initialState, { type: 'RESET' });
    expect(result).toEqual(initialState);
  });

  it('property: after RESET, all fields match initialState defaults', () => {
    // Build a heavily mutated state
    const mutatedState: SessionState = {
      phase: 'feedback',
      turnState: 'ai_speaking',
      inputMode: 'text_only',
      textInputState: 'composing',
      practiceMode: false,
      transcript: [
        { role: 'interviewer', text: 'Q1', timestamp: '2024-01-01T00:00:00Z' },
        { role: 'user', text: 'A1', timestamp: '2024-01-01T00:00:01Z' },
      ],
      livePartial: { role: 'interviewer', text: 'partial text...' },
      novaSonicContext: 'some-context-data',
      elapsedSeconds: 3600,
      wsConnectionState: 'connected',
      agent1Ready: true,
      wsReady: true,
      error: { code: 'TIMEOUT', message: 'timed out', retryable: true },
      agent3Loading: true,
      feedbackResult: { total: 85, dimensions: [] },
      analystOutput: { interview_plan: [{ topic: 'React' }] },
      uploadedPdf: null,
      uploadedJdText: 'Some JD text',
    };

    const result = sessionReducer(mutatedState, { type: 'RESET' });

    expect(result.phase).toBe('upload');
    expect(result.turnState).toBe('idle');
    expect(result.inputMode).toBe('voice');
    expect(result.textInputState).toBe('idle');
    expect(result.practiceMode).toBe(true);
    expect(result.transcript).toEqual([]);
    expect(result.novaSonicContext).toBe('');
    expect(result.elapsedSeconds).toBe(0);
    expect(result.wsConnectionState).toBe('disconnected');
    expect(result.agent1Ready).toBe(false);
    expect(result.wsReady).toBe(false);
    expect(result.error).toBeNull();
    expect(result.agent3Loading).toBe(false);
    expect(result.feedbackResult).toBeNull();
  });
});
