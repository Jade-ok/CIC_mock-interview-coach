import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import { WaitingRoom } from '@/components/WaitingRoom';
import type { SessionState } from '@/types/session';
import { initialState } from '@/reducers/sessionReducer';
import fc from 'fast-check';

// Mock agent1Client
vi.mock('@/services/agent1Client', () => ({
  callAgent1: vi.fn(),
}));

// Mock WebSocketClient
vi.mock('@/services/webSocketClient', () => ({
  WebSocketClient: vi.fn().mockImplementation(() => ({
    connect: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn(),
    getState: vi.fn().mockReturnValue('connected'),
    sendSessionStart: vi.fn().mockResolvedValue(undefined),
    onMessage: vi.fn(),
    onDisconnect: vi.fn(),
    onReconnectAttempt: vi.fn(),
    onReconnectSuccess: vi.fn(),
    onReconnectFailed: vi.fn(),
    onSessionInvalid: vi.fn(),
  })),
}));

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

import { callAgent1 } from '@/services/agent1Client';
import { WebSocketClient } from '@/services/webSocketClient';

const mockedCallAgent1 = vi.mocked(callAgent1);
const MockedWebSocketClient = vi.mocked(WebSocketClient);

describe('WaitingRoom', () => {
  const testPdf = new File(['%PDF-1.4 test content'], 'resume.pdf', { type: 'application/pdf' });
  const testJdText = 'Software Engineer at Acme Corp';

  beforeEach(() => {
    vi.useFakeTimers();
    mockState = {
      ...initialState,
      phase: 'waiting',
      uploadedPdf: testPdf,
      uploadedJdText: testJdText,
    };
    mockDispatch.mockClear();
    mockSetWebSocketClient.mockClear();
    mockedCallAgent1.mockClear();
    MockedWebSocketClient.mockClear();

    // Default: agent1 succeeds after a small delay
    mockedCallAgent1.mockResolvedValue({
      nova_sonic_context: 'test-context',
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('Loading State', () => {
    it('displays loading spinner and waiting message', () => {
      render(<WaitingRoom />);

      expect(screen.getByLabelText('Loading')).toBeInTheDocument();
      expect(screen.getByText('Waiting for the host to let you in')).toBeInTheDocument();
    });

    it('shows status items for Agent and WebSocket', () => {
      render(<WaitingRoom />);

      expect(screen.getByText('Agent Analysis')).toBeInTheDocument();
      expect(screen.getByText('Server Connection')).toBeInTheDocument();
    });
  });

  describe('Guard: missing upload data', () => {
    it('dispatches RESET when uploadedPdf is null (e.g. page refresh)', () => {
      mockState = {
        ...initialState,
        phase: 'waiting',
        uploadedPdf: null,
        uploadedJdText: '',
      };

      render(<WaitingRoom />);

      expect(mockDispatch).toHaveBeenCalledWith({ type: 'RESET' });
    });

    it('does not call agent1 when uploadedPdf is null', () => {
      mockState = {
        ...initialState,
        phase: 'waiting',
        uploadedPdf: null,
        uploadedJdText: '',
      };

      render(<WaitingRoom />);

      expect(mockedCallAgent1).not.toHaveBeenCalled();
    });
  });

  describe('Upload data passed to agent1', () => {
    it('calls callAgent1 with the actual pdf and jdText from state', async () => {
      render(<WaitingRoom />);

      // Wait for the async callAgent1 to be invoked
      await act(async () => {
        await Promise.resolve();
      });

      expect(mockedCallAgent1).toHaveBeenCalledWith({
        pdf: testPdf,
        jdText: testJdText,
      });
    });
  });

  describe('30-second Timeout', () => {
    it('dispatches TIMEOUT after 30 seconds if not both ready', () => {
      mockState = {
        ...initialState,
        phase: 'waiting',
        uploadedPdf: testPdf,
        uploadedJdText: testJdText,
        agent1Ready: false,
        wsReady: false,
      };

      render(<WaitingRoom />);

      act(() => {
        vi.advanceTimersByTime(30000);
      });

      expect(mockDispatch).toHaveBeenCalledWith({ type: 'TIMEOUT' });
    });

    it('does not dispatch TIMEOUT if both are ready before 30s', () => {
      mockState = {
        ...initialState,
        phase: 'waiting',
        uploadedPdf: testPdf,
        uploadedJdText: testJdText,
        agent1Ready: true,
        wsReady: true,
      };

      render(<WaitingRoom />);

      act(() => {
        vi.advanceTimersByTime(30000);
      });

      // Should dispatch INTERVIEW_READY instead of TIMEOUT
      expect(mockDispatch).toHaveBeenCalledWith({ type: 'INTERVIEW_READY' });
      expect(mockDispatch).not.toHaveBeenCalledWith({ type: 'TIMEOUT' });
    });
  });

  describe('Error Display', () => {
    it('shows error message when AGENT1_FAILED', () => {
      mockState = {
        ...initialState,
        phase: 'waiting',
        uploadedPdf: testPdf,
        uploadedJdText: testJdText,
        error: {
          code: 'AGENT1_FAILED',
          message: 'Agent 1 요청에 실패했습니다.',
          retryable: true,
        },
      };

      render(<WaitingRoom />);

      expect(screen.getByRole('alert')).toHaveTextContent('Agent 1 요청에 실패했습니다.');
      expect(screen.getByText('Retry')).toBeInTheDocument();
      expect(screen.getByText('Go Back')).toBeInTheDocument();
    });

    it('shows error message when WS connection fails', () => {
      mockState = {
        ...initialState,
        phase: 'waiting',
        uploadedPdf: testPdf,
        uploadedJdText: testJdText,
        error: {
          code: 'WS_CONNECT_FAILED',
          message: 'WebSocket 연결에 실패했습니다.',
          retryable: true,
        },
      };

      render(<WaitingRoom />);

      expect(screen.getByRole('alert')).toHaveTextContent('WebSocket 연결에 실패했습니다.');
      expect(screen.getByText('Retry')).toBeInTheDocument();
    });

    it('shows timeout error with retry button', () => {
      mockState = {
        ...initialState,
        phase: 'waiting',
        uploadedPdf: testPdf,
        uploadedJdText: testJdText,
        error: {
          code: 'TIMEOUT',
          message: 'Connection timed out. Please try again.',
          retryable: true,
        },
      };

      render(<WaitingRoom />);

      expect(screen.getByRole('alert')).toHaveTextContent('Connection timed out. Please try again.');
      expect(screen.getByText('Retry')).toBeInTheDocument();
    });
  });

  describe('Partial Retry', () => {
    it('only retries Agent 1 when WS is already connected', () => {
      mockState = {
        ...initialState,
        phase: 'waiting',
        uploadedPdf: testPdf,
        uploadedJdText: testJdText,
        agent1Ready: false,
        wsReady: false,
        wsConnectionState: 'connected',
        error: {
          code: 'AGENT1_FAILED',
          message: 'Agent 1 failed',
          retryable: true,
        },
      };

      render(<WaitingRoom />);

      fireEvent.click(screen.getByText('Retry'));

      // Agent1 should be called since it wasn't ready
      expect(mockedCallAgent1).toHaveBeenCalled();
    });

    it('only retries WS when Agent 1 already succeeded', () => {
      mockState = {
        ...initialState,
        phase: 'waiting',
        uploadedPdf: testPdf,
        uploadedJdText: testJdText,
        agent1Ready: true,
        wsReady: false,
        wsConnectionState: 'disconnected',
        error: {
          code: 'WS_CONNECT_FAILED',
          message: 'WS failed',
          retryable: true,
        },
      };

      mockedCallAgent1.mockClear();

      render(<WaitingRoom />);

      fireEvent.click(screen.getByText('Retry'));

      // Agent1 should NOT be called again since agent1Ready is true
      expect(mockedCallAgent1).not.toHaveBeenCalled();
      // WS should attempt a new connection
      expect(MockedWebSocketClient).toHaveBeenCalled();
    });
  });

  describe('Both Ready → Interview Transition', () => {
    it('dispatches INTERVIEW_READY when both agent1Ready and wsReady are true', () => {
      mockState = {
        ...initialState,
        phase: 'waiting',
        uploadedPdf: testPdf,
        uploadedJdText: testJdText,
        agent1Ready: true,
        wsReady: true,
      };

      render(<WaitingRoom />);

      expect(mockDispatch).toHaveBeenCalledWith({ type: 'INTERVIEW_READY' });
    });
  });

  describe('Back Button', () => {
    it('dispatches RESET when back button is clicked', () => {
      mockState = {
        ...initialState,
        phase: 'waiting',
        uploadedPdf: testPdf,
        uploadedJdText: testJdText,
        error: {
          code: 'TIMEOUT',
          message: 'Timeout',
          retryable: true,
        },
      };

      render(<WaitingRoom />);

      fireEvent.click(screen.getByText('Go Back'));

      expect(mockDispatch).toHaveBeenCalledWith({ type: 'RESET' });
    });
  });

  describe('Property 3: 대기실 타임아웃', () => {
    /**
     * Feature: frontend-interview, Property 3: 대기실 타임아웃
     * Validates: Requirements 2.5
     *
     * For any Waiting Room entry, if 30s passes without both agent1Ready
     * AND wsReady being true → timeout error is shown.
     */
    it('PBT: timeout always dispatched when 30s elapses without both ready', () => {
      fc.assert(
        fc.property(
          fc.record({
            agent1Ready: fc.boolean(),
            wsReady: fc.boolean(),
          }),
          ({ agent1Ready, wsReady }) => {
            // Only test cases where NOT both are ready
            fc.pre(!agent1Ready || !wsReady);

            mockDispatch.mockClear();
            mockState = {
              ...initialState,
              phase: 'waiting',
              uploadedPdf: testPdf,
              uploadedJdText: testJdText,
              agent1Ready,
              wsReady,
              wsConnectionState: agent1Ready ? 'connected' : 'disconnected',
            };

            const { unmount } = render(<WaitingRoom />);

            act(() => {
              vi.advanceTimersByTime(30000);
            });

            expect(mockDispatch).toHaveBeenCalledWith({ type: 'TIMEOUT' });
            unmount();
          }
        ),
        { numRuns: 100 }
      );
    });

    it('PBT: timeout NOT dispatched when both ready before 30s', () => {
      fc.assert(
        fc.property(
          fc.nat({ max: 29999 }), // any time before 30s
          (elapsedMs) => {
            mockDispatch.mockClear();
            mockState = {
              ...initialState,
              phase: 'waiting',
              uploadedPdf: testPdf,
              uploadedJdText: testJdText,
              agent1Ready: true,
              wsReady: true,
            };

            const { unmount } = render(<WaitingRoom />);

            act(() => {
              vi.advanceTimersByTime(elapsedMs);
            });

            // INTERVIEW_READY should be dispatched, not TIMEOUT
            expect(mockDispatch).not.toHaveBeenCalledWith({ type: 'TIMEOUT' });
            unmount();
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Property 4: 대기실 부분 재시도', () => {
    /**
     * Feature: frontend-interview, Property 4: 대기실 부분 재시도
     * Validates: Requirements 2.4
     *
     * For any partial failure scenario (one of agent1/ws succeeds, other fails),
     * retry only re-requests the failed item and preserves the successful result.
     */
    it('PBT: partial retry only retries the failed item', () => {
      fc.assert(
        fc.property(
          fc.record({
            agent1Succeeded: fc.boolean(),
            wsConnected: fc.boolean(),
          }),
          ({ agent1Succeeded, wsConnected }) => {
            // At least one must have failed and at least one must have succeeded
            fc.pre(agent1Succeeded !== wsConnected);

            mockDispatch.mockClear();
            mockedCallAgent1.mockClear();
            MockedWebSocketClient.mockClear();

            mockState = {
              ...initialState,
              phase: 'waiting',
              uploadedPdf: testPdf,
              uploadedJdText: testJdText,
              agent1Ready: agent1Succeeded,
              wsReady: false,
              wsConnectionState: wsConnected ? 'connected' : 'disconnected',
              error: {
                code: agent1Succeeded ? 'WS_CONNECT_FAILED' : 'AGENT1_FAILED',
                message: 'Something failed',
                retryable: true,
              },
            };

            const { unmount } = render(<WaitingRoom />);

            // Click retry
            const retryBtn = screen.getByText('Retry');
            fireEvent.click(retryBtn);

            if (agent1Succeeded) {
              // Agent1 already succeeded → should NOT be retried
              expect(mockedCallAgent1).not.toHaveBeenCalled();
              // WS should be retried
              expect(MockedWebSocketClient).toHaveBeenCalled();
            } else {
              // WS already connected → should NOT be reconnected
              // Agent1 should be retried
              expect(mockedCallAgent1).toHaveBeenCalled();
            }

            unmount();
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
