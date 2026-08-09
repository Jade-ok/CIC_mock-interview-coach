import type {
  SessionState,
  SessionAction,
} from '@/types/session';

/**
 * Maximum time gap (ms) between consecutive same-role transcript entries
 * that will be merged into a single entry. Entries arriving within this
 * window from the same speaker are concatenated rather than creating
 * separate bubbles.
 */
const TRANSCRIPT_MERGE_WINDOW_MS = 4000;

export const initialState: SessionState = {
  phase: 'upload',
  turnState: 'idle',
  inputMode: 'voice',
  textInputState: 'idle',
  practiceMode: true,
  uploadData: null,
  analystOutput: null,
  transcript: [],
  livePartial: null,
  novaSonicContext: '',
  elapsedSeconds: 0,
  wsConnectionState: 'disconnected',
  agent1Ready: false,
  wsReady: false,
  error: null,
  agent3Loading: false,
  feedbackResult: null,
  endReason: null,
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
        uploadData: action.payload,
        error: null,
      };

    case 'AGENT1_SUCCESS':
      return {
        ...state,
        agent1Ready: true,
        novaSonicContext: action.payload.nova_sonic_context,
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

    case 'WS_CONNECT_FAILED':
      return {
        ...state,
        wsConnectionState: 'disconnected',
        error: {
          code: 'WS_CONNECT_FAILED',
          message: action.payload.message,
          retryable: true,
        },
      };

    case 'SESSION_START_ACKED':
      return {
        ...state,
        wsReady: true,
      };

    case 'WS_DISCONNECTED':
      return {
        ...state,
        wsReady: false,
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
        phase: 'waiting',
        wsReady: false,
        wsConnectionState: 'disconnected',
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

    case 'APPEND_TRANSCRIPT': {
      const newEntry = action.payload;
      const lastEntry = state.transcript[state.transcript.length - 1];

      // Merge consecutive same-role entries within MERGE_WINDOW_MS
      if (lastEntry && lastEntry.role === newEntry.role) {
        const lastTime = new Date(lastEntry.timestamp).getTime();
        const newTime = new Date(newEntry.timestamp).getTime();

        if (newTime - lastTime < TRANSCRIPT_MERGE_WINDOW_MS) {
          // Append text with a space separator (avoid double spaces)
          const separator = lastEntry.text.endsWith(' ') || newEntry.text.startsWith(' ') ? '' : ' ';
          const mergedEntry = {
            ...lastEntry,
            text: lastEntry.text + separator + newEntry.text,
            timestamp: newEntry.timestamp, // update to latest timestamp
          };
          return {
            ...state,
            transcript: [...state.transcript.slice(0, -1), mergedEntry],
            livePartial: null,
          };
        }
      }

      return {
        ...state,
        transcript: [...state.transcript, newEntry],
        livePartial: null,
      };
    }

    case 'UPDATE_LIVE_PARTIAL':
      return {
        ...state,
        livePartial: action.payload,
      };

    case 'CLEAR_LIVE_PARTIAL':
      return {
        ...state,
        livePartial: null,
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

    case 'INTERVIEW_ENDING': {
      // Flush any pending livePartial into transcript before ending
      const ending = { ...state, turnState: 'ended' as const };
      if (state.livePartial && state.livePartial.role === 'interviewer') {
        return {
          ...ending,
          transcript: [...state.transcript, {
            role: state.livePartial.role,
            text: state.livePartial.text,
            timestamp: new Date().toISOString(),
          }],
          livePartial: null,
        };
      }
      return { ...ending, livePartial: null };
    }

    case 'END_INTERVIEW':
      return {
        ...state,
        phase: 'feedback',
        endReason: action.payload.reason,
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
          retryable: action.payload.retryable ?? true,
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
          message: 'Microphone access is required. Please allow microphone permission in your browser settings and refresh the page.',
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

    case 'RETRY_INTERVIEW':
      return {
        ...initialState,
        // Preserve analysis results so WaitingRoom skips Agent1
        analystOutput: state.analystOutput,
        novaSonicContext: state.novaSonicContext,
        uploadData: state.uploadData,
        agent1Ready: true,
        // Start from waiting phase — WS needs to reconnect
        phase: 'waiting' as const,
      };

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
          type: 'WS_CONNECT_FAILED',
          payload: { message: 'Failed to start session via WebSocket.' },
        })
      );
  }
}
