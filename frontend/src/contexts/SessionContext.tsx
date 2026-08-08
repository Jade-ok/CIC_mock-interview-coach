import React, { createContext, useContext, useReducer, useCallback, useRef, useState } from 'react';
import type { SessionState, SessionAction } from '@/types/session';
import { WebSocketClient as WsClientClass } from '@/services/webSocketClient';
import {
  sessionReducer,
  initialState,
  maybeStartSession,
  type WebSocketClient,
} from '@/reducers/sessionReducer';

interface SessionContextValue {
  state: SessionState;
  dispatch: React.Dispatch<SessionAction>;
  webSocketClient: WsClientClass | null;
  setWebSocketClient: (ws: WsClientClass | null) => void;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(sessionReducer, initialState);
  const wsRef = useRef<WebSocketClient | null>(null);
  const [webSocketClient, setWebSocketClientState] = useState<WsClientClass | null>(null);

  // Eagerly-updated state ref so async coordination always reads the latest state,
  // even between React re-renders.
  const latestStateRef = useRef<SessionState>(initialState);

  const setWebSocketClient = useCallback((ws: WsClientClass | null) => {
    wsRef.current = ws;
    setWebSocketClientState(ws);
  }, []);

  // Wrap dispatch: apply the reducer eagerly to the ref, then call React dispatch.
  // This ensures maybeStartSession always sees the accumulated state.
  const coordinatedDispatch: React.Dispatch<SessionAction> = useCallback(
    (action: SessionAction) => {
      // Eagerly compute next state
      const nextState = sessionReducer(latestStateRef.current, action);
      latestStateRef.current = nextState;

      // Actually dispatch to React (triggers re-render)
      dispatch(action);

      // Coordination: check if we should send session_start
      if (action.type === 'AGENT1_SUCCESS' || action.type === 'WS_CONNECTED') {
        if (wsRef.current) {
          maybeStartSession(nextState, wsRef.current, dispatch);
        }
      }
    },
    [] // stable — reads from refs only
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
