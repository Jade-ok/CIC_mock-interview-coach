import type { EvaluatorOutput } from './evaluator';

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
  uploadData: UploadData | null;
  analystOutput: AnalystOutput | null;
  transcript: TranscriptEntry[];
  competencyGuides: CompetencyGuide[];
  novaSonicContext: string;
  elapsedSeconds: number;
  wsConnectionState: 'connecting' | 'connected' | 'reconnecting' | 'disconnected';
  agent1Ready: boolean;
  wsReady: boolean;
  error: SessionError | null;
  agent3Loading: boolean;
  feedbackResult: EvaluatorOutput | null;
  endReason: 'auto' | 'manual' | null;
}

export interface UploadData {
  pdf: File;
  jdText: string;
}

export type AnalystOutput = Record<string, unknown>;

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
  | { type: 'WS_CONNECT_FAILED'; payload: { message: string } }
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
  | { type: 'AGENT3_SUCCESS'; payload: EvaluatorOutput }
  | { type: 'AGENT3_FAILED'; payload: { message: string; retryable?: boolean } }
  | { type: 'TIMEOUT' }
  | { type: 'MIC_DENIED' }
  | { type: 'TICK' }
  | { type: 'RESET' };

export interface Agent1Response {
  nova_sonic_context: string;
  competency_guides: CompetencyGuide[];
  analyst_output: AnalystOutput;
}

export interface Agent3Request {
  conversation: Array<{
    point_id: string;
    turn_type: 'main_question' | 'follow_up';
    question: string;
    answer: string;
  }>;
  interview_metadata: {
    candidate_level: string;
    target_role: string;
    status: 'completed' | 'ended_early';
    completion_reason: 'all_questions_completed' | 'user_ended_early';
    main_questions_completed: number;
    follow_ups_completed: number;
    ended_early: boolean;
  };
  analyst_output: AnalystOutput;
}
