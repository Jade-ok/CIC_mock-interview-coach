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
      question_text: 'Walk me through a project and your specific contribution?',
      answer_summary: 'Built a REST API with FastAPI at TechCorp. Designed endpoints, wrote business logic, achieved 85% test coverage. Used by 20 developers.',
      scores: { concrete_example: 5, situation_action_result: 4, link_to_job: 4, quantifiable_outcome: 5 },
    },
    {
      question_text: 'What features did you implement and how did you decide on the endpoint structure?',
      answer_summary: 'CRUD endpoints for tool configs. Matched existing company patterns and iterated with senior feedback twice before finalizing.',
      scores: { concrete_example: 4, situation_action_result: 4, link_to_job: 3, quantifiable_outcome: 2 },
    },
    {
      question_text: 'Tell me about a technical challenge and how you solved it.',
      answer_summary: 'Hackathon matching system failed on edge cases. Integrated OpenAI API, learned prompt engineering, managed rate limits. Won 2nd place.',
      scores: { concrete_example: 5, situation_action_result: 5, link_to_job: 3, quantifiable_outcome: 4 },
    },
    {
      question_text: 'What alternatives did you consider?',
      answer_summary: 'Weighted scoring didn\'t handle group dynamics. Scikit-learn clustering was too slow. API let me iterate on prompts faster.',
      scores: { concrete_example: 4, situation_action_result: 5, link_to_job: 3, quantifiable_outcome: 2 },
    },
    {
      question_text: 'What did you learn from collaborating and how does it connect to this role?',
      answer_summary: 'Code reviews taught patterns from seniors. Learned to ask questions early. Owned backend and coordinated with frontend dev in hackathon.',
      scores: { concrete_example: 4, situation_action_result: 4, link_to_job: 5, quantifiable_outcome: 2 },
    },
    {
      question_text: 'Give a specific example of resolving a disagreement with a teammate.',
      answer_summary: 'Teammate wanted monolithic file. Pushed for separation. Compromised with clean modules but shared types. Saved debugging time.',
      scores: { concrete_example: 5, situation_action_result: 5, link_to_job: 4, quantifiable_outcome: 3 },
    },
  ],
  overall_scores: {
    dimensions: {
      concrete_example: 4.5,
      situation_action_result: 4.5,
      link_to_job: 3.7,
      quantifiable_outcome: 3.0,
    },
    total: 3.9,
  },
  question_count: 6,
  readiness_label: 'Strong foundation',
  strengths: [
    'Provides specific examples with measurable outcomes (85% coverage, 20 users).',
    'Strong problem-solving narrative showing alternatives considered.',
    'Growth mindset with reflections on learning from code reviews.',
  ],
  improvements: [
    'Could better connect experiences to the target company specifically.',
    'Quantifiable outcomes weaker outside internship context.',
    'Follow-up answers sometimes lose SAR structure.',
  ],
  contextual_advice: [
    'Mention AWS experience more specifically when discussing TechCorp work.',
    'Reference algorithms coursework when discussing problem-solving approaches.',
    'Draw on code review workflow for sprint planning questions.',
  ],
  interview_metadata: {
    candidate_level: 'student_intern',
    target_role: 'Software Engineering Intern',
    status: 'completed',
    completion_reason: 'all_questions_completed',
    main_questions_completed: 3,
    follow_ups_completed: 3,
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
