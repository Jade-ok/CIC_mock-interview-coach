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
    nova_sonic_context: `Interview context for ${request.pdf.name}. JD length: ${request.jdText.length} chars.`,
    competency_guides: [
      {
        id: 'cg-1',
        title: 'Technical Problem Solving',
        keywords: ['algorithm', 'data structure', 'optimization', 'complexity'],
        description: 'Ability to solve complex technical problems efficiently',
        highlighted: false,
      },
      {
        id: 'cg-2',
        title: 'System Design',
        keywords: ['architecture', 'scalability', 'design pattern', 'distributed'],
        description: 'Understanding of large-scale system design principles',
        highlighted: false,
      },
      {
        id: 'cg-3',
        title: 'Communication',
        keywords: ['explain', 'clarify', 'collaborate', 'trade-off'],
        description: 'Clear communication of technical concepts',
        highlighted: false,
      },
    ],
  };
}
