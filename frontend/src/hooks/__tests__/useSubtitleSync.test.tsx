/**
 * Integration tests for subtitle synchronization.
 *
 * Layer 1: Reducer state transitions (sessionReducer)
 * Layer 2: useSubtitleSync hook behavior
 * Layer 3: PracticeBubbles rendering logic
 *
 * Key behaviors:
 * - Within a chunk, text grows without revealedCount resetting
 * - Chunk FINAL → syncedPartial clears (permanent bubble already on screen)
 * - New turn's text arriving before turnState flips → own bubble, not glued
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { render, screen } from '@testing-library/react';
import { sessionReducer, initialState } from '@/reducers/sessionReducer';
import { useSubtitleSync, type UseSubtitleSyncOptions } from '../useSubtitleSync';
import { PracticeBubbles } from '@/components/PracticeBubbles';
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

function makeEntry(role: 'interviewer' | 'user', text: string, ts = new Date().toISOString()) {
  return { role, text, timestamp: ts };
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

describe('Reducer: subtitle event sequences', () => {
  describe('Same chunk: PARTIALs accumulate', () => {
    it('PARTIALs accumulate into single livePartial, FINAL clears it', () => {
      const tokens = ['Tell ', 'me ', 'about ', 'yourself.'];
      let state = initialState;
      for (const t of tokens) state = dispatch(state, partial('interviewer', t));

      expect(state.livePartial!.text).toBe('Tell me about yourself.');
      state = dispatch(state, finalAction('interviewer', 'Tell me about yourself.'));
      expect(state.transcript).toHaveLength(1);
      expect(state.livePartial).toBeNull();
    });

    it('livePartial never shrinks during accumulation', () => {
      let state = initialState;
      const snapshots: string[] = [];
      for (const t of ['A', 'B', 'C', 'D', 'E']) {
        state = dispatch(state, partial('interviewer', t));
        snapshots.push(state.livePartial!.text);
      }
      for (let i = 1; i < snapshots.length; i++) {
        expect(snapshots[i].startsWith(snapshots[i - 1])).toBe(true);
      }
    });
  });

  describe('Separate chunks produce separate transcript entries', () => {
    it('FINAL for chunk1, then PARTIALs for chunk2 → two entries', () => {
      const t0 = Date.now();
      const t1 = t0 + 10000;
      let state = initialState;
      state = dispatch(state, partial('interviewer', 'Question one.'));
      state = dispatch(state, finalAction('interviewer', 'Question one.', t0));
      state = dispatch(state, partial('interviewer', 'Question two.'));
      state = dispatch(state, finalAction('interviewer', 'Question two.', t1));
      expect(state.transcript).toHaveLength(2);
      expect(state.transcript[0].text).toBe('Question one.');
      expect(state.transcript[1].text).toBe('Question two.');
    });
  });

  describe('Session end edge cases', () => {
    it('INTERVIEW_ENDING flushes accumulated partial', () => {
      let state: SessionState = { ...initialState, phase: 'interview', turnState: 'ai_speaking' };
      state = dispatchAll(state, [
        partial('interviewer', 'Thank you '),
        partial('interviewer', 'for your time.'),
      ]);
      state = dispatch(state, { type: 'INTERVIEW_ENDING' });
      expect(state.transcript[0].text).toBe('Thank you for your time.');
      expect(state.livePartial).toBeNull();
    });
  });
});

// =============================================================================
// Layer 2: useSubtitleSync hook behavior
// =============================================================================

describe('useSubtitleSync: reveal behavior', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('does NOT reset revealedCount when text grows within the same chunk', () => {
    const audioManagerRef = { current: createMockAudioManager() } as React.RefObject<AudioManager | null>;

    const { result, rerender } = renderHook(
      (props: UseSubtitleSyncOptions) => useSubtitleSync(props),
      {
        initialProps: {
          livePartial: { role: 'interviewer', text: 'Hello' } as UseSubtitleSyncOptions['livePartial'],
          audioManagerRef,
          turnState: 'user_turn', // non-ai_speaking → flush immediately
        },
      }
    );
    expect(result.current.syncedPartial?.text).toBe('Hello');

    // Text grows — same role, same chunk, just more accumulated
    rerender({
      livePartial: { role: 'interviewer', text: 'Hello world' } as UseSubtitleSyncOptions['livePartial'],
      audioManagerRef,
      turnState: 'user_turn',
    });
    expect(result.current.syncedPartial?.text).toBe('Hello world');

    // Grows again
    rerender({
      livePartial: { role: 'interviewer', text: 'Hello world, how are you?' } as UseSubtitleSyncOptions['livePartial'],
      audioManagerRef,
      turnState: 'user_turn',
    });
    expect(result.current.syncedPartial?.text).toBe('Hello world, how are you?');
  });

  it('clears syncedPartial immediately when chunk FINAL commits (livePartial → null)', () => {
    const audioManagerRef = { current: createMockAudioManager() } as React.RefObject<AudioManager | null>;

    const { result, rerender } = renderHook(
      (props: UseSubtitleSyncOptions) => useSubtitleSync(props),
      {
        initialProps: {
          livePartial: { role: 'interviewer', text: 'Chunk done' } as UseSubtitleSyncOptions['livePartial'],
          audioManagerRef,
          turnState: 'user_turn',
        },
      }
    );
    expect(result.current.syncedPartial?.text).toBe('Chunk done');

    // FINAL committed → livePartial null
    rerender({
      livePartial: null as UseSubtitleSyncOptions['livePartial'],
      audioManagerRef,
      turnState: 'ai_speaking',
    });
    expect(result.current.syncedPartial).toBeNull();
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
          livePartial: { role: 'interviewer' as const, text: 'Full question text here.' },
          audioManagerRef,
          turnState: 'ai_speaking',
        },
      }
    );

    rerender({
      livePartial: { role: 'interviewer' as const, text: 'Full question text here.' },
      audioManagerRef,
      turnState: 'user_turn',
    });
    expect(result.current.syncedPartial?.text).toBe('Full question text here.');
  });

  it('resets revealedCount on role change', () => {
    const audioManagerRef = { current: createMockAudioManager() } as React.RefObject<AudioManager | null>;

    const { result, rerender } = renderHook(
      (props: UseSubtitleSyncOptions) => useSubtitleSync(props),
      {
        initialProps: {
          livePartial: { role: 'interviewer', text: 'Question' } as UseSubtitleSyncOptions['livePartial'],
          audioManagerRef,
          turnState: 'user_turn',
        },
      }
    );
    expect(result.current.syncedPartial?.text).toBe('Question');

    rerender({
      livePartial: { role: 'user', text: 'Answer' } as UseSubtitleSyncOptions['livePartial'],
      audioManagerRef,
      turnState: 'user_turn',
    });
    expect(result.current.syncedPartial?.text).toBe('Answer');
    expect(result.current.syncedPartial?.role).toBe('user');
  });

  it('resets revealedCount when new chunk starts after FINAL', () => {
    const audioManagerRef = { current: createMockAudioManager() } as React.RefObject<AudioManager | null>;

    const { result, rerender } = renderHook(
      (props: UseSubtitleSyncOptions) => useSubtitleSync(props),
      {
        initialProps: {
          livePartial: { role: 'interviewer', text: 'First chunk' } as UseSubtitleSyncOptions['livePartial'],
          audioManagerRef,
          turnState: 'user_turn',
        },
      }
    );
    expect(result.current.syncedPartial?.text).toBe('First chunk');

    // FINAL commits
    rerender({
      livePartial: null as UseSubtitleSyncOptions['livePartial'],
      audioManagerRef,
      turnState: 'ai_speaking',
    });
    expect(result.current.syncedPartial).toBeNull();

    // New chunk starts — same role, but after null transition
    rerender({
      livePartial: { role: 'interviewer', text: 'Second' } as UseSubtitleSyncOptions['livePartial'],
      audioManagerRef,
      turnState: 'user_turn',
    });
    expect(result.current.syncedPartial?.text).toBe('Second');
  });
});

// =============================================================================
// Layer 3: PracticeBubbles rendering
// =============================================================================

describe('PracticeBubbles: bubble placement logic', () => {
  it('shows live text as own bubble when no chunk committed yet (fresh turn)', () => {
    // Simulate real lifecycle: component mounts during user_turn (fresh=true),
    // then turnState flips to ai_speaking, and live text arrives — but no
    // transcript entry has committed yet for this turn.
    const { rerender } = render(
      <PracticeBubbles
        transcript={[makeEntry('interviewer', 'Previous question text')]}
        livePartial={null}
        turnState="user_turn"
      />
    );

    // Turn starts, live text arrives (no new transcript entry yet → still fresh)
    rerender(
      <PracticeBubbles
        transcript={[makeEntry('interviewer', 'Previous question text')]}
        livePartial={{ role: 'interviewer', text: 'New question starting...' }}
        turnState="ai_speaking"
      />
    );

    // Should have a separate live bubble (fresh turn, nothing committed yet)
    const liveBubble = screen.getByTestId('practice-bubble-live');
    expect(liveBubble.textContent).toContain('New question starting...');

    // Previous bubble should NOT contain the live text
    const interviewerBubbles = screen.getAllByTestId('practice-bubble-interviewer');
    expect(interviewerBubbles[0].textContent).not.toContain('New question starting');
  });

  it('new turn text arriving before turnState flips to ai_speaking → own bubble, not glued to previous', () => {
    // Simulates the race: text_output arrives while turnState is still 'user_turn'
    // freshTurnRef should be true because turnState !== 'ai_speaking'
    render(
      <PracticeBubbles
        transcript={[makeEntry('interviewer', 'Previous turn question')]}
        livePartial={{ role: 'interviewer', text: 'Next turn text arriving early' }}
        turnState="user_turn"
      />
    );

    // Should show as own bubble since turnState isn't ai_speaking → fresh=true
    const liveBubble = screen.getByTestId('practice-bubble-live');
    expect(liveBubble.textContent).toContain('Next turn text arriving early');

    // Previous question bubble should NOT have the new text appended
    const interviewerBubbles = screen.getAllByTestId('practice-bubble-interviewer');
    expect(interviewerBubbles[0].textContent).not.toContain('Next turn text');
  });

  it('appends live text to last bubble after a chunk has committed mid-turn', () => {
    // Simulate: turnState=ai_speaking, transcript grew (chunk committed) → fresh=false
    // The component uses ref tracking, so we test via rerender
    const { rerender } = render(
      <PracticeBubbles
        transcript={[makeEntry('interviewer', 'Old question')]}
        livePartial={null}
        turnState="user_turn"
      />
    );

    // Turn starts, first chunk commits (transcript grows while ai_speaking)
    rerender(
      <PracticeBubbles
        transcript={[
          makeEntry('interviewer', 'Old question'),
          makeEntry('interviewer', 'Committed chunk'),
        ]}
        livePartial={null}
        turnState="ai_speaking"
      />
    );

    // Now live text arrives for the next chunk — should append to last bubble
    rerender(
      <PracticeBubbles
        transcript={[
          makeEntry('interviewer', 'Old question'),
          makeEntry('interviewer', 'Committed chunk'),
        ]}
        livePartial={{ role: 'interviewer', text: 'more text...' }}
        turnState="ai_speaking"
      />
    );

    // No separate live bubble — text appended to the last committed bubble
    expect(screen.queryByTestId('practice-bubble-live')).toBeNull();
    const bubbles = screen.getAllByTestId('practice-bubble-interviewer');
    const lastBubble = bubbles[bubbles.length - 1];
    expect(lastBubble.textContent).toContain('Committed chunk');
    expect(lastBubble.textContent).toContain('more text...');
  });
});
