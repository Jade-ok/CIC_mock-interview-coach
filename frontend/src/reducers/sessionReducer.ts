import type {
  SessionState,
  SessionAction,
} from '@/types/session';

export const initialState: SessionState = {
  phase: 'upload',
  turnState: 'idle',
  inputMode: 'voice',
  textInputState: 'idle',
  practiceMode: true,
  transcript: [],
  competencyGuides: [],
  novaSonicContext: '',
  elapsedSeconds: 0,
  wsConnectionState: 'disconnected',
  agent1Ready: false,
  wsReady: false,
  error: null,
  agent3Loading: false,
  feedbackResult: null,
  analystOutput: null,
};

export function sessionReducer(
  state: SessionState,
  action: SessionAction
): SessionState {
  switch (action.type) {
    case 'SUBMIT_UPLOAD':
      return {
        ...state,
        phase: 'waiting',
        error: null,
      };

    case 'AGENT1_SUCCESS':
      return {
        ...state,
        agent1Ready: true,
        novaSonicContext: action.payload.nova_sonic_context,
        competencyGuides: action.payload.competency_guides,
        analystOutput: action.payload.analyst_output ?? null,
        error: null,
      };

    case 'AGENT1_FAILED':
      return {
        ...state,
        error: {
          code: 'AGENT1_FAILED',
          message: action.payload.message,
          retryable: true,
        },
      };

    case 'WS_CONNECTED':
      return {
        ...state,
        wsConnectionState: 'connected',
      };

    case 'SESSION_START_ACKED':
      return {
        ...state,
        wsReady: true,
      };

    case 'WS_DISCONNECTED':
      return {
        ...state,
        wsConnectionState:
          state.phase === 'interview' ? 'reconnecting' : 'disconnected',
      };

    case 'WS_RECONNECT_SUCCESS':
      return {
        ...state,
        wsConnectionState: 'connected',
      };

    case 'WS_RECONNECT_FAILED':
      return {
        ...state,
        wsConnectionState: 'disconnected',
        error: {
          code: 'WS_RECONNECT_FAILED',
          message: 'WebSocket reconnection failed after maximum attempts.',
          retryable: false,
        },
        phase: 'upload',
      };

    case 'WS_SESSION_INVALID':
      return {
        ...state,
        error: {
          code: 'WS_SESSION_INVALID',
          message: 'Session is no longer valid. Please start a new session.',
          retryable: false,
        },
      };

    case 'INTERVIEW_READY':
      return {
        ...state,
        phase: 'interview',
        practiceMode: true,
      };

    case 'AI_SPEAKING':
      return {
        ...state,
        turnState: 'ai_speaking',
      };

    case 'USER_TURN':
      return {
        ...state,
        turnState: 'user_turn',
      };

    case 'BARGE_IN':
      return {
        ...state,
        turnState: 'user_turn',
      };

    case 'APPEND_TRANSCRIPT':
      return {
        ...state,
        transcript: [...state.transcript, action.payload],
      };

    case 'TOGGLE_PRACTICE_MODE':
      return {
        ...state,
        practiceMode: !state.practiceMode,
      };

    case 'TEXT_INPUT_START':
      return {
        ...state,
        textInputState: 'composing',
      };

    case 'TEXT_INPUT_CLEAR':
      return {
        ...state,
        textInputState: 'idle',
      };

    case 'END_INTERVIEW':
      return {
        ...state,
        phase: 'feedback',
      };

    case 'AGENT3_LOADING':
      return {
        ...state,
        agent3Loading: true,
        error: null,
      };

    case 'AGENT3_SUCCESS':
      return {
        ...state,
        agent3Loading: false,
        feedbackResult: action.payload,
      };

    case 'AGENT3_FAILED':
      return {
        ...state,
        agent3Loading: false,
        error: {
          code: 'AGENT3_FAILED',
          message: action.payload.message,
          retryable: true,
        },
      };

    case 'TIMEOUT':
      return {
        ...state,
        error: {
          code: 'TIMEOUT',
          message: 'Connection timed out. Please try again.',
          retryable: true,
        },
      };

    case 'MIC_DENIED':
      return {
        ...state,
        inputMode: 'text_only',
        error: {
          code: 'MIC_DENIED',
          message: 'Microphone permission denied. Switching to text-only mode.',
          retryable: false,
        },
      };

    case 'TICK':
      return {
        ...state,
        elapsedSeconds: state.elapsedSeconds + 1,
      };

    case 'RESET':
      return initialState;

    default:
      return state;
  }
}

/**
 * Coordination logic: triggers session_start only when both
 * agent1Ready=true AND wsConnectionState='connected' AND wsReady=false.
 * Called from both AGENT1_SUCCESS and WS_CONNECTED handlers in SessionProvider.
 */
export interface WebSocketClient {
  sendSessionStart(
    novaSonicContext: string,
    inferenceConfig: object
  ): Promise<void>;
}

export function maybeStartSession(
  state: SessionState,
  ws: WebSocketClient,
  dispatch: React.Dispatch<SessionAction>,
  inferenceConfig: object = {}
): void {
  if (
    state.agent1Ready &&
    state.wsConnectionState === 'connected' &&
    !state.wsReady
  ) {
    ws.sendSessionStart(state.novaSonicContext, inferenceConfig)
      .then(() => dispatch({ type: 'SESSION_START_ACKED' }))
      .catch(() =>
        dispatch({
          type: 'AGENT1_FAILED',
          payload: { message: 'Failed to start session via WebSocket.' },
        })
      );
  }
}
