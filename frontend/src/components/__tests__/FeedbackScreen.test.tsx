import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FeedbackScreen } from '@/components/FeedbackScreen';

describe('FeedbackScreen', () => {
  const feedbackResult = {
    per_question_scores: [
      {
        question_text: 'Tell me about a project.',
        answer_summary: 'Built a service.',
        scores: {
          concrete_example: 4,
          situation_action_result: 3,
          link_to_job: 4,
          quantifiable_outcome: 2,
        },
      },
    ],
    overall_scores: {
      dimensions: {
        concrete_example: 4,
        situation_action_result: 3,
        link_to_job: 4,
        quantifiable_outcome: 2,
      },
      total: 3.25,
    },
    question_count: 1,
    readiness_label: 'Developing well',
    strengths: ['Used a concrete example.'],
    improvements: ['Add measurable outcomes.'],
    contextual_advice: ['Connect the example to the target role.'],
    interview_metadata: {
      candidate_level: 'new_grad',
      target_role: 'Software Engineer',
      status: 'ended_early' as const,
      completion_reason: 'user_ended_early',
      main_questions_completed: 1,
      follow_ups_completed: 0,
      ended_early: true,
    },
  };

  const defaultProps = {
    loading: false,
    error: null,
    feedbackResult: null,
    onRetry: vi.fn(),
    onNewSession: vi.fn(),
  };

  describe('Loading state', () => {
    it('shows loading spinner and message when loading', () => {
      render(<FeedbackScreen {...defaultProps} loading={true} />);
      expect(screen.getByTestId('feedback-loading')).toBeInTheDocument();
      expect(screen.getByText('Generating your feedback...')).toBeInTheDocument();
    });

    it('does not show error or result when loading', () => {
      render(<FeedbackScreen {...defaultProps} loading={true} />);
      expect(screen.queryByTestId('feedback-error')).not.toBeInTheDocument();
      expect(screen.queryByTestId('feedback-result')).not.toBeInTheDocument();
    });
  });

  describe('Error state', () => {
    const errorProps = {
      ...defaultProps,
      error: {
        code: 'AGENT3_FAILED' as const,
        message: 'Agent 3 request failed.',
        retryable: true,
      },
    };

    it('shows error message', () => {
      render(<FeedbackScreen {...errorProps} />);
      expect(screen.getByTestId('feedback-error')).toBeInTheDocument();
      expect(screen.getByText('Agent 3 request failed.')).toBeInTheDocument();
    });

    it('shows retry button when retryable', () => {
      render(<FeedbackScreen {...errorProps} />);
      expect(screen.getByTestId('feedback-retry-btn')).toBeInTheDocument();
    });

    it('calls onRetry when retry button clicked', () => {
      const onRetry = vi.fn();
      render(<FeedbackScreen {...errorProps} onRetry={onRetry} />);
      fireEvent.click(screen.getByTestId('feedback-retry-btn'));
      expect(onRetry).toHaveBeenCalledOnce();
    });

    it('shows new session button', () => {
      render(<FeedbackScreen {...errorProps} />);
      expect(screen.getByTestId('feedback-new-session-btn')).toBeInTheDocument();
    });

    it('calls onNewSession when new session button clicked', () => {
      const onNewSession = vi.fn();
      render(<FeedbackScreen {...errorProps} onNewSession={onNewSession} />);
      fireEvent.click(screen.getByTestId('feedback-new-session-btn'));
      expect(onNewSession).toHaveBeenCalledOnce();
    });

    it('does not show retry button when not retryable', () => {
      render(
        <FeedbackScreen
          {...defaultProps}
          error={{ code: 'AGENT3_FAILED', message: 'fail', retryable: false }}
        />
      );
      expect(screen.queryByTestId('feedback-retry-btn')).not.toBeInTheDocument();
    });
  });

  describe('Result state', () => {
    const resultProps = {
      ...defaultProps,
      feedbackResult,
    };

    it('shows feedback result', () => {
      render(<FeedbackScreen {...resultProps} />);
      expect(screen.getByTestId('feedback-result')).toBeInTheDocument();
      expect(screen.getByText('CIC Mock Interview Coach')).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: 'Developing well' })).toBeInTheDocument();
    });

    it('renders evaluator details through the feedback report', () => {
      render(<FeedbackScreen {...resultProps} />);
      expect(screen.getByText('Tell me about a project.')).toBeInTheDocument();
      expect(screen.getByText('Used a concrete example.')).toBeInTheDocument();
    });

    it('starts a new session from the feedback report', () => {
      const onNewSession = vi.fn();
      render(<FeedbackScreen {...resultProps} onNewSession={onNewSession} />);
      fireEvent.click(screen.getAllByText('Practice again')[0]);
      expect(onNewSession).toHaveBeenCalledOnce();
    });
  });
});
