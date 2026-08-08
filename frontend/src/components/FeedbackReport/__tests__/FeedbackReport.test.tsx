import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { FeedbackReport } from '../FeedbackReport';
import type { EvaluatorOutput } from '../../../types/evaluator';

const mockData: EvaluatorOutput = {
  per_question_scores: [
    { question_text: 'Q1?', answer_summary: 'A1.', scores: { concrete_example: 4, situation_action_result: 3, link_to_job: 4, quantifiable_outcome: 2 } },
    { question_text: 'Q2?', answer_summary: 'A2.', scores: { concrete_example: 5, situation_action_result: 4, link_to_job: 3, quantifiable_outcome: 3 } },
  ],
  overall_scores: {
    dimensions: { concrete_example: 4.5, situation_action_result: 3.5, link_to_job: 3.5, quantifiable_outcome: 2.5 },
    total: 3.5,
  },
  question_count: 2,
  readiness_label: 'Strong foundation',
  strengths: ['Great specific example.'],
  improvements: ['Add more numbers.'],
  contextual_advice: ['Mention your hackathon project.'],
  interview_metadata: {
    candidate_level: 'student_intern',
    target_role: 'Software Engineering Intern',
    status: 'completed',
    completion_reason: 'all_questions_completed',
    main_questions_completed: 1,
    follow_ups_completed: 1,
    ended_early: false,
  },
};

describe('FeedbackReport (full page)', () => {
  it('renders all major sections', () => {
    render(<FeedbackReport data={mockData} onPracticeAgain={() => {}} onViewTranscript={() => {}} />);

    // Header
    expect(screen.getByText('CIC Mock Interview Coach')).toBeTruthy();

    // Hero
    expect(screen.getByRole('heading', { name: 'Strong foundation' })).toBeTruthy();

    // Dimensions
    expect(screen.getByText('How your answers scored')).toBeTruthy();
    expect(screen.getAllByText('Concrete example').length).toBeGreaterThan(0);

    // Feedback columns
    expect(screen.getByText('What you did well')).toBeTruthy();
    expect(screen.getByText('What to work on next')).toBeTruthy();

    // Contextual advice
    expect(screen.getByText('For your next interview')).toBeTruthy();

    // Question breakdown
    expect(screen.getByText('Question by question')).toBeTruthy();
    expect(screen.getByText('Q1?')).toBeTruthy();
    expect(screen.getByText('Q2?')).toBeTruthy();

    // Footer
    expect(screen.getAllByText('Practice again').length).toBeGreaterThan(0);
  });

  it('passes correct question count', () => {
    render(<FeedbackReport data={mockData} onPracticeAgain={() => {}} onViewTranscript={() => {}} />);
    expect(screen.getByText(/2 questions answered/)).toBeTruthy();
  });

  it('hides transcript controls until transcript viewing is implemented', () => {
    render(<FeedbackReport data={mockData} onPracticeAgain={() => {}} />);
    expect(screen.queryByText('View full transcript')).not.toBeInTheDocument();
  });
});
