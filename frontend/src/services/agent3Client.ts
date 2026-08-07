/**
 * Agent 3 client — calls the evaluator Lambda to get feedback
 * based on the canonical Interviewer output contract.
 */

import type { Agent3Request, SessionState, TranscriptEntry } from '@/types/session';

const EVALUATOR_URL = import.meta.env.VITE_EVALUATOR_URL;

/** Controls whether the stub should simulate failure (for testing) */
let simulateFailure = false;

/**
 * Set whether the stub should simulate a failure response.
 * Useful for testing error/retry flows.
 */
export function setAgent3SimulateFailure(fail: boolean): void {
  simulateFailure = fail;
}

/**
 * Convert the UI transcript into the Evaluator's question-answer contract.
 * The interview prompt defines three points, each with a main question and follow-up.
 */
export function buildAgent3Request(state: SessionState): Agent3Request {
  if (!state.analystOutput) {
    throw new Error('Cannot evaluate an interview without Analyst output.');
  }

  const conversation = pairConversation(state.transcript);
  // Six answer pairs means the scripted three-main/three-follow-up interview
  // completed, even when the user closes it manually after Nova's sign-off.
  const completed = conversation.length === 6;
  const candidateProfile = state.analystOutput.candidate_profile as
    | Record<string, unknown>
    | undefined;
  const targetRole = state.analystOutput.target_role as
    | Record<string, unknown>
    | undefined;

  return {
    analyst_output: state.analystOutput,
    conversation,
    interview_metadata: {
      candidate_level: String(candidateProfile?.candidate_level || 'unknown'),
      target_role: String(targetRole?.title || 'unknown'),
      status: completed ? 'completed' : 'ended_early',
      completion_reason: completed
        ? 'all_questions_completed'
        : 'user_ended_early',
      main_questions_completed: conversation.filter(
        (turn) => turn.turn_type === 'main_question'
      ).length,
      follow_ups_completed: conversation.filter(
        (turn) => turn.turn_type === 'follow_up'
      ).length,
      ended_early: !completed,
    },
  };
}

function pairConversation(transcript: TranscriptEntry[]): Agent3Request['conversation'] {
  const conversation: Agent3Request['conversation'] = [];
  let pendingQuestion: string | null = null;

  for (const entry of transcript) {
    if (entry.role === 'interviewer') {
      pendingQuestion = entry.text;
      continue;
    }
    if (!pendingQuestion || conversation.length >= 6) continue;

    const turnIndex = conversation.length;
    conversation.push({
      point_id: `point_${Math.floor(turnIndex / 2) + 1}`,
      turn_type: turnIndex % 2 === 0 ? 'main_question' : 'follow_up',
      question: pendingQuestion,
      answer: entry.text,
    });
    pendingQuestion = null;
  }

  return conversation;
}

/**
 * Calls the evaluator Lambda with a canonical request.
 * Returns feedback data.
 */
export async function callAgent3(request: Agent3Request): Promise<unknown> {
  if (simulateFailure) {
    throw new Error('Agent 3 request failed: Internal Server Error (500)');
  }

  if (request.conversation.length === 0) {
    throw new Error('At least one completed question and answer is required for evaluation.');
  }

  const response = await fetch(EVALUATOR_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });

  const result = await response.json();
  if (!response.ok) {
    throw new Error(`Evaluation failed: ${result.message || result.error || response.statusText}`);
  }

  return result;
}
