import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FeedbackScreen } from '@/components/FeedbackScreen';

describe('FeedbackScreen', () => {
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
      feedbackResult: {
        overallScore: 85,
        summary: 'Great performance overall.',
        competencyScores: [
          { id: 'cg-1', title: 'Leadership', score: 88, feedback: 'Strong examples provided.' },
          { id: 'cg-2', title: 'Problem Solving', score: 82, feedback: 'Good analytical approach.' },
        ],
        transcriptLength: 5,
      },
    };

    it('shows feedback result with title', () => {
      render(<FeedbackScreen {...resultProps} />);
      expect(screen.getByTestId('feedback-result')).toBeInTheDocument();
      expect(screen.getByText('Interview Feedback')).toBeInTheDocument();
    });

    it('displays overall score in score ring', () => {
      render(<FeedbackScreen {...resultProps} />);
      expect(screen.getByTestId('overall-score')).toBeInTheDocument();
      expect(screen.getByText('85')).toBeInTheDocument();
    });

    it('displays summary text', () => {
      render(<FeedbackScreen {...resultProps} />);
      expect(screen.getByText('Great performance overall.')).toBeInTheDocument();
    });

    it('renders competency cards', () => {
      render(<FeedbackScreen {...resultProps} />);
      expect(screen.getByTestId('competency-card-cg-1')).toBeInTheDocument();
      expect(screen.getByTestId('competency-card-cg-2')).toBeInTheDocument();
      expect(screen.getByText('Leadership')).toBeInTheDocument();
      expect(screen.getByText('Problem Solving')).toBeInTheDocument();
    });

    it('hides transcriptLength from the UI', () => {
      render(<FeedbackScreen {...resultProps} />);
      const resultEl = screen.getByTestId('feedback-result');
      expect(resultEl.textContent).not.toContain('transcriptLength');
    });

    it('shows new session button with English text', () => {
      render(<FeedbackScreen {...resultProps} />);
      const btn = screen.getByTestId('feedback-new-session-btn');
      expect(btn).toBeInTheDocument();
      expect(btn.textContent).toBe('Start New Session');
    });
  });

  describe('Fallback for non-standard data', () => {
    it('falls back to raw JSON for unexpected data shape', () => {
      const props = {
        ...defaultProps,
        feedbackResult: { unexpected: 'data' },
      };
      render(<FeedbackScreen {...props} />);
      expect(screen.getByTestId('feedback-result')).toBeInTheDocument();
      const resultEl = screen.getByTestId('feedback-result');
      expect(resultEl.textContent).toContain('unexpected');
    });
  });
});
