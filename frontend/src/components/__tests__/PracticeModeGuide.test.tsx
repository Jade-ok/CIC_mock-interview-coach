import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import fc from 'fast-check';
import { PracticeBubbles } from '@/components/PracticeBubbles';
import type { SessionState, TranscriptEntry } from '@/types/session';
import { initialState } from '@/reducers/sessionReducer';
import { InterviewScreen } from '@/components/InterviewScreen';

// --- Mocks for InterviewScreen tests ---
const mockDispatch = vi.fn();
const mockSetWebSocketClient = vi.fn();
let mockState: SessionState;

vi.mock('@/contexts/SessionContext', () => ({
  useSession: () => ({
    state: mockState,
    dispatch: mockDispatch,
    setWebSocketClient: mockSetWebSocketClient,
  }),
}));

vi.mock('@/hooks/useInterviewStreaming', () => ({
  useInterviewStreaming: () => ({
    audioManagerRef: { current: null },
  }),
}));

vi.mock('@/services/agent3Client', () => ({
  callAgent3: vi.fn(),
}));

// --- Helpers ---
function makeTranscriptEntry(role: 'interviewer' | 'user', text: string): TranscriptEntry {
  return { role, text, timestamp: new Date().toISOString() };
}

// --- fast-check Arbitraries ---
const transcriptEntryArb = fc.record({
  role: fc.oneof(fc.constant('interviewer' as const), fc.constant('user' as const)),
  text: fc.string({ minLength: 1, maxLength: 200 }),
  timestamp: fc.date().map((d) => d.toISOString()),
});

// --- Unit Tests ---

describe('PracticeBubbles', () => {
  it('shows interviewer bubbles when practiceMode is ON', () => {
    const transcript = [
      makeTranscriptEntry('interviewer', 'Tell me about yourself'),
      makeTranscriptEntry('user', 'I am a student'),
      makeTranscriptEntry('interviewer', 'What project are you proud of?'),
    ];
    render(<PracticeBubbles practiceMode={true} transcript={transcript} />);
    const bubbles = screen.getAllByTestId('practice-bubble');
    expect(bubbles).toHaveLength(2); // only interviewer entries
    expect(bubbles[0].textContent).toBe('Tell me about yourself');
    expect(bubbles[1].textContent).toBe('What project are you proud of?');
  });

  it('never shows user answers as bubbles', () => {
    const transcript = [
      makeTranscriptEntry('user', 'My answer here'),
      makeTranscriptEntry('user', 'Another answer'),
    ];
    render(<PracticeBubbles practiceMode={true} transcript={transcript} />);
    expect(screen.queryAllByTestId('practice-bubble')).toHaveLength(0);
  });

  it('shows no bubbles when practiceMode is OFF', () => {
    const transcript = [
      makeTranscriptEntry('interviewer', 'Tell me about yourself'),
    ];
    render(<PracticeBubbles practiceMode={false} transcript={transcript} />);
    expect(screen.queryAllByTestId('practice-bubble')).toHaveLength(0);
  });

  it('ON→OFF immediately removes bubbles', () => {
    const transcript = [makeTranscriptEntry('interviewer', 'Question')];
    const { rerender } = render(<PracticeBubbles practiceMode={true} transcript={transcript} />);
    expect(screen.getAllByTestId('practice-bubble')).toHaveLength(1);

    rerender(<PracticeBubbles practiceMode={false} transcript={transcript} />);
    expect(screen.queryAllByTestId('practice-bubble')).toHaveLength(0);
  });
});

// --- Property-Based Tests ---

describe('Property 8: Practice Mode 격리', () => {
  /**
   * Feature: frontend-interview, Property 8: Practice Mode 격리
   * Validates: Requirements 5.2
   *
   * For any Practice Mode toggle state change, WebSocket messages or
   * Nova Sonic session must not be affected (frontend rendering only).
   */
  beforeEach(() => {
    mockDispatch.mockClear();
    mockState = {
      ...initialState,
      phase: 'interview',
      turnState: 'idle',
      practiceMode: true,
      elapsedSeconds: 0,
    };
  });

  it('PBT: toggling Practice Mode only dispatches TOGGLE_PRACTICE_MODE, no WS-related actions', () => {
    fc.assert(
      fc.property(
        fc.nat({ max: 20 }),
        (toggleCount) => {
          mockDispatch.mockClear();
          mockState = {
            ...initialState,
            phase: 'interview',
            turnState: 'idle',
            practiceMode: true,
            elapsedSeconds: 0,
          };

          const { unmount } = render(<InterviewScreen />);
          const toggle = screen.getByTestId('practice-mode-toggle');

          for (let i = 0; i < toggleCount; i++) {
            fireEvent.click(toggle);
          }

          // Filter out TICK dispatches (from timer)
          const nonTickCalls = mockDispatch.mock.calls.filter(
            (call) => call[0].type !== 'TICK'
          );

          // Every dispatch should be TOGGLE_PRACTICE_MODE only
          for (const call of nonTickCalls) {
            expect(call[0].type).toBe('TOGGLE_PRACTICE_MODE');
          }
          expect(nonTickCalls).toHaveLength(toggleCount);

          unmount();
        }
      ),
      { numRuns: 100 }
    );
  });
});

describe('Property 9: Practice Mode ON — 표시 규칙', () => {
  /**
   * Feature: frontend-interview, Property 9: Practice Mode ON — 표시 규칙
   * Validates: Requirements 5.3, 5.4
   *
   * For any transcript entries with Practice Mode ON:
   * - Interviewer text is shown as bubbles
   * - User text is NEVER shown as bubbles
   */
  it('PBT: Practice Mode ON shows only interviewer bubbles, never user bubbles', () => {
    fc.assert(
      fc.property(
        fc.array(transcriptEntryArb, { minLength: 0, maxLength: 20 }),
        (transcript) => {
          const { unmount } = render(
            <PracticeBubbles practiceMode={true} transcript={transcript} />
          );

          const bubbles = screen.queryAllByTestId('practice-bubble');
          const interviewerEntries = transcript.filter((e) => e.role === 'interviewer');

          // Number of bubbles must equal number of interviewer entries
          expect(bubbles.length).toBe(interviewerEntries.length);

          // Each bubble text matches interviewer entries in order
          for (let i = 0; i < bubbles.length; i++) {
            expect(bubbles[i].textContent).toBe(interviewerEntries[i].text);
          }

          unmount();
        }
      ),
      { numRuns: 100 }
    );
  });
});

describe('Property 10: Practice Mode OFF — 텍스트 숨김', () => {
  /**
   * Feature: frontend-interview, Property 10: Practice Mode OFF — 텍스트 숨김
   * Validates: Requirements 5.5
   *
   * For any transcript entries with Practice Mode OFF, no text bubbles are displayed.
   */
  it('PBT: Practice Mode OFF shows no bubbles regardless of transcript content', () => {
    fc.assert(
      fc.property(
        fc.array(transcriptEntryArb, { minLength: 0, maxLength: 20 }),
        (transcript) => {
          const { unmount } = render(
            <PracticeBubbles practiceMode={false} transcript={transcript} />
          );

          const bubbles = screen.queryAllByTestId('practice-bubble');
          expect(bubbles.length).toBe(0);

          unmount();
        }
      ),
      { numRuns: 100 }
    );
  });
});

describe('Property 11: Practice Mode ON→OFF 즉시 제거', () => {
  /**
   * Feature: frontend-interview, Property 11: Practice Mode ON→OFF 즉시 제거
   * Validates: Requirements 5.6
   *
   * For any state with Practice Mode ON that has bubbles displayed,
   * switching to OFF immediately removes all bubbles.
   */
  it('PBT: ON→OFF transition immediately removes all bubbles', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            role: fc.constant('interviewer' as const),
            text: fc.string({ minLength: 1, maxLength: 100 }),
            timestamp: fc.date().map((d) => d.toISOString()),
          }),
          { minLength: 1, maxLength: 10 }
        ),
        (interviewerTranscript) => {
          // Render PracticeBubbles in ON state
          const { rerender, unmount } = render(
            <PracticeBubbles practiceMode={true} transcript={interviewerTranscript} />
          );

          // Verify bubbles exist in ON state
          const bubblesOn = screen.queryAllByTestId('practice-bubble');
          expect(bubblesOn.length).toBe(interviewerTranscript.length);

          // Switch to OFF
          rerender(
            <PracticeBubbles practiceMode={false} transcript={interviewerTranscript} />
          );

          // Verify all bubbles removed
          const bubblesOff = screen.queryAllByTestId('practice-bubble');
          expect(bubblesOff.length).toBe(0);

          unmount();
        }
      ),
      { numRuns: 100 }
    );
  });
});
