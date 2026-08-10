import { describe, it, expect, vi } from 'vitest';
import * as fc from 'fast-check';
import {
  sessionReducer,
  initialState,
  maybeStartSession,
  type WebSocketClient,
} from '../sessionReducer';
import type {
  SessionState,
  SessionAction,
  TranscriptEntry,
} from '@/types/session';
import type { EvaluatorOutput } from '@/types/evaluator';

const evaluatorOutput: EvaluatorOutput = {
  per_question_scores: [],
  overall_scores: {
    dimensions: {
      concrete_example: 3,
      star_structure: 3,
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

// ---------- Unit Tests ----------

describe('sessionReducer', () => {
  describe('SUBMIT_UPLOAD', () => {
    it('sets phase to waiting and clears error', () => {
      const stateWithError: SessionState = {
        ...initialState,
        error: { code: 'TIMEOUT', message: 'timeout', retryable: true },
      };
      const result = sessionReducer(stateWithError, {
        type: 'SUBMIT_UPLOAD',
        payload: { pdf: new File([], 'test.pdf'), jdText: 'jd' },
      });
      expect(result.phase).toBe('waiting');
      expect(result.error).toBeNull();
    });
  });

  describe('SESSION_TOKEN_READY', () => {
    it('stores the opaque token in active session state', () => {
      const result = sessionReducer(initialState, {
        type: 'SESSION_TOKEN_READY',
        payload: { sessionToken: 'opaque-token' },
      });
      expect(result.hostedSessionToken).toBe('opaque-token');
      expect(result.error).toBeNull();
    });
  });

  describe('AGENT1_SUCCESS', () => {
    it('stores nova_sonic_context and sets agent1Ready', () => {
      const result = sessionReducer(initialState, {
        type: 'AGENT1_SUCCESS',
        payload: {
          nova_sonic_context: 'ctx',
        },
      });
      expect(result.agent1Ready).toBe(true);
      expect(result.novaSonicContext).toBe('ctx');
    });
  });

  describe('AGENT1_FAILED', () => {
    it('sets error with AGENT1_FAILED code', () => {
      const result = sessionReducer(initialState, {
        type: 'AGENT1_FAILED',
        payload: { message: 'failed' },
      });
      expect(result.error?.code).toBe('AGENT1_FAILED');
      expect(result.error?.retryable).toBe(true);
    });
  });

  it('preserves a non-retryable voice-session failure', () => {
    const result = sessionReducer(initialState, {
      type: 'WS_CONNECT_FAILED',
      payload: { message: 'Interview session expired.', retryable: false },
    });

    expect(result.error).toEqual({
      code: 'WS_CONNECT_FAILED',
      message: 'Interview session expired.',
      retryable: false,
    });
  });

  describe('WS_CONNECTED', () => {
    it('sets wsConnectionState to connected', () => {
      const result = sessionReducer(initialState, { type: 'WS_CONNECTED' });
      expect(result.wsConnectionState).toBe('connected');
    });
  });

  describe('SESSION_START_ACKED', () => {
    it('sets wsReady to true', () => {
      const result = sessionReducer(initialState, { type: 'SESSION_START_ACKED' });
      expect(result.wsReady).toBe(true);
    });
  });

  describe('WS_DISCONNECTED', () => {
    it('sets wsConnectionState to reconnecting during interview', () => {
      const interviewState: SessionState = { ...initialState, phase: 'interview' };
      const result = sessionReducer(interviewState, {
        type: 'WS_DISCONNECTED',
        payload: { reason: 'network' },
      });
      expect(result.wsConnectionState).toBe('reconnecting');
    });

    it('sets wsConnectionState to disconnected when not in interview', () => {
      const result = sessionReducer(initialState, {
        type: 'WS_DISCONNECTED',
        payload: { reason: 'network' },
      });
      expect(result.wsConnectionState).toBe('disconnected');
    });

    it('preserves a voice-service failure reason for the user', () => {
      const state: SessionState = {
        ...initialState,
        phase: 'interview',
        wsReady: true,
        wsConnectionState: 'connected',
      };
      const result = sessionReducer(state, {
        type: 'WS_SESSION_INVALID',
        payload: { message: 'The voice interview could not start.' },
      });
      expect(result.error?.message).toBe('The voice interview could not start.');
      expect(result.error?.retryable).toBe(false);
    });
  });

  describe('WS_RECONNECT_SUCCESS', () => {
    it('sets wsConnectionState to connected', () => {
      const state: SessionState = { ...initialState, wsConnectionState: 'reconnecting' };
      const result = sessionReducer(state, { type: 'WS_RECONNECT_SUCCESS' });
      expect(result.wsConnectionState).toBe('connected');
    });
  });

  describe('WS_RECONNECT_FAILED', () => {
    it('sets error and resets phase to upload', () => {
      const state: SessionState = { ...initialState, phase: 'interview', wsConnectionState: 'reconnecting' };
      const result = sessionReducer(state, { type: 'WS_RECONNECT_FAILED' });
      expect(result.error?.code).toBe('WS_RECONNECT_FAILED');
      expect(result.phase).toBe('upload');
      expect(result.wsConnectionState).toBe('disconnected');
    });
  });

  describe('WS_SESSION_INVALID', () => {
    it('returns to waiting with a disconnected, invalid-session error', () => {
      const state: SessionState = {
        ...initialState,
        phase: 'interview',
        wsReady: true,
        wsConnectionState: 'connected',
      };
      const result = sessionReducer(state, { type: 'WS_SESSION_INVALID' });
      expect(result.error?.code).toBe('WS_SESSION_INVALID');
      expect(result.phase).toBe('waiting');
      expect(result.wsReady).toBe(false);
      expect(result.wsConnectionState).toBe('disconnected');
    });
  });

  describe('INTERVIEW_READY', () => {
    it('sets phase to interview and practiceMode to true', () => {
      const state: SessionState = { ...initialState, phase: 'waiting', practiceMode: false };
      const result = sessionReducer(state, { type: 'INTERVIEW_READY' });
      expect(result.phase).toBe('interview');
      expect(result.practiceMode).toBe(true);
    });
  });

  describe('AI_SPEAKING', () => {
    it('sets turnState to ai_speaking', () => {
      const result = sessionReducer(initialState, { type: 'AI_SPEAKING' });
      expect(result.turnState).toBe('ai_speaking');
    });
  });

  describe('USER_TURN', () => {
    it('sets turnState to user_turn', () => {
      const result = sessionReducer(initialState, { type: 'USER_TURN' });
      expect(result.turnState).toBe('user_turn');
    });
  });

  describe('BARGE_IN', () => {
    it('sets turnState to user_turn', () => {
      const state: SessionState = { ...initialState, turnState: 'ai_speaking' };
      const result = sessionReducer(state, { type: 'BARGE_IN' });
      expect(result.turnState).toBe('user_turn');
    });
  });

  describe('APPEND_TRANSCRIPT', () => {
    it('appends entry to transcript array', () => {
      const entry: TranscriptEntry = { role: 'interviewer', text: 'Hello', timestamp: '2024-01-01T00:00:00Z' };
      const result = sessionReducer(initialState, {
        type: 'APPEND_TRANSCRIPT',
        payload: entry,
      });
      expect(result.transcript).toHaveLength(1);
      expect(result.transcript[0]).toEqual(entry);
    });

    it('appends multiple entries in order', () => {
      const entry1: TranscriptEntry = { role: 'interviewer', text: 'Q1', timestamp: '2024-01-01T00:00:01Z' };
      const entry2: TranscriptEntry = { role: 'user', text: 'A1', timestamp: '2024-01-01T00:00:02Z' };

      let state = sessionReducer(initialState, { type: 'APPEND_TRANSCRIPT', payload: entry1 });
      state = sessionReducer(state, { type: 'APPEND_TRANSCRIPT', payload: entry2 });

      expect(state.transcript).toHaveLength(2);
      expect(state.transcript[0]).toEqual(entry1);
      expect(state.transcript[1]).toEqual(entry2);
    });
  });

  describe('TOGGLE_PRACTICE_MODE', () => {
    it('toggles practiceMode from true to false', () => {
      const state: SessionState = { ...initialState, practiceMode: true };
      const result = sessionReducer(state, { type: 'TOGGLE_PRACTICE_MODE' });
      expect(result.practiceMode).toBe(false);
    });

    it('toggles practiceMode from false to true', () => {
      const state: SessionState = { ...initialState, practiceMode: false };
      const result = sessionReducer(state, { type: 'TOGGLE_PRACTICE_MODE' });
      expect(result.practiceMode).toBe(true);
    });
  });

  describe('TEXT_INPUT_START', () => {
    it('sets textInputState to composing', () => {
      const result = sessionReducer(initialState, { type: 'TEXT_INPUT_START' });
      expect(result.textInputState).toBe('composing');
    });
  });

  describe('TEXT_INPUT_CLEAR', () => {
    it('sets textInputState to idle', () => {
      const state: SessionState = { ...initialState, textInputState: 'composing' };
      const result = sessionReducer(state, { type: 'TEXT_INPUT_CLEAR' });
      expect(result.textInputState).toBe('idle');
    });
  });

  describe('END_INTERVIEW', () => {
    it('sets phase to feedback', () => {
      const state: SessionState = { ...initialState, phase: 'interview' };
      const result = sessionReducer(state, { type: 'END_INTERVIEW', payload: { reason: 'manual' } });
      expect(result.phase).toBe('feedback');
    });
  });

  describe('AGENT3_LOADING', () => {
    it('returns state unchanged (feedback phase maintained)', () => {
      const state: SessionState = { ...initialState, phase: 'feedback' };
      const result = sessionReducer(state, { type: 'AGENT3_LOADING' });
      expect(result.phase).toBe('feedback');
    });
  });

  describe('AGENT3_SUCCESS', () => {
    it('returns state (feedback result stored externally)', () => {
      const state: SessionState = { ...initialState, phase: 'feedback' };
      const result = sessionReducer(state, { type: 'AGENT3_SUCCESS', payload: evaluatorOutput });
      expect(result.phase).toBe('feedback');
    });
  });

  describe('AGENT3_FAILED', () => {
    it('sets error with AGENT3_FAILED code', () => {
      const result = sessionReducer(initialState, {
        type: 'AGENT3_FAILED',
        payload: { message: 'eval failed' },
      });
      expect(result.error?.code).toBe('AGENT3_FAILED');
      expect(result.error?.retryable).toBe(true);
    });
  });

  describe('TIMEOUT', () => {
    it('sets error with TIMEOUT code', () => {
      const result = sessionReducer(initialState, { type: 'TIMEOUT' });
      expect(result.error?.code).toBe('TIMEOUT');
      expect(result.error?.retryable).toBe(true);
    });
  });

  describe('TICK', () => {
    it('increments elapsedSeconds by 1', () => {
      const state: SessionState = { ...initialState, elapsedSeconds: 5 };
      const result = sessionReducer(state, { type: 'TICK' });
      expect(result.elapsedSeconds).toBe(6);
    });
  });

  describe('RESET', () => {
    it('returns to initialState', () => {
      const modifiedState: SessionState = {
        ...initialState,
        phase: 'interview',
        transcript: [{ role: 'user', text: 'hi', timestamp: '2024-01-01T00:00:00Z' }],
        elapsedSeconds: 120,
        practiceMode: false,
      };
      const result = sessionReducer(modifiedState, { type: 'RESET' });
      expect(result).toEqual(initialState);
    });
  });

  describe('RETRY_INTERVIEW', () => {
    it('preserves analysis but clears admission so a new interview is counted', () => {
      const result = sessionReducer({
        ...initialState,
        phase: 'feedback',
        uploadData: { pdf: new File([], 'test.pdf'), jdText: 'job' },
        hostedSessionToken: 'old-token',
        analystOutput: { candidate_profile: {} },
        novaSonicContext: 'context',
        agent1Ready: true,
      }, { type: 'RETRY_INTERVIEW' });

      expect(result.phase).toBe('waiting');
      expect(result.hostedSessionToken).toBeNull();
      expect(result.analystOutput).toEqual({ candidate_profile: {} });
      expect(result.novaSonicContext).toBe('context');
      expect(result.agent1Ready).toBe(true);
    });
  });
});

// ---------- maybeStartSession Tests ----------

describe('maybeStartSession', () => {
  it('calls sendSessionStart when conditions are met', () => {
    const sendSessionStart = vi.fn().mockResolvedValue(undefined);
    const ws: WebSocketClient = { sendSessionStart };
    const dispatch = vi.fn();

    const state: SessionState = {
      ...initialState,
      agent1Ready: true,
      wsConnectionState: 'connected',
      wsReady: false,
      novaSonicContext: 'context-data',
    };

    maybeStartSession(state, ws, dispatch);
    expect(sendSessionStart).toHaveBeenCalledWith('context-data', {});
  });

  it('does not call sendSessionStart when agent1Ready is false', () => {
    const sendSessionStart = vi.fn().mockResolvedValue(undefined);
    const ws: WebSocketClient = { sendSessionStart };
    const dispatch = vi.fn();

    const state: SessionState = {
      ...initialState,
      agent1Ready: false,
      wsConnectionState: 'connected',
      wsReady: false,
    };

    maybeStartSession(state, ws, dispatch);
    expect(sendSessionStart).not.toHaveBeenCalled();
  });

  it('does not call sendSessionStart when ws is not connected', () => {
    const sendSessionStart = vi.fn().mockResolvedValue(undefined);
    const ws: WebSocketClient = { sendSessionStart };
    const dispatch = vi.fn();

    const state: SessionState = {
      ...initialState,
      agent1Ready: true,
      wsConnectionState: 'connecting',
      wsReady: false,
    };

    maybeStartSession(state, ws, dispatch);
    expect(sendSessionStart).not.toHaveBeenCalled();
  });

  it('does not call sendSessionStart when wsReady is already true', () => {
    const sendSessionStart = vi.fn().mockResolvedValue(undefined);
    const ws: WebSocketClient = { sendSessionStart };
    const dispatch = vi.fn();

    const state: SessionState = {
      ...initialState,
      agent1Ready: true,
      wsConnectionState: 'connected',
      wsReady: true,
    };

    maybeStartSession(state, ws, dispatch);
    expect(sendSessionStart).not.toHaveBeenCalled();
  });

  it('dispatches SESSION_START_ACKED on success', async () => {
    const sendSessionStart = vi.fn().mockResolvedValue(undefined);
    const ws: WebSocketClient = { sendSessionStart };
    const dispatch = vi.fn();

    const state: SessionState = {
      ...initialState,
      agent1Ready: true,
      wsConnectionState: 'connected',
      wsReady: false,
      novaSonicContext: 'ctx',
    };

    maybeStartSession(state, ws, dispatch);
    await vi.waitFor(() => {
      expect(dispatch).toHaveBeenCalledWith({ type: 'SESSION_START_ACKED' });
    });
  });

  it('dispatches WS_CONNECT_FAILED on sendSessionStart failure', async () => {
    const sendSessionStart = vi.fn().mockRejectedValue(new Error('ws error'));
    const ws: WebSocketClient = { sendSessionStart };
    const dispatch = vi.fn();

    const state: SessionState = {
      ...initialState,
      agent1Ready: true,
      wsConnectionState: 'connected',
      wsReady: false,
      novaSonicContext: 'ctx',
    };

    maybeStartSession(state, ws, dispatch);
    await vi.waitFor(() => {
      expect(dispatch).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'WS_CONNECT_FAILED' })
      );
    });
  });
});

// ---------- analystOutput Unit Tests ----------

describe('AGENT1_SUCCESS — analystOutput', () => {
  it('stores analystOutput when analyst_output is present in payload', () => {
    const analystData = {
      interview_plan: [
        { topic: 'React', priority: 1, question_type: 'technical', target_skill: 'React', source_experience_id: null },
      ],
    };

    const result = sessionReducer(initialState, {
      type: 'AGENT1_SUCCESS',
      payload: {
        nova_sonic_context: 'ctx',
        analyst_output: analystData,
      },
    });

    expect(result.analystOutput).toEqual(analystData);
  });

  it('stores null when analyst_output is undefined in payload', () => {
    const result = sessionReducer(initialState, {
      type: 'AGENT1_SUCCESS',
      payload: {
        nova_sonic_context: 'ctx',
      },
    });

    expect(result.analystOutput).toBeNull();
  });
});

describe('initialState — analystOutput', () => {
  it('has analystOutput set to null', () => {
    expect(initialState.analystOutput).toBeNull();
  });
});

describe('RESET — analystOutput', () => {
  it('clears analystOutput to null', () => {
    const stateWithAnalyst: SessionState = {
      ...initialState,
      analystOutput: { interview_plan: [] },
    };

    const result = sessionReducer(stateWithAnalyst, { type: 'RESET' });
    expect(result.analystOutput).toBeNull();
  });
});

// ---------- Property-Based Tests ----------

describe('PBT: Property 8 — Practice Mode isolation', () => {
  /**
   * Feature: frontend-interview, Property 8: Practice Mode isolation
   * **Validates: Requirements 5.2**
   *
   * For any Practice Mode toggle, messages sent over WebSocket and the
   * Nova Sonic session must remain unchanged (frontend rendering only).
   *
   * TOGGLE_PRACTICE_MODE should only change the `practiceMode` field and nothing else
   * that is relevant to WS/backend state.
   */
  it('TOGGLE_PRACTICE_MODE only changes practiceMode, not WS/backend-relevant fields', () => {
    // Arbitrary for generating a valid SessionState
    const sessionStateArb = fc.record({
      phase: fc.constantFrom('upload', 'waiting', 'interview', 'feedback') as fc.Arbitrary<SessionState['phase']>,
      turnState: fc.constantFrom('ai_speaking', 'user_turn', 'idle') as fc.Arbitrary<SessionState['turnState']>,
      inputMode: fc.constantFrom('voice', 'text_only') as fc.Arbitrary<SessionState['inputMode']>,
      textInputState: fc.constantFrom('idle', 'composing') as fc.Arbitrary<SessionState['textInputState']>,
      practiceMode: fc.boolean(),
      uploadData: fc.constant(null),
      hostedSessionToken: fc.constant(null),
      analystOutput: fc.constant(null),
      transcript: fc.array(
        fc.record({
          role: fc.constantFrom('interviewer', 'user') as fc.Arbitrary<'interviewer' | 'user'>,
          text: fc.string({ minLength: 1, maxLength: 50 }),
          timestamp: fc.constant('2024-01-01T00:00:00Z'),
        }),
        { minLength: 0, maxLength: 5 }
      ),
      novaSonicContext: fc.string({ minLength: 0, maxLength: 100 }),
      elapsedSeconds: fc.nat({ max: 3600 }),
      wsConnectionState: fc.constantFrom('connecting', 'connected', 'reconnecting', 'disconnected') as fc.Arbitrary<SessionState['wsConnectionState']>,
      agent1Ready: fc.boolean(),
      wsReady: fc.boolean(),
      error: fc.constant(null),
      agent3Loading: fc.boolean(),
      feedbackResult: fc.constant(null),
      livePartial: fc.constant(null),
      endReason: fc.constant(null),
    });

    fc.assert(
      fc.property(sessionStateArb, (state) => {
        const result = sessionReducer(state, { type: 'TOGGLE_PRACTICE_MODE' });

        // practiceMode should be toggled
        expect(result.practiceMode).toBe(!state.practiceMode);

        // All WS/backend-relevant fields must remain unchanged
        expect(result.phase).toBe(state.phase);
        expect(result.turnState).toBe(state.turnState);
        expect(result.inputMode).toBe(state.inputMode);
        expect(result.textInputState).toBe(state.textInputState);
        expect(result.transcript).toEqual(state.transcript);
        expect(result.novaSonicContext).toBe(state.novaSonicContext);
        expect(result.elapsedSeconds).toBe(state.elapsedSeconds);
        expect(result.wsConnectionState).toBe(state.wsConnectionState);
        expect(result.agent1Ready).toBe(state.agent1Ready);
        expect(result.wsReady).toBe(state.wsReady);
        expect(result.error).toEqual(state.error);
      }),
      { numRuns: 100 }
    );
  });
});

describe('PBT: Property 13 — lossless transcript accumulation', () => {
  /**
   * Feature: frontend-interview, Property 13: lossless transcript accumulation
   * **Validates: Requirements 7.1**
   *
   * For any sequence of FINAL text_output events received during an interview,
   * the transcript at session end must contain every event in reception order.
   *
   * Dispatching N APPEND_TRANSCRIPT actions results in exactly N entries in
   * the transcript array, in order, with no data loss.
   */
  it('dispatching N APPEND_TRANSCRIPT actions produces N entries in order with no loss', () => {
    const transcriptEntryArb = fc.record({
      role: fc.constantFrom('interviewer', 'user') as fc.Arbitrary<'interviewer' | 'user'>,
      text: fc.string({ minLength: 1, maxLength: 200 }),
      timestamp: fc.string({ minLength: 20, maxLength: 30 }),
    });

    fc.assert(
      fc.property(
        fc.array(transcriptEntryArb, { minLength: 1, maxLength: 50 }),
        (entries) => {
          let state: SessionState = { ...initialState, phase: 'interview' };

          for (const entry of entries) {
            state = sessionReducer(state, {
              type: 'APPEND_TRANSCRIPT',
              payload: entry,
            });
          }

          // Exactly N entries
          expect(state.transcript).toHaveLength(entries.length);

          // All entries in order with identical data
          for (let i = 0; i < entries.length; i++) {
            expect(state.transcript[i].role).toBe(entries[i].role);
            expect(state.transcript[i].text).toBe(entries[i].text);
            expect(state.transcript[i].timestamp).toBe(entries[i].timestamp);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('interleaving other actions does not affect transcript integrity', () => {
    const transcriptEntryArb = fc.record({
      role: fc.constantFrom('interviewer', 'user') as fc.Arbitrary<'interviewer' | 'user'>,
      text: fc.string({ minLength: 1, maxLength: 100 }),
      timestamp: fc.string({ minLength: 20, maxLength: 30 }),
    });

    const nonTranscriptActionArb: fc.Arbitrary<SessionAction> = fc.oneof(
      fc.constant({ type: 'AI_SPEAKING' } as SessionAction),
      fc.constant({ type: 'USER_TURN' } as SessionAction),
      fc.constant({ type: 'BARGE_IN' } as SessionAction),
      fc.constant({ type: 'TOGGLE_PRACTICE_MODE' } as SessionAction),
      fc.constant({ type: 'TICK' } as SessionAction),
      fc.constant({ type: 'TEXT_INPUT_START' } as SessionAction),
      fc.constant({ type: 'TEXT_INPUT_CLEAR' } as SessionAction)
    );

    fc.assert(
      fc.property(
        fc.array(transcriptEntryArb, { minLength: 1, maxLength: 20 }),
        fc.array(nonTranscriptActionArb, { minLength: 0, maxLength: 30 }),
        (entries, otherActions) => {
          let state: SessionState = { ...initialState, phase: 'interview' };

          // Interleave transcript entries with other actions
          let otherIdx = 0;
          for (const entry of entries) {
            // Dispatch some non-transcript actions before each append
            const numOther = Math.min(3, otherActions.length - otherIdx);
            for (let j = 0; j < numOther; j++) {
              state = sessionReducer(state, otherActions[otherIdx++]);
            }
            state = sessionReducer(state, {
              type: 'APPEND_TRANSCRIPT',
              payload: entry,
            });
          }
          // Dispatch remaining non-transcript actions
          while (otherIdx < otherActions.length) {
            state = sessionReducer(state, otherActions[otherIdx++]);
          }

          // All transcript entries preserved in order
          expect(state.transcript).toHaveLength(entries.length);
          for (let i = 0; i < entries.length; i++) {
            expect(state.transcript[i].role).toBe(entries[i].role);
            expect(state.transcript[i].text).toBe(entries[i].text);
            expect(state.transcript[i].timestamp).toBe(entries[i].timestamp);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});
