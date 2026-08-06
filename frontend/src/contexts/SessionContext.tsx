import React, { createContext, useContext, useReducer, useCallback, useRef } from 'react';
import type { SessionState, SessionAction } from '@/types/session';
import {
  sessionReducer,
  initialState,
  maybeStartSession,
  type WebSocketClient,
} from '@/reducers/sessionReducer';

interface SessionContextValue {
  state: SessionState;
  dispatch: React.Dispatch<SessionAction>;
  setWebSocketClient: (ws: WebSocketClient | null) => void;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(sessionReducer, initialState);
  const wsRef = useRef<WebSocketClient | null>(null);
  // Keep a ref to the latest state so coordinatedDispatch always sees fresh data
  const stateRef = useRef<SessionState>(state);
  stateRef.current = state;

  const setWebSocketClient = useCallback((ws: WebSocketClient | null) => {
    wsRef.current = ws;
  }, []);

  // Wrap dispatch to intercept AGENT1_SUCCESS and WS_CONNECTED for coordination.
  // Uses stateRef to avoid stale closure issues.
  const coordinatedDispatch: React.Dispatch<SessionAction> = useCallback(
    (action: SessionAction) => {
      dispatch(action);

      if (action.type === 'AGENT1_SUCCESS' || action.type === 'WS_CONNECTED') {
        // Compute the state after applying this action against the latest known state
        const nextState = sessionReducer(stateRef.current, action);
        if (wsRef.current) {
          maybeStartSession(nextState, wsRef.current, dispatch);
        }
      }
    },
    [] // stable — reads from refs
  );

  return (
    <SessionContext.Provider
      value={{ state, dispatch: coordinatedDispatch, setWebSocketClient }}
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
