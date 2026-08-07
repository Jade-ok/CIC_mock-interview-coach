import React, { createContext, useContext, useReducer, useCallback, useRef, useState } from 'react';
import type { SessionState, SessionAction } from '@/types/session';
import type { WebSocketClient as VoiceWebSocketClient } from '@/services/webSocketClient';
import type { MockWebSocketClient } from '@/services/mockWebSocketClient';
import {
  sessionReducer,
  initialState,
  maybeStartSession,
  type WebSocketClient,
} from '@/reducers/sessionReducer';

interface SessionContextValue {
  state: SessionState;
  dispatch: React.Dispatch<SessionAction>;
  webSocketClient: VoiceWebSocketClient | MockWebSocketClient | null;
  setWebSocketClient: (ws: VoiceWebSocketClient | MockWebSocketClient | null) => void;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(sessionReducer, initialState);
  const wsRef = useRef<WebSocketClient | null>(null);
  const [webSocketClient, setWebSocketClientState] = useState<
    VoiceWebSocketClient | MockWebSocketClient | null
  >(null);

  // Eagerly-updated state ref so async coordination always reads the latest state,
  // even between React re-renders.
  const latestStateRef = useRef<SessionState>(initialState);

  const setWebSocketClient = useCallback((ws: VoiceWebSocketClient | MockWebSocketClient | null) => {
    wsRef.current = ws;
    setWebSocketClientState(ws);
  }, []);

  const commitAction: React.Dispatch<SessionAction> = useCallback(
    (action: SessionAction) => {
      latestStateRef.current = sessionReducer(latestStateRef.current, action);
      dispatch(action);
    },
    []
  );

  // Wrap dispatch: apply the reducer eagerly to the ref, then call React dispatch.
  // This ensures maybeStartSession always sees the accumulated state.
  const coordinatedDispatch: React.Dispatch<SessionAction> = useCallback(
    (action: SessionAction) => {
      // Eagerly compute next state
      commitAction(action);
      const nextState = latestStateRef.current;

      // Coordination: check if we should send session_start
      if (
        action.type === 'AGENT1_SUCCESS'
        || action.type === 'WS_CONNECTED'
        || action.type === 'WS_RECONNECT_SUCCESS'
      ) {
        if (wsRef.current) {
          maybeStartSession(nextState, wsRef.current, commitAction);
        }
      }
    },
    [commitAction]
  );

  return (
    <SessionContext.Provider
      value={{ state, dispatch: coordinatedDispatch, webSocketClient, setWebSocketClient }}
    >
      {children}
    </SessionContext.Provider>
  );
}

export function useSession(): SessionContextValue {
  const context = useContext(SessionContext);
  if (!context) {
    throw new Error('useSession must be used within a SessionProvider');
  }
  return context;
}

export { SessionContext };
