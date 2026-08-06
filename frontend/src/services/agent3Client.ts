/**
 * Agent 3 HTTP POST client (stub/mock).
 * In production, this would call the evaluator backend to get
 * feedback based on the interview transcript and competency guides.
 */

import type { Agent3Request } from '@/types/session';

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
 * Calls Agent 3 API with the interview transcript and competency guides.
 * Returns feedback data (schema TBD).
 *
 * This is a stub — it simulates a successful API response with a delay.
 * Replace with real HTTP POST when backend is available.
 */
export async function callAgent3(request: Agent3Request): Promise<unknown> {
  // Stub: simulate network delay (1-2 seconds)
  await new Promise((resolve) => setTimeout(resolve, 1500));

  if (simulateFailure) {
    throw new Error('Agent 3 request failed: Internal Server Error (500)');
  }

  return {
    overallScore: 78,
    summary: '전반적으로 좋은 인터뷰 성과를 보여주셨습니다.',
    competencyScores: request.competency_guides.map((guide) => ({
      id: guide.id,
      title: guide.title,
      score: Math.floor(Math.random() * 30) + 70,
      feedback: `${guide.title} 역량에서 적절한 답변을 보여주셨습니다.`,
    })),
    transcriptLength: request.transcript.length,
  };
}
