import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import { InterviewScreen } from '@/components/InterviewScreen';
import type { SessionState } from '@/types/session';
import { initialState } from '@/reducers/sessionReducer';
import fc from 'fast-check';

// Mock SessionContext
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

describe('InterviewScreen', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockState = {
      ...initialState,
      phase: 'interview',
      turnState: 'idle',
      practiceMode: false,
      elapsedSeconds: 0,
    };
    mockDispatch.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('Layout and Basic UI', () => {
    it('renders dark themed interview screen', () => {
      render(<InterviewScreen />);
      expect(screen.getByTestId('interview-screen')).toBeInTheDocument();
    });

    it('renders participant tiles with AI and User tiles', () => {
      render(<InterviewScreen />);
      expect(screen.getByTestId('ai-tile')).toBeInTheDocument();
      expect(screen.getByTestId('user-tile')).toBeInTheDocument();
    });

    it('renders control bar with timer, practice toggle, and end button', () => {
      render(<InterviewScreen />);
      expect(screen.getByTestId('control-bar')).toBeInTheDocument();
      expect(screen.getByTestId('timer')).toBeInTheDocument();
      expect(screen.getByTestId('practice-mode-toggle')).toBeInTheDocument();
      expect(screen.getByTestId('end-button')).toBeInTheDocument();
    });

    it('renders mic button', () => {
      render(<InterviewScreen />);
      expect(screen.getByTestId('mic-button')).toBeInTheDocument();
      expect(screen.getByTestId('mic-button-wrapper')).toBeInTheDocument();
    });

    it('renders the Guide Panel in Practice Mode', () => {
      mockState = { ...mockState, practiceMode: true };
      render(<InterviewScreen />);
      expect(screen.getByTestId('guide-panel')).toBeInTheDocument();
    });

    it('does not show question counter or progress indicator (Req 3.12)', () => {
      render(<InterviewScreen />);
      const screen$ = screen.getByTestId('interview-screen');
      expect(screen$.textContent).not.toMatch(/question\s*\d/i);
      expect(screen$.textContent).not.toMatch(/\d+\s*\/\s*\d+/); // No "X/Y" pattern
    });

    it('does not use camera (Req 3.13)', () => {
      render(<InterviewScreen />);
      const videos = document.querySelectorAll('video');
      expect(videos.length).toBe(0);
    });
  });

  describe('Turn State Visual Indication (Req 3.5)', () => {
    it('shows active border on AI tile when ai_speaking', () => {
      mockState = { ...mockState, turnState: 'ai_speaking' };
      render(<InterviewScreen />);
      const aiTile = screen.getByTestId('ai-tile');
      expect(aiTile.className).toContain('participant-tile--active');
    });

    it('shows active border on User tile when user_turn', () => {
      mockState = { ...mockState, turnState: 'user_turn' };
      render(<InterviewScreen />);
      const userTile = screen.getByTestId('user-tile');
      expect(userTile.className).toContain('participant-tile--active');
    });

    it('shows waveform on AI tile when ai_speaking', () => {
      mockState = { ...mockState, turnState: 'ai_speaking' };
      render(<InterviewScreen />);
      expect(screen.getByTestId('ai-waveform')).toBeInTheDocument();
    });

    it('shows waveform on User tile when user_turn', () => {
      mockState = { ...mockState, turnState: 'user_turn' };
      render(<InterviewScreen />);
      expect(screen.getByTestId('user-waveform')).toBeInTheDocument();
    });

    it('no active tile when idle', () => {
      mockState = { ...mockState, turnState: 'idle' };
      render(<InterviewScreen />);
      const aiTile = screen.getByTestId('ai-tile');
      const userTile = screen.getByTestId('user-tile');
      expect(aiTile.className).not.toContain('participant-tile--active');
      expect(userTile.className).not.toContain('participant-tile--active');
    });
  });

  describe('EndButton Always Enabled (Req 4.2, 4.8)', () => {
    it('end button is always enabled', () => {
      render(<InterviewScreen />);
      const endBtn = screen.getByTestId('end-button');
      expect(endBtn).not.toBeDisabled();
    });

    it('end button shows confirm modal on click, confirm dispatches END_INTERVIEW', () => {
      render(<InterviewScreen />);
      const endBtn = screen.getByTestId('end-button');
      fireEvent.click(endBtn);
      // Modal should appear
      expect(screen.getByTestId('end-confirm-modal')).toBeInTheDocument();
      // Confirm the modal
      fireEvent.click(screen.getByTestId('end-confirm-ok'));
      expect(mockDispatch).toHaveBeenCalledWith({
        type: 'END_INTERVIEW',
        payload: { reason: 'manual' },
      });
    });

    it('end button remains enabled even when error exists', () => {
      mockState = {
        ...mockState,
        error: {
          code: 'WS_RECONNECT_FAILED',
          message: 'Connection failed',
          retryable: false,
        },
      };
      render(<InterviewScreen />);
      const endBtn = screen.getByTestId('end-button');
      expect(endBtn).not.toBeDisabled();
    });
  });

  describe('Timer TICK-based (Req design)', () => {
    it('dispatches TICK every second during interview phase', () => {
      render(<InterviewScreen />);

      act(() => {
        vi.advanceTimersByTime(3000);
      });

      const tickCalls = mockDispatch.mock.calls.filter(
        (call) => call[0].type === 'TICK'
      );
      expect(tickCalls.length).toBe(3);
    });

    it('displays formatted elapsed time', () => {
      mockState = { ...mockState, elapsedSeconds: 222 }; // 3:42
      render(<InterviewScreen />);
      expect(screen.getByTestId('timer').textContent).toBe('03:42');
    });

    it('does not dispatch TICK when phase is not interview', () => {
      mockState = { ...mockState, phase: 'upload' };
      render(<InterviewScreen />);

      act(() => {
        vi.advanceTimersByTime(3000);
      });

      const tickCalls = mockDispatch.mock.calls.filter(
        (call) => call[0].type === 'TICK'
      );
      expect(tickCalls.length).toBe(0);
    });
  });

  describe('beforeunload Registration/Deregistration (Req 3.15)', () => {
    it('registers beforeunload during interview phase', () => {
      const addSpy = vi.spyOn(window, 'addEventListener');
      render(<InterviewScreen />);

      const beforeunloadCalls = addSpy.mock.calls.filter(
        (call) => call[0] === 'beforeunload'
      );
      expect(beforeunloadCalls.length).toBe(1);
      addSpy.mockRestore();
    });

    it('deregisters beforeunload when phase changes away from interview', () => {
      const removeSpy = vi.spyOn(window, 'removeEventListener');
      const { unmount } = render(<InterviewScreen />);

      unmount();

      const beforeunloadCalls = removeSpy.mock.calls.filter(
        (call) => call[0] === 'beforeunload'
      );
      expect(beforeunloadCalls.length).toBe(1);
      removeSpy.mockRestore();
    });

    it('does not register beforeunload when phase is not interview', () => {
      mockState = { ...mockState, phase: 'upload' };
      const addSpy = vi.spyOn(window, 'addEventListener');
      render(<InterviewScreen />);

      const beforeunloadCalls = addSpy.mock.calls.filter(
        (call) => call[0] === 'beforeunload'
      );
      expect(beforeunloadCalls.length).toBe(0);
      addSpy.mockRestore();
    });
  });

  describe('PracticeModeToggle', () => {
    it('dispatches TOGGLE_PRACTICE_MODE on click', () => {
      render(<InterviewScreen />);
      const toggle = screen.getByTestId('practice-mode-toggle');
      fireEvent.click(toggle);
      expect(mockDispatch).toHaveBeenCalledWith({ type: 'TOGGLE_PRACTICE_MODE' });
    });
  });

  describe('MicButton Toggle', () => {
    it('mic button is disabled when AI is speaking', () => {
      mockState = { ...mockState, turnState: 'ai_speaking' };
      render(<InterviewScreen />);
      const micBtn = screen.getByTestId('mic-button');
      expect(micBtn).toBeDisabled();
    });

    it('mic button is enabled during user_turn', () => {
      mockState = { ...mockState, turnState: 'user_turn' };
      render(<InterviewScreen />);
      const micBtn = screen.getByTestId('mic-button');
      expect(micBtn).not.toBeDisabled();
    });

    it('starts with recording enabled during the user turn', () => {
      mockState = { ...mockState, turnState: 'user_turn' };
      render(<InterviewScreen />);
      const micBtn = screen.getByTestId('mic-button');
      expect(micBtn.className).toContain('mic-button--recording');
      expect(micBtn).toHaveAttribute('aria-pressed', 'true');
      expect(micBtn).toHaveAttribute('aria-label', 'Stop recording');
    });

    it('clicking the active mic button pauses recording', () => {
      mockState = { ...mockState, turnState: 'user_turn' };
      render(<InterviewScreen />);
      const micBtn = screen.getByTestId('mic-button');
      fireEvent.click(micBtn);
      expect(micBtn.className).not.toContain('mic-button--recording');
      expect(micBtn).toHaveAttribute('aria-pressed', 'false');
      expect(micBtn).toHaveAttribute('aria-label', 'Start recording your answer');
    });

    it('clicking while AI speaking does nothing', () => {
      mockState = { ...mockState, turnState: 'ai_speaking' };
      render(<InterviewScreen />);
      const micBtn = screen.getByTestId('mic-button');
      fireEvent.click(micBtn);
      expect(micBtn).toBeDisabled();
      expect(micBtn).toHaveAttribute('aria-label', 'Waiting for AI');
    });

    it('shows "Waiting for AI" aria-label when disabled', () => {
      mockState = { ...mockState, turnState: 'ai_speaking' };
      render(<InterviewScreen />);
      const micBtn = screen.getByTestId('mic-button');
      expect(micBtn).toHaveAttribute('aria-label', 'Waiting for AI');
    });

    it('shows status text "Click to speak" when recording is paused', () => {
      mockState = { ...mockState, turnState: 'user_turn' };
      render(<InterviewScreen />);
      fireEvent.click(screen.getByTestId('mic-button'));
      expect(screen.getByTestId('mic-status').textContent).toBe('Click to speak');
    });

    it('shows status text "Recording..." when recording', () => {
      mockState = { ...mockState, turnState: 'user_turn' };
      render(<InterviewScreen />);
      expect(screen.getByTestId('mic-status').textContent).toBe('Recording...');
    });
  });

  // --- Property-Based Tests ---

  describe('Property 15: beforeunload Active Condition', () => {
    /**
     * Feature: frontend-interview, Property 15: beforeunload Active Condition
     * Validates: Requirements 3.15
     *
     * For any phase === 'interview', the beforeunload event listener must be
     * registered. For any other phase, it must NOT be registered.
     */
    it('PBT: beforeunload is registered only during interview phase', () => {
      fc.assert(
        fc.property(
          fc.oneof(
            fc.constant('upload' as const),
            fc.constant('waiting' as const),
            fc.constant('interview' as const),
            fc.constant('feedback' as const)
          ),
          (phase) => {
            const addSpy = vi.spyOn(window, 'addEventListener');
            const removeSpy = vi.spyOn(window, 'removeEventListener');
            addSpy.mockClear();
            removeSpy.mockClear();

            mockState = { ...initialState, phase, turnState: 'idle', practiceMode: true, elapsedSeconds: 0 };
            const { unmount } = render(<InterviewScreen />);

            const beforeunloadAddCalls = addSpy.mock.calls.filter(
              (call) => call[0] === 'beforeunload'
            );

            if (phase === 'interview') {
              // beforeunload MUST be registered
              expect(beforeunloadAddCalls.length).toBe(1);
            } else {
              // beforeunload MUST NOT be registered
              expect(beforeunloadAddCalls.length).toBe(0);
            }

            unmount();
            addSpy.mockRestore();
            removeSpy.mockRestore();
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('UserTile — no text-mode UI (Req 4.2, 4.3, 4.4)', () => {
    it('does not render "(Text Mode)" text anywhere in the user tile', () => {
      render(<InterviewScreen />);
      const userTile = screen.getByTestId('user-tile');
      expect(userTile.textContent).not.toContain('(Text Mode)');
      expect(userTile.textContent).not.toContain('Text Mode');
    });

    it('does not render the keyboard icon (⌨️) in the user tile', () => {
      render(<InterviewScreen />);
      const userTile = screen.getByTestId('user-tile');
      expect(userTile.textContent).not.toContain('⌨️');
    });

    it('shows waveform when turnState is user_turn (isActive=true)', () => {
      mockState = { ...mockState, turnState: 'user_turn' };
      render(<InterviewScreen />);
      expect(screen.getByTestId('user-waveform')).toBeInTheDocument();
      // Should NOT show the 👤 icon when active
      const userTile = screen.getByTestId('user-tile');
      const icons = userTile.querySelectorAll('.participant-tile__icon');
      expect(icons.length).toBe(0);
    });

    it('shows 👤 icon when turnState is not user_turn (isActive=false)', () => {
      mockState = { ...mockState, turnState: 'idle' };
      render(<InterviewScreen />);
      const userTile = screen.getByTestId('user-tile');
      const icon = userTile.querySelector('.participant-tile__icon');
      expect(icon).toBeInTheDocument();
      expect(icon?.textContent).toBe('👤');
      // Should NOT show waveform
      expect(screen.queryByTestId('user-waveform')).not.toBeInTheDocument();
    });

    it('does not render "(Text Mode)" even when error is MIC_DENIED', () => {
      mockState = {
        ...mockState,
        error: { code: 'MIC_DENIED', message: 'Mic denied', retryable: false },
      };
      render(<InterviewScreen />);
      const userTile = screen.getByTestId('user-tile');
      expect(userTile.textContent).not.toContain('(Text Mode)');
      expect(userTile.textContent).not.toContain('⌨️');
    });
  });

  describe('ParticipantTiles — no textOnly prop (Req 4.5)', () => {
    it('renders ParticipantTiles without textOnly prop (TypeScript compilation proof)', () => {
      // If this test compiles and renders, it proves ParticipantTiles no longer requires textOnly
      render(<InterviewScreen />);
      const tiles = screen.getByTestId('participant-tiles');
      expect(tiles).toBeInTheDocument();
      expect(screen.getByTestId('ai-tile')).toBeInTheDocument();
      expect(screen.getByTestId('user-tile')).toBeInTheDocument();
    });
  });

  describe('Mic-denied error banner (Req 4.1, 4.6, 4.7)', () => {
    it('renders error banner with correct message when MIC_DENIED', () => {
      mockState = {
        ...mockState,
        error: { code: 'MIC_DENIED', message: 'Mic denied', retryable: false },
      };
      render(<InterviewScreen />);
      const errorBanner = screen.getByTestId('mic-denied-error');
      expect(errorBanner).toBeInTheDocument();
      expect(errorBanner.textContent).toBe(
        'Microphone access is required. Please allow microphone permission in your browser settings and refresh the page.'
      );
    });

    it('error banner has role="alert" for accessibility', () => {
      mockState = {
        ...mockState,
        error: { code: 'MIC_DENIED', message: 'Mic denied', retryable: false },
      };
      render(<InterviewScreen />);
      const errorBanner = screen.getByTestId('mic-denied-error');
      expect(errorBanner).toHaveAttribute('role', 'alert');
    });

    it('does not render mic-denied error banner when no error', () => {
      mockState = { ...mockState, error: null };
      render(<InterviewScreen />);
      expect(screen.queryByTestId('mic-denied-error')).not.toBeInTheDocument();
    });

    it('does not render mic-denied error banner for other error codes', () => {
      mockState = {
        ...mockState,
        error: { code: 'WS_RECONNECT_FAILED', message: 'Connection failed', retryable: false },
      };
      render(<InterviewScreen />);
      expect(screen.queryByTestId('mic-denied-error')).not.toBeInTheDocument();
    });
  });

  describe('Property 16: End Button Always Enabled', () => {
    /**
     * Feature: frontend-interview, Property 16: End Button Always Enabled
     * Validates: Requirements 4.8
     *
     * For any interview screen state, the end button is always enabled
     * (disabled=false) regardless of auto-end signal reception.
     */
    it('PBT: end button is always enabled regardless of session state', () => {
      fc.assert(
        fc.property(
          fc.record({
            turnState: fc.oneof(
              fc.constant('ai_speaking' as const),
              fc.constant('user_turn' as const),
              fc.constant('idle' as const)
            ),
            practiceMode: fc.boolean(),
            elapsedSeconds: fc.nat({ max: 7200 }),
            wsConnectionState: fc.oneof(
              fc.constant('connecting' as const),
              fc.constant('connected' as const),
              fc.constant('reconnecting' as const),
              fc.constant('disconnected' as const)
            ),
            hasError: fc.boolean(),
          }),
          ({ turnState, practiceMode, elapsedSeconds, wsConnectionState, hasError }) => {
            mockState = {
              ...initialState,
              phase: 'interview',
              turnState,
              practiceMode,
              elapsedSeconds,
              wsConnectionState,
              error: hasError
                ? { code: 'WS_RECONNECT_FAILED', message: 'Error', retryable: false }
                : null,
            };

            const { unmount } = render(<InterviewScreen />);

            const endBtn = screen.getByTestId('end-button');
            expect(endBtn).not.toBeDisabled();

            unmount();
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
