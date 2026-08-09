import { useEffect, useRef, useCallback } from 'react';
import { useSession } from '@/contexts/SessionContext';
import { callAgent1 } from '@/services/agent1Client';
import { getVoiceWebSocketUrl, VoiceSessionError } from '@/services/apiConfig';
import {
  createInterviewSession,
  InterviewAdmissionError,
} from '@/services/interviewSessionClient';
import { WebSocketClient } from '@/services/webSocketClient';
import { MockWebSocketClient } from '@/services/mockWebSocketClient';

const WS_TIMEOUT_MS = 30000;
const SESSION_TIMEOUT_MS = 30000;
// Keep enough time for local 120-second schema recovery plus pipeline overhead.
// Hosted Analyst execution is bounded earlier to one 55-second model attempt.
const AGENT1_TIMEOUT_MS = 330000;
const USE_MOCK_WEBSOCKET = import.meta.env.VITE_USE_MOCK_WEBSOCKET === 'true';

// Mocking is opt-in so local development can exercise the real relay.
const createWsClient = () =>
  USE_MOCK_WEBSOCKET ? new MockWebSocketClient() : new WebSocketClient();

export function WaitingRoom() {
  const { state, dispatch, setWebSocketClient } = useSession();
  const agent1TimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wsTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wsClientRef = useRef<WebSocketClient | MockWebSocketClient | null>(null);
  const agent1CalledRef = useRef(false);
  const sessionCalledRef = useRef(false);
  const wsCalledRef = useRef(false);
  const activeRef = useRef(true);
  const latestStateRef = useRef(state);
  const agent1RequestIdRef = useRef(0);
  const wsRequestIdRef = useRef(0);
  const agent1AbortControllerRef = useRef<AbortController | null>(null);
  latestStateRef.current = state;

  // Admission starts first. The token then authorizes Agent 1 and the voice
  // connection, preventing unauthenticated repetition of paid hosted stages.
  useEffect(() => {
    activeRef.current = true;
    if (state.error?.code === 'WS_SESSION_INVALID') {
      return;
    }
    startRequests();
    startTimeouts();

    return () => {
      activeRef.current = false;
      agent1RequestIdRef.current += 1;
      if (
        !latestStateRef.current.hostedSessionToken
        || !latestStateRef.current.agent1Ready
      ) {
        agent1AbortControllerRef.current?.abort();
        agent1CalledRef.current = false;
      }
      if (!latestStateRef.current.hostedSessionToken) {
        sessionCalledRef.current = false;
      }
      if (latestStateRef.current.wsConnectionState !== 'connected') {
        wsRequestIdRef.current += 1;
        wsClientRef.current?.disconnect();
        wsCalledRef.current = false;
      }
      clearTimeoutTimers();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (state.error) return;
    if (
      state.hostedSessionToken
      && !state.agent1Ready
      && !agent1CalledRef.current
    ) {
      startAgent1(state.hostedSessionToken);
      startTimeouts();
    }
    if (
      state.hostedSessionToken
      && state.agent1Ready
      && state.wsConnectionState === 'disconnected'
      && !wsCalledRef.current
    ) {
      startWebSocket(state.hostedSessionToken);
      startTimeouts();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    state.hostedSessionToken,
    state.agent1Ready,
    state.wsConnectionState,
    state.error,
  ]);

  // Watch for both ready → dispatch INTERVIEW_READY
  useEffect(() => {
    if (state.agent1Ready) clearAgent1Timeout();
    if (state.wsConnectionState === 'connected') clearWsTimeout();
    if (state.agent1Ready && state.wsReady) {
      clearTimeoutTimers();
      dispatch({ type: 'INTERVIEW_READY' });
    }
  }, [state.agent1Ready, state.wsReady, state.wsConnectionState, dispatch]);

  const startTimeouts = useCallback(() => {
    clearTimeoutTimers();
    const currentState = latestStateRef.current;
    if (!currentState.hostedSessionToken || !currentState.agent1Ready) {
      const waitingForAdmission = !currentState.hostedSessionToken;
      agent1TimeoutRef.current = setTimeout(() => {
        if (!activeRef.current) return;
        agent1RequestIdRef.current += 1;
        agent1CalledRef.current = false;
        agent1AbortControllerRef.current?.abort();
        dispatch({
          type: 'AGENT1_FAILED',
          payload: {
            message: waitingForAdmission
              ? 'Starting the interview timed out. Please try again.'
              : 'Resume analysis timed out. Please try again.',
          },
        });
      }, waitingForAdmission ? SESSION_TIMEOUT_MS : AGENT1_TIMEOUT_MS);
    }
    if (
      currentState.hostedSessionToken
      && currentState.agent1Ready
      && currentState.wsConnectionState !== 'connected'
    ) {
      wsTimeoutRef.current = setTimeout(() => {
        if (!activeRef.current) return;
        wsRequestIdRef.current += 1;
        wsCalledRef.current = false;
        wsClientRef.current?.disconnect();
        dispatch({
          type: 'WS_CONNECT_FAILED',
          payload: { message: 'Server connection timed out. Please try again.' },
        });
      }, WS_TIMEOUT_MS);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const clearAgent1Timeout = useCallback(() => {
    if (agent1TimeoutRef.current) {
      clearTimeout(agent1TimeoutRef.current);
      agent1TimeoutRef.current = null;
    }
  }, []);

  const clearWsTimeout = useCallback(() => {
    if (wsTimeoutRef.current) {
      clearTimeout(wsTimeoutRef.current);
      wsTimeoutRef.current = null;
    }
  }, []);

  const clearTimeoutTimers = useCallback(() => {
    clearAgent1Timeout();
    clearWsTimeout();
  }, [clearAgent1Timeout, clearWsTimeout]);

  const startRequests = useCallback(() => {
    if (!state.hostedSessionToken && !sessionCalledRef.current) {
      startSession();
    } else if (
      state.hostedSessionToken
      && !state.agent1Ready
      && !agent1CalledRef.current
    ) {
      startAgent1(state.hostedSessionToken);
    } else if (
      state.hostedSessionToken
      && state.agent1Ready
      && state.wsConnectionState === 'disconnected'
      && !wsCalledRef.current
    ) {
      startWebSocket(state.hostedSessionToken);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startSession = useCallback(async () => {
    sessionCalledRef.current = true;
    const requestId = ++agent1RequestIdRef.current;
    const abortController = new AbortController();
    agent1AbortControllerRef.current = abortController;
    try {
      const sessionToken = await createInterviewSession(abortController.signal);
      if (!activeRef.current || requestId !== agent1RequestIdRef.current) return;
      dispatch({ type: 'SESSION_TOKEN_READY', payload: { sessionToken } });
    } catch (err) {
      if (!activeRef.current || requestId !== agent1RequestIdRef.current) return;
      sessionCalledRef.current = false;
      dispatch({
        type: 'AGENT1_FAILED',
        payload: {
          message: err instanceof Error ? err.message : 'Unable to start an interview.',
          retryable: err instanceof InterviewAdmissionError ? err.retryable : true,
        },
      });
    } finally {
      if (requestId === agent1RequestIdRef.current) {
        agent1AbortControllerRef.current = null;
      }
    }
  }, [dispatch]);

  const startAgent1 = useCallback(async (sessionToken: string) => {
    agent1CalledRef.current = true;
    const requestId = ++agent1RequestIdRef.current;
    const abortController = new AbortController();
    agent1AbortControllerRef.current = abortController;
    try {
      if (!state.uploadData) {
        throw new Error('Upload data is missing. Please return and upload your résumé again.');
      }
      const response = await callAgent1(
        latestStateRef.current.uploadData!,
        sessionToken,
        abortController.signal
      );
      if (!activeRef.current || requestId !== agent1RequestIdRef.current) return;
      dispatch({ type: 'AGENT1_SUCCESS', payload: response });
    } catch (err) {
      if (!activeRef.current || requestId !== agent1RequestIdRef.current) return;
      agent1CalledRef.current = false;
      dispatch({
        type: 'AGENT1_FAILED',
        payload: {
          message: err instanceof Error ? err.message : 'Agent 1 request failed.',
          retryable: err instanceof InterviewAdmissionError ? err.retryable : true,
        },
      });
    } finally {
      if (requestId === agent1RequestIdRef.current) {
        agent1AbortControllerRef.current = null;
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dispatch]);

  const startWebSocket = useCallback(async (sessionToken: string) => {
    wsCalledRef.current = true;
    const requestId = ++wsRequestIdRef.current;
    const wsClient = createWsClient();
    wsClientRef.current = wsClient;
    setWebSocketClient(wsClient as any);
    const isCurrentRequest = () => (
      activeRef.current
      && requestId === wsRequestIdRef.current
      && wsClientRef.current === wsClient
    );
    wsClient.onDisconnect = (reason) => {
      if (!isCurrentRequest()) return;
      dispatch({ type: 'WS_DISCONNECTED', payload: { reason } });
    };
    wsClient.onReconnectSuccess = () => {
      if (!isCurrentRequest()) return;
      dispatch({ type: 'WS_RECONNECT_SUCCESS' });
    };
    wsClient.onReconnectFailed = () => {
      if (!isCurrentRequest()) return;
      dispatch({ type: 'WS_RECONNECT_FAILED' });
    };
    wsClient.onSessionInvalid = () => {
      if (!isCurrentRequest()) return;
      dispatch({ type: 'WS_SESSION_INVALID' });
    };

    try {
      await wsClient.connect({
        urlProvider: () => getVoiceWebSocketUrl(sessionToken),
        maxReconnectAttempts: 2,
        reconnectDelayMs: [1000, 2000],
      });
      if (!isCurrentRequest()) return;
      dispatch({ type: 'WS_CONNECTED' });
    } catch (err) {
      if (!isCurrentRequest()) return;
      wsCalledRef.current = false;
      dispatch({
        type: 'WS_CONNECT_FAILED',
        payload: {
          message: err instanceof Error ? err.message : 'WebSocket connection failed.',
          retryable: err instanceof VoiceSessionError ? err.retryable : true,
        },
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dispatch, setWebSocketClient]);

  const handleRetry = useCallback(() => {
    // Clear error
    // Partial retry: only retry failed items
    if (!state.agent1Ready && state.error?.code === 'AGENT1_FAILED') {
      if (!state.hostedSessionToken) {
        sessionCalledRef.current = false;
        startSession();
      } else {
        agent1CalledRef.current = false;
        startAgent1(state.hostedSessionToken);
      }
    }
    if (
      state.hostedSessionToken
      && state.agent1Ready
      && !state.wsReady
      && state.wsConnectionState !== 'connected'
    ) {
      wsCalledRef.current = false;
      startWebSocket(state.hostedSessionToken);
    } else if (
      !state.wsReady
      && state.wsConnectionState === 'connected'
      && state.agent1Ready
      && wsClientRef.current
    ) {
      wsClientRef.current
        .sendSessionStart(state.novaSonicContext, {})
        .then(() => dispatch({ type: 'SESSION_START_ACKED' }))
        .catch(() => dispatch({
          type: 'WS_CONNECT_FAILED',
          payload: { message: 'Failed to start session via WebSocket.' },
        }));
    }
    // Restart only the timeout for the dependency being retried.
    startTimeouts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    state.agent1Ready,
    state.hostedSessionToken,
    state.wsReady,
    state.wsConnectionState,
    state.novaSonicContext,
    state.error,
    dispatch,
    startAgent1,
    startSession,
    startWebSocket,
    startTimeouts,
  ]);

  const handleBack = useCallback(() => {
    activeRef.current = false;
    agent1RequestIdRef.current += 1;
    wsRequestIdRef.current += 1;
    agent1AbortControllerRef.current?.abort();
    // Clean up WS if connected
    if (wsClientRef.current) {
      wsClientRef.current.disconnect();
      wsClientRef.current = null;
    }
    setWebSocketClient(null);
    clearTimeoutTimers();
    dispatch({ type: 'RESET' });
  }, [dispatch, clearTimeoutTimers, setWebSocketClient]);

  const hasError = state.error !== null;

  return (
    <div className="waiting-room">
      <div className="waiting-room__container">
        {!hasError ? (
          <>
            <div className="waiting-room__spinner" aria-label="Loading">
              <div className="waiting-room__spinner-circle" />
            </div>
            <p className="waiting-room__message">
              We are preparing your interview
            </p>
            <div className="waiting-room__status">
              <StatusItem label="Reading your resume 📑" ready={state.agent1Ready} />
              <StatusItem label="Connecting to your interviewer 🤖" ready={state.wsReady} />
            </div>
          </>
        ) : (
          <>
            <div className="waiting-room__error-icon" aria-hidden="true">
              ⚠️
            </div>
            <p className="waiting-room__error-message" role="alert">
              {state.error!.message}
            </p>
            <div className="waiting-room__actions">
              {state.error!.retryable && (
                <button
                  className="waiting-room__retry-btn"
                  onClick={handleRetry}
                  type="button"
                >
                  Retry
                </button>
              )}
              <button
                className="waiting-room__back-btn"
                onClick={handleBack}
                type="button"
              >
                Go Back
              </button>
            </div>
          </>
        )}
      </div>

      <style>{`
        .waiting-room {
          min-height: 100vh;
          background-color: var(--color-canvas, #0A0A0A);
          display: flex;
          align-items: center;
          justify-content: center;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        }

        .waiting-room__container {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 24px;
          padding: 48px;
          max-width: 400px;
          text-align: center;
        }

        .waiting-room__spinner {
          width: 48px;
          height: 48px;
          position: relative;
        }

        .waiting-room__spinner-circle {
          width: 100%;
          height: 100%;
          border: 3px solid var(--color-tile-bg, #1C1C1E);
          border-top-color: var(--color-accent, #9AE05C);
          border-radius: 50%;
          animation: spin 1s linear infinite;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        .waiting-room__message {
          color: var(--color-text-primary, #FFFFFF);
          font-size: 18px;
          font-weight: 500;
          margin: 0;
        }

        .waiting-room__status {
          display: flex;
          flex-direction: column;
          gap: 8px;
          width: 100%;
        }

        .waiting-room__status-item {
          display: flex;
          align-items: center;
          gap: 8px;
          color: var(--color-text-secondary, #A0A0A5);
          font-size: 14px;
        }

        .waiting-room__status-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background-color: var(--color-text-secondary, #A0A0A5);
        }

        .waiting-room__status-dot--ready {
          background-color: var(--color-accent, #9AE05C);
        }

        .waiting-room__error-icon {
          font-size: 48px;
        }

        .waiting-room__error-message {
          color: var(--color-error, #FF5C5C);
          font-size: 16px;
          margin: 0;
        }

        .waiting-room__actions {
          display: flex;
          gap: 12px;
        }

        .waiting-room__retry-btn {
          background-color: var(--color-accent, #9AE05C);
          color: var(--color-canvas, #0A0A0A);
          border: none;
          border-radius: 8px;
          padding: 10px 20px;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          transition: opacity 0.2s;
        }

        .waiting-room__retry-btn:hover {
          opacity: 0.9;
        }

        .waiting-room__back-btn {
          background-color: transparent;
          color: var(--color-text-secondary, #A0A0A5);
          border: 1px solid var(--color-text-secondary, #A0A0A5);
          border-radius: 8px;
          padding: 10px 20px;
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
          transition: opacity 0.2s, border-color 0.2s;
        }

        .waiting-room__back-btn:hover {
          border-color: var(--color-text-primary, #FFFFFF);
          color: var(--color-text-primary, #FFFFFF);
        }
      `}</style>
    </div>
  );
}

function StatusItem({ label, ready }: { label: string; ready: boolean }) {
  return (
    <div className="waiting-room__status-item">
      <span className={`waiting-room__status-dot ${ready ? 'waiting-room__status-dot--ready' : ''}`} />
      <span>{label}</span>
      <span>{ready ? '✓' : '...'}</span>
    </div>
  );
}
