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
    summary: 'You showed strong overall interview performance. Your answers demonstrated solid technical depth and clear communication.',
    competencyScores: request.competency_guides.map((guide) => ({
      id: guide.id,
      title: guide.title,
      score: Math.floor(Math.random() * 30) + 70,
      feedback: `You provided relevant examples for ${guide.title}. Consider adding more quantitative impact to strengthen your responses.`,
      suggestedExperience: getSuggestedExperience(guide.title),
    })),
    transcriptLength: request.transcript.length,
  };
}

/** Mock suggested experience text keyed by competency title */
function getSuggestedExperience(title: string): string {
  const suggestions: Record<string, string> = {
    'Leadership':
      'Your resume mentions leading a 5-person team on the migration project — using that specific example with a measurable outcome (e.g. reduced deployment time by X%) would have strengthened this answer.',
    'Problem Solving':
      "Your algorithm competition experience wasn't mentioned — walking through your approach to a specific hard problem would have been a strong example here.",
    'Technical Depth':
      'You could have referenced your work on the microservices architecture in more technical detail — specific trade-offs you considered would show deeper expertise.',
    'Communication & Collaboration':
      'Your resume shows cross-team coordination experience — citing a specific instance of resolving a disagreement would have added weight to this answer.',
  };
  return suggestions[title] ?? 'Consider referencing a specific project from your resume with measurable outcomes to strengthen your answer.';
}
