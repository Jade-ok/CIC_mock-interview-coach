/**
 * Preview page for FeedbackReport — renders with mock data.
 * Access via: http://localhost:5173/feedback-preview
 *
 * This is a dev-only page for testing the FeedbackReport component
 * without needing to go through the full interview flow.
 */

import { FeedbackReport } from '@/components/FeedbackReport';
import type { EvaluatorOutput } from '@/types/evaluator';

const MOCK_DATA: EvaluatorOutput = {
  per_question_scores: [
    {
      question_text: 'Can you tell me about the PrairieCalendar Chrome Extension you co-developed and shipped, including your specific role and contributions?',
      feedback: {
        strength: 'Your problem framing was clear and relatable — "students have to copy exam and quiz dates by hand" immediately communicates the real user pain you were solving. That customer-first thinking is exactly what SAP looks for.',
        improvement: 'Complete the full SAR arc before time runs out: Situation → Action (what YOU specifically did) → Result (what changed). You had a great Situation, but the Action and Result were missing. Practice narrating all three parts in under 90 seconds.',
      },
      scores: { concrete_example: 2, situation_action_result: 1, link_to_job: 2, quantifiable_outcome: 1 },
    },
    {
      question_text: 'Can you share how you handled bugs or user-reported issues after shipping the extension?',
      feedback: {
        strength: 'You showed genuine self-awareness — you initially said there were no errors, then caught yourself and shared a real user issue. Mentioning the 29 active users was a strong instinct: real numbers are compelling evidence of impact.',
        improvement: 'Add more technical detail to your Action: "We used the WebExtensions API so the extension could run on Firefox and Chrome" is much stronger than "we extended our function to cross browser." Specificity builds credibility with technical interviewers.',
      },
      scores: { concrete_example: 3, situation_action_result: 2, link_to_job: 1, quantifiable_outcome: 2 },
    },
    {
      question_text: 'Can you tell me about the CareHando! Voice-Powered Handoff System you built during the hackathon, and what specific challenges you faced while developing the FastAPI backend?',
      feedback: {
        strength: '',
        improvement: 'Your answer trailed off before reaching your technical contributions. Prepare a 2-sentence "anchor statement" for each major project: what YOU built, in what technology, and what it accomplished — a reliable starting point even when you\'re nervous.',
      },
      scores: { concrete_example: 2, situation_action_result: 1, link_to_job: 2, quantifiable_outcome: 1 },
    },
    {
      question_text: 'Can you share how you learned and applied a new technical concept independently in one of your projects, and what obstacles you overcame while doing so?',
      feedback: {
        strength: 'Your learning-style insight — preferring to build something small and complete it — is a genuinely good frame for this question.',
        improvement: 'Anchor it to one specific project, technology, and obstacle. Without a concrete example, even a true answer reads as generic.',
      },
      scores: { concrete_example: 1, situation_action_result: 2, link_to_job: 2, quantifiable_outcome: 1 },
    },
  ],
  overall_scores: {
    dimensions: {
      concrete_example: 2.2,
      situation_action_result: 1.5,
      link_to_job: 1.5,
      quantifiable_outcome: 1.2,
    },
    total: 1.6,
  },
  question_count: 4,
  readiness_label: 'Needs clearer examples',
  strengths: [
    'Across the interview you showed intellectual honesty, customer-first problem framing, and a good instinct for citing real evidence like user numbers.',
    'Those are exactly the raw materials strong interview stories are built from.',
  ],
  improvements: [
    'The consistent gap is finishing the story: answers open with a clear Situation but trail off before the Action and Result.',
    'Prepare anchor statements for each project and attach one measurable outcome to every story you tell.',
  ],
  keywords_covered: ['REST APIs', 'Cloud APIs', 'JavaScript', 'Python', 'Shipping to real users'],
  keywords_not_covered: ['Agile / Scrum', 'Java', 'CI/CD', 'Business Data Cloud', 'Stakeholder communication'],
  contextual_advice: [
    'Your resume shows you reduced manual calendar setup "from ~5 minutes to under 10 seconds" — this is a powerful, specific outcome that never came up in your answers. Memorize this number and use it whenever you talk about PrairieCalendar.',
    'The CareHando! project is one of your strongest technical stories for this role — 5 RESTful API endpoints, AI cloud APIs (Whisper, GPT-4o-mini), documentation time from 5 minutes to 30 seconds — all under hackathon pressure. Practice telling this story end-to-end.',
    'The SAP role lists Agile/Scrum as a preferred skill and your resume doesn\'t mention it directly. Both PrairieCalendar (iterative, shipped to users) and your hackathon have informal agile elements — be ready to describe how you prioritized, responded to feedback, and iterated.',
    'For the self-directed learning question, use your OAuth 2.0 integration as your story. Teaching yourself a non-trivial auth protocol and shipping it to 29 real users is a compelling demonstration of curiosity and perseverance.',
    'Java depth is flagged for this role while your work is primarily JavaScript and Python. Be honest about your coursework level and pivot to your demonstrated ability to pick up new languages quickly.',
    'Your KDD conference role (200+ attendees) is an underused asset for communication questions — sponsor relations and speaker outreach are real cross-functional communication at scale.',
  ],
  interview_metadata: {
    candidate_level: 'student_intern',
    target_role: 'SAP IXP Intern — Agile Developer, Business Data Cloud',
    status: 'completed',
    completion_reason: 'all_questions_completed',
    main_questions_completed: 2,
    follow_ups_completed: 2,
    ended_early: false,
  },
};

export function FeedbackPreview() {
  return (
    <FeedbackReport
      data={MOCK_DATA}
      onPracticeAgain={() => alert('Practice Again clicked')}
      onViewTranscript={() => alert('View Transcript clicked')}
    />
  );
}
