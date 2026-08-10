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

describe('PracticeBubbles (Chat Log View)', () => {
  it('shows interviewer bubbles and omits candidate answers', () => {
    const transcript = [
      makeTranscriptEntry('interviewer', 'Tell me about yourself'),
      makeTranscriptEntry('user', 'I am a student'),
      makeTranscriptEntry('interviewer', 'What project are you proud of?'),
    ];
    render(<PracticeBubbles transcript={transcript} livePartial={null} turnState="idle" />);

    const interviewerBubbles = screen.getAllByTestId('practice-bubble-interviewer');
    expect(interviewerBubbles).toHaveLength(2);
    expect(screen.queryAllByTestId('practice-bubble-user')).toHaveLength(0);
    expect(interviewerBubbles[0].textContent).toContain('Tell me about yourself');
    expect(interviewerBubbles[1].textContent).toContain('What project are you proud of?');
  });

  it('shows live partial indicator when present', () => {
    // With no transcript entries, freshTurnRef stays true → own bubble
    render(
      <PracticeBubbles
        transcript={[]}
        livePartial={{ role: 'interviewer', text: 'Tell me about...' }}
        turnState="ai_speaking"
      />
    );
    const liveBubble = screen.getByTestId('practice-bubble-live');
    expect(liveBubble.textContent).toContain('Tell me about...');
  });

  it('displays status indicator for AI speaking', () => {
    render(<PracticeBubbles transcript={[]} livePartial={null} turnState="ai_speaking" />);
    expect(screen.getByTestId('practice-chat-status').textContent).toContain('AI speaking');
  });

  it('displays status indicator for user turn', () => {
    render(<PracticeBubbles transcript={[]} livePartial={null} turnState="user_turn" />);
    expect(screen.getByTestId('practice-chat-status').textContent).toContain('Your turn');
  });

  it('renders empty log when no transcript entries', () => {
    render(<PracticeBubbles transcript={[]} livePartial={null} turnState="idle" />);
    const log = screen.getByTestId('practice-chat-log');
    expect(log.children).toHaveLength(0);
  });
});

// --- Integration Tests (InterviewScreen) ---

describe('InterviewScreen: Practice Mode layout switching', () => {
  beforeEach(() => {
    mockDispatch.mockClear();
    mockState = {
      ...initialState,
      phase: 'interview',
      turnState: 'idle',
      practiceMode: false,
      elapsedSeconds: 0,
    };
  });

  it('Practice Mode OFF: shows participant tiles, no chat log', () => {
    mockState = { ...mockState, practiceMode: false };
    render(<InterviewScreen />);
    expect(screen.getByTestId('participant-tiles')).toBeInTheDocument();
    expect(screen.queryByTestId('practice-bubbles')).not.toBeInTheDocument();
  });

  it('Practice Mode ON: shows chat log, no participant tiles', () => {
    mockState = { ...mockState, practiceMode: true };
    render(<InterviewScreen />);
    expect(screen.getByTestId('practice-bubbles')).toBeInTheDocument();
    expect(screen.queryByTestId('participant-tiles')).not.toBeInTheDocument();
  });
});

// --- Property-Based Tests ---

describe('Property 8: Practice Mode isolation', () => {
  /**
   * Feature: frontend-interview, Property 8: Practice Mode isolation
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

describe('Property 9: Practice Mode ON — caption display rules', () => {
  /**
   * Feature: frontend-interview, Property 9: Practice Mode ON — display rules
   * Validates: Requirements 5.3, 5.4
   *
   * For any transcript entries when PracticeBubbles is rendered (Practice Mode ON):
   * - Interviewer text is shown in the chat log
   * - Candidate answers are omitted
   */
  it('PBT: Chat log shows interviewer entries only', () => {
    fc.assert(
      fc.property(
        fc.array(transcriptEntryArb, { minLength: 0, maxLength: 20 }),
        (transcript) => {
          const { unmount } = render(
            <PracticeBubbles transcript={transcript} livePartial={null} turnState="idle" />
          );

          const interviewerBubbles = screen.queryAllByTestId('practice-bubble-interviewer');
          const interviewerEntries = transcript.filter((e) => e.role === 'interviewer');
          expect(interviewerBubbles.length).toBe(interviewerEntries.length);
          expect(screen.queryAllByTestId('practice-bubble-user')).toHaveLength(0);

          unmount();
        }
      ),
      { numRuns: 100 }
    );
  });
});

describe('Property 10: Practice Mode OFF — conditional rendering', () => {
  /**
   * Feature: frontend-interview, Property 10: Practice Mode OFF — tiles only
   * Validates: Requirements 5.5
   *
   * When Practice Mode is OFF, the parent (InterviewScreen) does not render
   * PracticeBubbles at all — only participant tiles are shown.
   */
  beforeEach(() => {
    mockDispatch.mockClear();
  });

  it('PBT: Practice Mode OFF never renders chat log component', () => {
    fc.assert(
      fc.property(
        fc.array(transcriptEntryArb, { minLength: 0, maxLength: 20 }),
        (transcript) => {
          mockState = {
            ...initialState,
            phase: 'interview',
            turnState: 'idle',
            practiceMode: false,
            transcript,
            elapsedSeconds: 0,
          };

          const { unmount } = render(<InterviewScreen />);

          // Chat log should not exist
          expect(screen.queryByTestId('practice-bubbles')).not.toBeInTheDocument();
          // Tiles should exist
          expect(screen.getByTestId('participant-tiles')).toBeInTheDocument();

          unmount();
        }
      ),
      { numRuns: 100 }
    );
  });
});

describe('Property 11: mutually exclusive views', () => {
  /**
   * Feature: frontend-interview, Property 11: prevent duplicate views
   * Validates: Requirements 5.6
   *
   * For any practiceMode state, participant-tiles and practice-bubbles
   * must never coexist in the DOM.
   */
  beforeEach(() => {
    mockDispatch.mockClear();
  });

  it('PBT: tiles and chat log are mutually exclusive', () => {
    fc.assert(
      fc.property(
        fc.boolean(),
        fc.array(transcriptEntryArb, { minLength: 0, maxLength: 10 }),
        (practiceMode, transcript) => {
          mockState = {
            ...initialState,
            phase: 'interview',
            turnState: 'idle',
            practiceMode,
            transcript,
            elapsedSeconds: 0,
          };

          const { unmount } = render(<InterviewScreen />);

          const hasTiles = screen.queryByTestId('participant-tiles') !== null;
          const hasChatLog = screen.queryByTestId('practice-bubbles') !== null;

          // Exactly one should be present, never both
          expect(hasTiles).not.toBe(hasChatLog);

          unmount();
        }
      ),
      { numRuns: 100 }
    );
  });
});
