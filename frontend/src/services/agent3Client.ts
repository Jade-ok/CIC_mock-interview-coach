/**
 * Agent 3 client — calls the evaluator Lambda to get feedback
 * based on the interview transcript and analyst output.
 */

import type { Agent3Request, TranscriptEntry } from '@/types/session';

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
 * Converts the flat transcript (role/text pairs) into the conversation format
 * expected by the evaluator backend:
 * [{ point_id, turn_type, question, answer }]
 *
 * Pairs consecutive interviewer→user messages as question→answer.
 */
function buildConversation(
  transcript: TranscriptEntry[]
): Array<{ point_id: string; turn_type: string; question: string; answer: string }> {
  const conversation: Array<{
    point_id: string;
    turn_type: string;
    question: string;
    answer: string;
  }> = [];

  let questionIndex = 0;

  for (let i = 0; i < transcript.length; i++) {
    const entry = transcript[i];
    if (entry.role === 'interviewer') {
      // Look ahead for the user's answer
      const nextEntry = transcript[i + 1];
      const answer = nextEntry && nextEntry.role === 'user' ? nextEntry.text : '';

      questionIndex++;
      // Interview pattern: main → follow_up → main → follow_up → ...
      // Odd-numbered questions (1,3,5) are main_question, even (2,4,6) are follow_up
      const pointIndex = Math.ceil(questionIndex / 2);
      conversation.push({
        point_id: `point_${pointIndex}`,
        turn_type: questionIndex % 2 === 1 ? 'main_question' : 'follow_up',
        question: entry.text,
        answer,
      });

      // Skip the paired user entry
      if (nextEntry && nextEntry.role === 'user') {
        i++;
      }
    }
  }

  return conversation;
}

/**
 * Calls the evaluator Lambda with the interview transcript and analyst output.
 * Transforms data to match the evaluator's expected input schema.
 * Returns feedback data.
 */
export async function callAgent3(request: Agent3Request): Promise<unknown> {
  if (simulateFailure) {
    throw new Error('Agent 3 request failed: Internal Server Error (500)');
  }

  // Transform transcript to evaluator's expected conversation format
  const conversation = buildConversation(request.transcript);

  if (conversation.length === 0) {
    throw new Error('Evaluation failed: No question-answer pairs found in transcript');
  }

  // Build the request body matching evaluator validator expectations
  const mainQuestions = conversation.filter(c => c.turn_type === 'main_question').length;
  const followUps = conversation.filter(c => c.turn_type === 'follow_up').length;

  const requestBody = {
    conversation,
    interview_metadata: {
      candidate_level: (request.analyst_output?.candidate_profile as Record<string, unknown>)?.candidate_level as string || 'student_intern',
      target_role: (request.analyst_output?.target_role as Record<string, unknown>)?.title as string || 'Unknown',
      status: 'completed' as const,
      completion_reason: conversation.length >= 6 ? 'all_questions_completed' : 'user_ended_early',
      main_questions_completed: mainQuestions,
      follow_ups_completed: followUps,
      ended_early: conversation.length < 6,
    },
    analyst_output: request.analyst_output || {},
  };

  const response = await fetch(EVALUATOR_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => null);
    const errorMessage = errorData?.message || errorData?.error || `HTTP ${response.status}`;
    throw new Error(`Evaluation failed: ${errorMessage}`);
  }

  const result = await response.json();

  // The evaluator returns the result directly (no { status, data } wrapper)
  // Check if it has an error field (error responses)
  if (result.error) {
    throw new Error(`Evaluation failed: ${result.message || result.error}`);
  }

  return result;
}
