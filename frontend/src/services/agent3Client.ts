/**
 * Agent 3 client — calls the evaluator Lambda to get feedback
 * based on the interview transcript and competency guides.
 */

import type { Agent3Request } from '@/types/session';

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
 * Calls the evaluator Lambda with the interview transcript and competency guides.
 * Returns feedback data.
 */
export async function callAgent3(request: Agent3Request): Promise<unknown> {
  if (simulateFailure) {
    throw new Error('Agent 3 request failed: Internal Server Error (500)');
  }

  const response = await fetch(EVALUATOR_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      transcript: request.transcript,
      competency_guides: request.competency_guides,
    }),
  });

  const result = await response.json();
  if (result.status !== 'success') {
    throw new Error(`Evaluation failed: ${result.error}`);
  }

  return result.data;
}
