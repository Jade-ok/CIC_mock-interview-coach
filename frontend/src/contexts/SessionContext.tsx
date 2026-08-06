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

  const setWebSocketClient = useCallback((ws: WebSocketClient | null) => {
    wsRef.current = ws;
  }, []);

  // Wrap dispatch to intercept AGENT1_SUCCESS and WS_CONNECTED for coordination
  const coordinatedDispatch: React.Dispatch<SessionAction> = useCallback(
    (action: SessionAction) => {
      dispatch(action);

      // After dispatching, compute the new state to check maybeStartSession conditions.
      // We need to compute what the new state would be after this action.
      if (action.type === 'AGENT1_SUCCESS' || action.type === 'WS_CONNECTED') {
        // Compute the state after applying this action
        const nextState = sessionReducer(state, action);
        if (wsRef.current) {
          maybeStartSession(nextState, wsRef.current, dispatch);
        }
      }
    },
    [state]
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
