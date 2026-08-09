/**
 * Integration tests for subtitle synchronization.
 *
 * These tests simulate the exact event sequences observed in production:
 * PARTIAL tokens arriving, FINAL commits, turn transitions, and edge cases
 * around session end. They verify the invariant: text that appears on screen
 * NEVER disappears, merges with other text, or reorders.
 *
 * Layer 1: Reducer state transitions (sessionReducer)
 * Layer 2: Subtitle sync hook behavior (useSubtitleSync)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { sessionReducer, initialState } from '@/reducers/sessionReducer';
import { useSubtitleSync, type UseSubtitleSyncOptions } from '../useSubtitleSync';
import type { SessionState, SessionAction } from '@/types/session';
import type { AudioManager } from '@/services/audioManager';

// --- Helpers ---

function dispatch(state: SessionState, action: SessionAction): SessionState {
  return sessionReducer(state, action);
}

function dispatchAll(state: SessionState, actions: SessionAction[]): SessionState {
  return actions.reduce((s, a) => sessionReducer(s, a), state);
}

function partial(role: 'interviewer' | 'user', text: string): SessionAction {
  return { type: 'UPDATE_LIVE_PARTIAL', payload: { role, text } };
}

function finalAction(role: 'interviewer' | 'user', text: string, timestampMs = Date.now()): SessionAction {
  return {
    type: 'APPEND_TRANSCRIPT',
    payload: { role, text, timestamp: new Date(timestampMs).toISOString() },
  };
}

function createMockAudioManager(overrides?: Partial<AudioManager>): AudioManager {
  return {
    initialize: vi.fn().mockResolvedValue({ granted: true }),
    destroy: vi.fn(),
    startCapture: vi.fn(),
    pauseCapture: vi.fn(),
    resumeCapture: vi.fn(),
    enqueueAudio: vi.fn(),
    stopPlayback: vi.fn(),
    isPlaying: vi.fn().mockReturnValue(false),
    waitForPlaybackEnd: vi.fn().mockResolvedValue(undefined),
    getPlayedDuration: vi.fn().mockReturnValue(0),
    getTotalEnqueuedDuration: vi.fn().mockReturnValue(0),
    onAudioChunk: vi.fn(),
    onPlaybackEnd: vi.fn(),
    ...overrides,
  };
}

// =============================================================================
// Layer 1: Reducer state transitions
// =============================================================================

describe('Reducer: subtitle event sequences (real scenarios)', () => {
  describe('Scenario 1: Multiple sentences in one content block', () => {
    it('PARTIALs accumulate into single livePartial, FINAL clears it', () => {
      const tokens = [
        'Tell ', 'me ', 'about ', 'your ', 'experience. ',
        'What ', 'were ', 'the ', 'key ', 'challenges?',
      ];

      let state = initialState;
      for (const token of tokens) {
        state = dispatch(state, partial('interviewer', token));
      }

      expect(state.livePartial).toEqual({
        role: 'interviewer',
        text: 'Tell me about your experience. What were the key challenges?',
      });
      expect(state.transcript).toHaveLength(0);

      state = dispatch(state, finalAction('interviewer',
        'Tell me about your experience. What were the key challenges?'));

      expect(state.transcript).toHaveLength(1);
      expect(state.transcript[0].text).toBe(
        'Tell me about your experience. What were the key challenges?');
      expect(state.livePartial).toBeNull();
    });

    it('livePartial never shrinks during accumulation', () => {
      let state = initialState;
      const snapshots: string[] = [];

      const tokens = ['Hello, ', 'and ', 'welcome. ', "Let's ", 'get ', 'started.'];
      for (const token of tokens) {
        state = dispatch(state, partial('interviewer', token));
        snapshots.push(state.livePartial!.text);
      }

      for (let i = 1; i < snapshots.length; i++) {
        expect(snapshots[i].startsWith(snapshots[i - 1])).toBe(true);
      }
    });
  });

  describe('Scenario 2: Separate content blocks (different questions)', () => {
    it('FINAL for Q1 and PARTIAL start for Q2 produce separate entries', () => {
      const t0 = Date.now();
      const t1 = t0 + 10000;

      let state = initialState;

      state = dispatch(state, partial('interviewer', 'Tell me about yourself.'));
      state = dispatch(state, finalAction('interviewer', 'Tell me about yourself.', t0));

      expect(state.transcript).toHaveLength(1);
      expect(state.livePartial).toBeNull();

      state = dispatchAll(state, [
        partial('interviewer', 'Now '),
        partial('interviewer', "let's "),
        partial('interviewer', 'discuss '),
        partial('interviewer', 'your project.'),
      ]);

      expect(state.livePartial).toEqual({
        role: 'interviewer',
        text: "Now let's discuss your project.",
      });
      expect(state.transcript).toHaveLength(1);

      state = dispatch(state, finalAction('interviewer', "Now let's discuss your project.", t1));

      expect(state.transcript).toHaveLength(2);
      expect(state.transcript[0].text).toBe('Tell me about yourself.');
      expect(state.transcript[1].text).toBe("Now let's discuss your project.");
      expect(state.livePartial).toBeNull();
    });

    it('FINALs within merge window are merged but text is never lost', () => {
      const t0 = Date.now();
      const t1 = t0 + 2000;

      let state = initialState;

      state = dispatch(state, finalAction('interviewer', 'Sentence one.', t0));
      expect(state.transcript).toHaveLength(1);

      state = dispatch(state, finalAction('interviewer', 'Sentence two.', t1));

      expect(state.transcript).toHaveLength(1);
      expect(state.transcript[0].text).toContain('Sentence one.');
      expect(state.transcript[0].text).toContain('Sentence two.');
    });
  });

  describe('Scenario 3: Rapid consecutive chunks maintain order', () => {
    it('10 rapid PARTIALs arrive in order and accumulate correctly', () => {
      const tokens = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'];
      let state = initialState;

      for (const t of tokens) {
        state = dispatch(state, partial('interviewer', t));
      }

      expect(state.livePartial!.text).toBe('ABCDEFGHIJ');
    });

    it('interleaved user/interviewer PARTIALs reset correctly', () => {
      let state = initialState;

      state = dispatch(state, partial('interviewer', 'Question?'));
      expect(state.livePartial).toEqual({ role: 'interviewer', text: 'Question?' });

      state = dispatch(state, partial('user', 'My answer'));
      expect(state.livePartial).toEqual({ role: 'user', text: 'My answer' });

      state = dispatch(state, partial('interviewer', 'Follow-up'));
      expect(state.livePartial).toEqual({ role: 'interviewer', text: 'Follow-up' });
    });
  });

  describe('Scenario 4: Session end edge cases', () => {
    it('INTERVIEW_ENDING flushes accumulated partial to transcript', () => {
      let state: SessionState = {
        ...initialState,
        phase: 'interview',
        turnState: 'ai_speaking',
      };

      state = dispatchAll(state, [
        partial('interviewer', 'Thank you '),
        partial('interviewer', 'for your time today.'),
      ]);

      state = dispatch(state, { type: 'INTERVIEW_ENDING' });

      expect(state.transcript).toHaveLength(1);
      expect(state.transcript[0].text).toBe('Thank you for your time today.');
      expect(state.livePartial).toBeNull();
    });

    it('AI_SPEAKING to USER_TURN does not lose pending livePartial', () => {
      let state: SessionState = {
        ...initialState,
        phase: 'interview',
        turnState: 'ai_speaking',
      };

      state = dispatch(state, partial('interviewer', 'Full question text here.'));
      state = dispatch(state, { type: 'USER_TURN' });

      // livePartial survives turn change
      expect(state.livePartial).toEqual({
        role: 'interviewer',
        text: 'Full question text here.',
      });

      state = dispatch(state, finalAction('interviewer', 'Full question text here.'));
      expect(state.transcript).toHaveLength(1);
      expect(state.transcript[0].text).toBe('Full question text here.');
      expect(state.livePartial).toBeNull();
    });
  });
});

// =============================================================================
// Layer 2: useSubtitleSync hook behavior
// =============================================================================

describe('useSubtitleSync: reveal behavior', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('flushes all text immediately when turnState leaves ai_speaking', () => {
    const am = createMockAudioManager({
      getPlayedDuration: vi.fn().mockReturnValue(1),
      getTotalEnqueuedDuration: vi.fn().mockReturnValue(10),
    });
    const audioManagerRef = { current: am } as React.RefObject<AudioManager | null>;

    const { result, rerender } = renderHook(
      (props) => useSubtitleSync(props),
      {
        initialProps: {
          livePartial: { role: 'interviewer' as const, text: 'Full question with many words here.' },
          audioManagerRef,
          turnState: 'ai_speaking',
        },
      }
    );

    // Transition to user_turn triggers flush
    rerender({
      livePartial: { role: 'interviewer' as const, text: 'Full question with many words here.' },
      audioManagerRef,
      turnState: 'user_turn',
    });

    expect(result.current.syncedPartial).toEqual({
      role: 'interviewer',
      text: 'Full question with many words here.',
    });
  });

  it('resets syncedPartial to null when livePartial becomes null', () => {
    const audioManagerRef = { current: createMockAudioManager() } as React.RefObject<AudioManager | null>;

    const { result, rerender } = renderHook(
      (props: UseSubtitleSyncOptions) => useSubtitleSync(props),
      {
        initialProps: {
          livePartial: { role: 'interviewer' as const, text: 'Some text' } as UseSubtitleSyncOptions['livePartial'],
          audioManagerRef,
          turnState: 'user_turn',
        },
      }
    );

    expect(result.current.syncedPartial?.text).toBe('Some text');

    rerender({
      livePartial: null,
      audioManagerRef,
      turnState: 'user_turn',
    });

    expect(result.current.syncedPartial).toBeNull();
  });

  it('handles role transition without crash', () => {
    const audioManagerRef = { current: createMockAudioManager() } as React.RefObject<AudioManager | null>;

    const { result, rerender } = renderHook(
      (props: UseSubtitleSyncOptions) => useSubtitleSync(props),
      {
        initialProps: {
          livePartial: { role: 'interviewer', text: 'Interviewer text' } as UseSubtitleSyncOptions['livePartial'],
          audioManagerRef,
          turnState: 'user_turn',
        },
      }
    );

    expect(result.current.syncedPartial?.role).toBe('interviewer');

    rerender({
      livePartial: { role: 'user', text: 'User response' },
      audioManagerRef,
      turnState: 'user_turn',
    });

    expect(result.current.syncedPartial?.text).toBe('User response');
    expect(result.current.syncedPartial?.role).toBe('user');
  });

  it('edge case: text buffered when audio ends, flushed before FINAL', () => {
    const am = createMockAudioManager({
      getPlayedDuration: vi.fn().mockReturnValue(5),
      getTotalEnqueuedDuration: vi.fn().mockReturnValue(5),
    });
    const audioManagerRef = { current: am } as React.RefObject<AudioManager | null>;

    const { result, rerender } = renderHook(
      (props: UseSubtitleSyncOptions) => useSubtitleSync(props),
      {
        initialProps: {
          livePartial: { role: 'interviewer', text: 'Last question. What were the challenges?' } as UseSubtitleSyncOptions['livePartial'],
          audioManagerRef,
          turnState: 'ai_speaking',
        },
      }
    );

    // Audio finishes, turnState changes
    rerender({
      livePartial: { role: 'interviewer', text: 'Last question. What were the challenges?' },
      audioManagerRef,
      turnState: 'user_turn',
    });

    expect(result.current.syncedPartial?.text).toBe(
      'Last question. What were the challenges?'
    );

    // FINAL arrives
    rerender({
      livePartial: null as UseSubtitleSyncOptions['livePartial'],
      audioManagerRef,
      turnState: 'user_turn',
    });

    expect(result.current.syncedPartial).toBeNull();
  });
});
