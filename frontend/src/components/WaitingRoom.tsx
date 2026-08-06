import { useEffect, useRef, useCallback } from 'react';
import { useSession } from '@/contexts/SessionContext';
import { callAgent1 } from '@/services/agent1Client';
import { WebSocketClient } from '@/services/webSocketClient';
import { MockWebSocketClient } from '@/services/mockWebSocketClient';

const TIMEOUT_MS = 30000;
const WS_URL = 'ws://localhost:8080';

// Use mock in dev mode so the demo transitions without a real backend
const createWsClient = () =>
  import.meta.env.DEV ? new MockWebSocketClient() : new WebSocketClient();

export function WaitingRoom() {
  const { state, dispatch, setWebSocketClient } = useSession();
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wsClientRef = useRef<WebSocketClient | MockWebSocketClient | null>(null);
  const agent1CalledRef = useRef(false);
  const wsCalledRef = useRef(false);

  // Track cached upload data for retries
  const uploadDataRef = useRef<{ pdf: File; jdText: string } | null>(null);

  // Start parallel requests on mount
  useEffect(() => {
    startRequests();
    startTimeout();

    return () => {
      clearTimeoutTimer();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Watch for both ready → dispatch INTERVIEW_READY
  useEffect(() => {
    if (state.agent1Ready && state.wsReady) {
      clearTimeoutTimer();
      dispatch({ type: 'INTERVIEW_READY' });
    }
  }, [state.agent1Ready, state.wsReady, dispatch]);

  const startTimeout = useCallback(() => {
    clearTimeoutTimer();
    timeoutRef.current = setTimeout(() => {
      if (!state.agent1Ready || !state.wsReady) {
        dispatch({ type: 'TIMEOUT' });
      }
    }, TIMEOUT_MS);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const clearTimeoutTimer = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  const startRequests = useCallback(() => {
    if (!state.agent1Ready && !agent1CalledRef.current) {
      startAgent1();
    }
    if (state.wsConnectionState === 'disconnected' && !wsCalledRef.current) {
      startWebSocket();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startAgent1 = useCallback(async () => {
    agent1CalledRef.current = true;
    try {
      // Get upload data from the stored ref or create a placeholder
      const data = uploadDataRef.current || { pdf: new File([], 'resume.pdf'), jdText: '' };
      const response = await callAgent1(data);
      dispatch({ type: 'AGENT1_SUCCESS', payload: response });
    } catch (err) {
      agent1CalledRef.current = false;
      dispatch({
        type: 'AGENT1_FAILED',
        payload: { message: err instanceof Error ? err.message : 'Agent 1 request failed.' },
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dispatch]);

  const startWebSocket = useCallback(async () => {
    wsCalledRef.current = true;
    const wsClient = createWsClient();
    wsClientRef.current = wsClient;
    setWebSocketClient(wsClient as any);

    try {
      await wsClient.connect({ url: WS_URL, maxReconnectAttempts: 2, reconnectDelayMs: [1000, 2000] });
      dispatch({ type: 'WS_CONNECTED' });
    } catch (err) {
      wsCalledRef.current = false;
      dispatch({
        type: 'AGENT1_FAILED',
        payload: { message: err instanceof Error ? err.message : 'WebSocket connection failed.' },
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dispatch, setWebSocketClient]);

  const handleRetry = useCallback(() => {
    // Clear error
    // Partial retry: only retry failed items
    if (!state.agent1Ready) {
      agent1CalledRef.current = false;
      startAgent1();
    }
    if (!state.wsReady && state.wsConnectionState !== 'connected') {
      wsCalledRef.current = false;
      startWebSocket();
    }
    // Restart timeout
    startTimeout();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.agent1Ready, state.wsReady, state.wsConnectionState]);

  const handleBack = useCallback(() => {
    // Clean up WS if connected
    if (wsClientRef.current) {
      wsClientRef.current.disconnect();
      wsClientRef.current = null;
    }
    clearTimeoutTimer();
    dispatch({ type: 'RESET' });
  }, [dispatch, clearTimeoutTimer]);

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
              Waiting for the host to let you in
            </p>
            <div className="waiting-room__status">
              <StatusItem label="Agent Analysis" ready={state.agent1Ready} />
              <StatusItem label="Server Connection" ready={state.wsReady} />
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
