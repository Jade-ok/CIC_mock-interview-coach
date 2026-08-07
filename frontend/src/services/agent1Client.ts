/**
 * Agent 1 HTTP POST client (stub/mock).
 * In production, this would call the analyst backend to get
 * nova_sonic_context and competency_guides based on the user's resume and JD.
 */

import type { Agent1Response } from '@/types/session';

export interface Agent1Request {
  pdf: File;
  jdText: string;
}

/**
 * Calls Agent 1 API with the resume PDF and JD text.
 * Returns nova_sonic_context and competency_guides.
 *
 * This is a stub — it simulates a successful API response with a delay.
 * Replace with real HTTP POST when backend is available.
 */
export async function callAgent1(request: Agent1Request): Promise<Agent1Response> {
  // Stub: simulate network delay (~1 second)
  await new Promise((resolve) => setTimeout(resolve, 1000));

  return {
    nova_sonic_context: `Interview context for ${request.pdf.name}. JD length: ${request.jdText.length} chars. Candidate has 2 years team lead experience, microservices migration project, and strong algorithmic background.`,
    competency_guides: [
      {
        id: 'cg-1',
        title: 'Leadership',
        keywords: ['team lead', 'mentorship', 'delegation', 'decision-making'],
        description: 'Your resume shows 2 years of team lead experience — highlight specific decisions you made and how you mentored junior engineers.',
        highlighted: true,
      },
      {
        id: 'cg-2',
        title: 'Problem Solving',
        keywords: ['algorithm', 'optimization', 'debugging', 'root cause'],
        description: 'You listed 3 algorithm competition awards — be ready to walk through your thought process on complex problems.',
        highlighted: false,
      },
      {
        id: 'cg-3',
        title: 'Technical Depth',
        keywords: ['microservices', 'distributed systems', 'AWS', 'architecture'],
        description: 'Your microservices migration project is a strong talking point — prepare to discuss trade-offs and scaling challenges.',
        highlighted: true,
      },
      {
        id: 'cg-4',
        title: 'Communication & Collaboration',
        keywords: ['cross-team', 'stakeholder', 'documentation', 'feedback'],
        description: 'The JD emphasizes cross-functional work — connect your experience coordinating between frontend and platform teams.',
        highlighted: false,
      },
    ],
  };
}
