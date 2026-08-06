export type InterviewPhase = 'upload' | 'waiting' | 'interview' | 'feedback';
export type TurnState = 'ai_speaking' | 'user_turn' | 'idle';
export type InputMode = 'voice' | 'text_only';
export type TextInputState = 'idle' | 'composing';

export interface SessionState {
  phase: InterviewPhase;
  turnState: TurnState;
  inputMode: InputMode;
  textInputState: TextInputState;
  practiceMode: boolean;
  transcript: TranscriptEntry[];
  competencyGuides: CompetencyGuide[];
  novaSonicContext: string;
  elapsedSeconds: number;
  wsConnectionState: 'connecting' | 'connected' | 'reconnecting' | 'disconnected';
  agent1Ready: boolean;
  wsReady: boolean;
  error: SessionError | null;
  agent3Loading: boolean;
  feedbackResult: unknown;
}

export interface TranscriptEntry {
  role: 'interviewer' | 'user';
  text: string;
  timestamp: string; // ISO 8601
}

export interface CompetencyGuide {
  id: string;
  title: string;
  keywords: string[];
  description: string;
  highlighted: boolean;
}

export interface SessionError {
  code:
    | 'AGENT1_FAILED'
    | 'WS_CONNECT_FAILED'
    | 'WS_RECONNECT_FAILED'
    | 'WS_SESSION_INVALID'
    | 'TIMEOUT'
    | 'MIC_DENIED'
    | 'AGENT3_FAILED'
    | 'FILE_INVALID';
  message: string;
  retryable: boolean;
}

export type SessionAction =
  | { type: 'SUBMIT_UPLOAD'; payload: { pdf: File; jdText: string } }
  | { type: 'AGENT1_SUCCESS'; payload: Agent1Response }
  | { type: 'AGENT1_FAILED'; payload: { message: string } }
  | { type: 'WS_CONNECTED' }
  | { type: 'SESSION_START_ACKED' }
  | { type: 'WS_DISCONNECTED'; payload: { reason: string } }
  | { type: 'WS_RECONNECT_SUCCESS' }
  | { type: 'WS_RECONNECT_FAILED' }
  | { type: 'WS_SESSION_INVALID' }
  | { type: 'INTERVIEW_READY' }
  | { type: 'AI_SPEAKING' }
  | { type: 'USER_TURN' }
  | { type: 'BARGE_IN' }
  | { type: 'APPEND_TRANSCRIPT'; payload: TranscriptEntry }
  | { type: 'TOGGLE_PRACTICE_MODE' }
  | { type: 'TEXT_INPUT_START' }
  | { type: 'TEXT_INPUT_CLEAR' }
  | { type: 'END_INTERVIEW'; payload: { reason: 'auto' | 'manual' } }
  | { type: 'AGENT3_LOADING' }
  | { type: 'AGENT3_SUCCESS'; payload: unknown }
  | { type: 'AGENT3_FAILED'; payload: { message: string } }
  | { type: 'TIMEOUT' }
  | { type: 'MIC_DENIED' }
  | { type: 'TICK' }
  | { type: 'RESET' };

export interface Agent1Response {
  nova_sonic_context: string;
  competency_guides: CompetencyGuide[];
}

export interface Agent3Request {
  transcript: TranscriptEntry[];
  competency_guides: CompetencyGuide[];
}
