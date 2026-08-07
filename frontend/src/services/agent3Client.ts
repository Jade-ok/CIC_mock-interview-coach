/**
 * Agent 3 client — calls the evaluator Lambda to get feedback
 * based on the interview transcript and competency guides.
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
      conversation.push({
        point_id: `q${questionIndex}`,
        turn_type: questionIndex === 1 ? 'main_question' : 'follow_up',
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
 * Calls the evaluator Lambda with the interview transcript and competency guides.
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
  const requestBody = {
    conversation,
    interview_metadata: {
      question_count: conversation.length,
      timestamp: new Date().toISOString(),
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
