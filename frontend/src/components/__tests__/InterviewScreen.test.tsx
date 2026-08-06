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
      practiceMode: true,
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

    it('renders text input with send button', () => {
      render(<InterviewScreen />);
      expect(screen.getByTestId('text-input')).toBeInTheDocument();
      expect(screen.getByTestId('text-send-button')).toBeInTheDocument();
    });

    it('renders guide panel placeholder', () => {
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

    it('end button dispatches END_INTERVIEW on click', () => {
      render(<InterviewScreen />);
      const endBtn = screen.getByTestId('end-button');
      fireEvent.click(endBtn);
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

  describe('TextInput', () => {
    it('send button is disabled when input is empty', () => {
      render(<InterviewScreen />);
      const sendBtn = screen.getByTestId('text-send-button');
      expect(sendBtn).toBeDisabled();
    });

    it('send button is enabled when input has text', () => {
      render(<InterviewScreen />);
      const input = screen.getByLabelText('Text input fallback');
      fireEvent.change(input, { target: { value: 'Hello' } });
      const sendBtn = screen.getByTestId('text-send-button');
      expect(sendBtn).not.toBeDisabled();
    });
  });

  // --- Property-Based Tests ---

  describe('Property 15: beforeunload 활성 조건', () => {
    /**
     * Feature: frontend-interview, Property 15: beforeunload 활성 조건
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

  describe('Property 16: 종료 버튼 항상 활성', () => {
    /**
     * Feature: frontend-interview, Property 16: 종료 버튼 항상 활성
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
