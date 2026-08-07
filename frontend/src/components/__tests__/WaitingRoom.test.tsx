import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import { StrictMode } from 'react';
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
  beforeEach(() => {
    vi.useFakeTimers();
    mockState = {
      ...initialState,
      phase: 'waiting',
      uploadData: { pdf: new File(['resume'], 'resume.pdf'), jdText: 'job' },
    };
    mockDispatch.mockClear();
    mockSetWebSocketClient.mockClear();
    mockedCallAgent1.mockClear();
    MockedWebSocketClient.mockClear();

    // Default: agent1 succeeds after a small delay
    mockedCallAgent1.mockResolvedValue({
      nova_sonic_context: 'test-context',
      competency_guides: [],
      analyst_output: {},
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

  describe('Dependency timeouts', () => {
    it('dispatches a WebSocket failure after 30 seconds if the socket is not connected', () => {
      mockState = {
        ...initialState,
        phase: 'waiting',
        agent1Ready: false,
        wsReady: false,
      };

      render(<WaitingRoom />);

      act(() => {
        vi.advanceTimersByTime(30000);
      });

      expect(mockDispatch).toHaveBeenCalledWith({
        type: 'WS_CONNECT_FAILED',
        payload: { message: 'Server connection timed out. Please try again.' },
      });
    });

    it('does not dispatch TIMEOUT if both are ready before 30s', () => {
      mockState = {
        ...initialState,
        phase: 'waiting',
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

    it('allows a connected socket to wait for a slow Agent 1 response', () => {
      mockState = {
        ...initialState,
        phase: 'waiting',
        agent1Ready: false,
        wsConnectionState: 'connected',
        uploadData: { pdf: new File(['resume'], 'resume.pdf'), jdText: 'job' },
      };
      mockedCallAgent1.mockReturnValue(new Promise(() => {}));

      render(<WaitingRoom />);
      act(() => vi.advanceTimersByTime(30000));
      expect(mockDispatch).not.toHaveBeenCalledWith(
        expect.objectContaining({ type: 'AGENT1_FAILED' })
      );

      act(() => vi.advanceTimersByTime(300000));
      expect(mockDispatch).toHaveBeenCalledWith({
        type: 'AGENT1_FAILED',
        payload: { message: 'Resume analysis timed out. Please try again.' },
      });
    });

    it('ignores an Agent 1 response after the waiting room unmounts', async () => {
      let resolveAgent1!: (value: Awaited<ReturnType<typeof callAgent1>>) => void;
      mockedCallAgent1.mockReturnValue(new Promise((resolve) => {
        resolveAgent1 = resolve;
      }));
      const { unmount } = render(<WaitingRoom />);
      unmount();
      mockDispatch.mockClear();

      await act(async () => {
        resolveAgent1({
          nova_sonic_context: 'stale-context',
          competency_guides: [],
          analyst_output: { stale: true },
        });
      });

      expect(mockDispatch).not.toHaveBeenCalledWith(
        expect.objectContaining({ type: 'AGENT1_SUCCESS' })
      );
    });
  });

  describe('Error Display', () => {
    it('shows error message when AGENT1_FAILED', () => {
      mockState = {
        ...initialState,
        phase: 'waiting',
        error: {
          code: 'AGENT1_FAILED',
          message: 'Agent 1 request failed.',
          retryable: true,
        },
      };

      render(<WaitingRoom />);

      expect(screen.getByRole('alert')).toHaveTextContent('Agent 1 request failed.');
      expect(screen.getByText('Retry')).toBeInTheDocument();
      expect(screen.getByText('Go Back')).toBeInTheDocument();
    });

    it('shows error message when WS connection fails', () => {
      mockState = {
        ...initialState,
        phase: 'waiting',
        error: {
          code: 'WS_CONNECT_FAILED',
          message: 'WebSocket connection failed.',
          retryable: true,
        },
      };

      render(<WaitingRoom />);

      expect(screen.getByRole('alert')).toHaveTextContent('WebSocket connection failed.');
      expect(screen.getByText('Retry')).toBeInTheDocument();
    });

    it('shows timeout error with retry button', () => {
      mockState = {
        ...initialState,
        phase: 'waiting',
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

    it('shows an invalid-session recovery screen without starting new requests', () => {
      mockState = {
        ...initialState,
        phase: 'waiting',
        error: {
          code: 'WS_SESSION_INVALID',
          message: 'Session is no longer valid. Please start a new session.',
          retryable: false,
        },
      };

      render(<WaitingRoom />);

      expect(screen.getByRole('alert')).toHaveTextContent('Session is no longer valid');
      expect(screen.getByText('Go Back')).toBeInTheDocument();
      expect(screen.queryByText('Retry')).not.toBeInTheDocument();
      expect(mockedCallAgent1).not.toHaveBeenCalled();
      expect(MockedWebSocketClient).not.toHaveBeenCalled();
    });
  });

  describe('Partial Retry', () => {
    it('only retries Agent 1 when WS is already connected', () => {
      mockState = {
        ...initialState,
        phase: 'waiting',
        agent1Ready: false,
        wsReady: false,
        wsConnectionState: 'connected',
        uploadData: { pdf: new File(['resume'], 'resume.pdf'), jdText: 'job' },
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

    it('does not start a stale WebSocket timeout when retrying Agent 1', () => {
      mockState = {
        ...initialState,
        phase: 'waiting',
        agent1Ready: false,
        wsReady: false,
        wsConnectionState: 'connected',
        uploadData: { pdf: new File(['resume'], 'resume.pdf'), jdText: 'job' },
        error: {
          code: 'AGENT1_FAILED',
          message: 'Agent 1 failed',
          retryable: true,
        },
      };
      mockedCallAgent1.mockReturnValue(new Promise(() => {}));

      render(<WaitingRoom />);
      fireEvent.click(screen.getByText('Retry'));
      act(() => vi.advanceTimersByTime(30000));

      expect(mockDispatch).not.toHaveBeenCalledWith(
        expect.objectContaining({ type: 'WS_CONNECT_FAILED' })
      );
    });

    it('only retries WS when Agent 1 already succeeded', () => {
      mockState = {
        ...initialState,
        phase: 'waiting',
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

  describe('stale WebSocket callbacks', () => {
    it('ignores the first mount callbacks under React Strict Mode', async () => {
      render(
        <StrictMode>
          <WaitingRoom />
        </StrictMode>
      );

      await act(async () => {
        await Promise.resolve();
      });

      expect(mockDispatch.mock.calls.filter(([action]) => action.type === 'WS_CONNECTED')).toHaveLength(1);
      expect(mockDispatch.mock.calls.filter(([action]) => action.type === 'AGENT1_SUCCESS')).toHaveLength(1);
    });

    it('ignores a WebSocket connection that resolves after unmount', async () => {
      let resolveConnection!: () => void;
      const staleClient = {
        connect: vi.fn().mockReturnValue(new Promise<void>((resolve) => {
          resolveConnection = resolve;
        })),
        disconnect: vi.fn(),
        getState: vi.fn().mockReturnValue('connecting'),
        sendSessionStart: vi.fn(),
        onMessage: vi.fn(),
        onDisconnect: vi.fn(),
        onReconnectAttempt: vi.fn(),
        onReconnectSuccess: vi.fn(),
        onReconnectFailed: vi.fn(),
        onSessionInvalid: vi.fn(),
      };
      MockedWebSocketClient.mockImplementationOnce(
        () => staleClient as unknown as InstanceType<typeof WebSocketClient>
      );

      const { unmount } = render(<WaitingRoom />);
      unmount();
      mockDispatch.mockClear();
      await act(async () => resolveConnection());

      expect(mockDispatch).not.toHaveBeenCalledWith({ type: 'WS_CONNECTED' });
    });
  });

  describe('Both Ready → Interview Transition', () => {
    it('dispatches INTERVIEW_READY when both agent1Ready and wsReady are true', () => {
      mockState = {
        ...initialState,
        phase: 'waiting',
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

  describe('Property 3: waiting-room timeout', () => {
    /**
     * Feature: frontend-interview, Property 3: waiting-room timeout
     * Validates: Requirements 2.5
     *
     * A disconnected voice relay has its own 30-second timeout. Agent 1 has a
     * longer timeout because its Bedrock analysis can legitimately take minutes.
     */
    it('PBT: a disconnected WebSocket always times out after 30 seconds', () => {
      fc.assert(
        fc.property(
          fc.record({
            agent1Ready: fc.boolean(),
            wsReady: fc.boolean(),
          }),
          ({ agent1Ready, wsReady }) => {
            fc.pre(!wsReady);

            mockDispatch.mockClear();
            mockState = {
              ...initialState,
              phase: 'waiting',
              agent1Ready,
              wsReady,
              wsConnectionState: 'disconnected',
            };

            const { unmount } = render(<WaitingRoom />);

            act(() => {
              vi.advanceTimersByTime(30000);
            });

            expect(mockDispatch).toHaveBeenCalledWith(
              expect.objectContaining({ type: 'WS_CONNECT_FAILED' })
            );
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

  describe('Property 4: partial waiting-room retry', () => {
    /**
     * Feature: frontend-interview, Property 4: partial waiting-room retry
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
              agent1Ready: agent1Succeeded,
              wsReady: false,
              wsConnectionState: wsConnected ? 'connected' : 'disconnected',
              uploadData: { pdf: new File(['resume'], 'resume.pdf'), jdText: 'job' },
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
