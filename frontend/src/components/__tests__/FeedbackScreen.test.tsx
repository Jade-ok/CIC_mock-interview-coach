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
      expect(screen.getByText('피드백을 생성하고 있습니다...')).toBeInTheDocument();
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
        message: 'Agent 3 요청에 실패했습니다.',
        retryable: true,
      },
    };

    it('shows error message', () => {
      render(<FeedbackScreen {...errorProps} />);
      expect(screen.getByTestId('feedback-error')).toBeInTheDocument();
      expect(screen.getByText('Agent 3 요청에 실패했습니다.')).toBeInTheDocument();
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
      feedbackResult: { overallScore: 85, summary: '좋은 성과입니다.' },
    };

    it('shows feedback result', () => {
      render(<FeedbackScreen {...resultProps} />);
      expect(screen.getByTestId('feedback-result')).toBeInTheDocument();
      expect(screen.getByText('인터뷰 피드백')).toBeInTheDocument();
    });

    it('displays result data as JSON', () => {
      render(<FeedbackScreen {...resultProps} />);
      const resultEl = screen.getByTestId('feedback-result');
      expect(resultEl.textContent).toContain('overallScore');
      expect(resultEl.textContent).toContain('85');
    });

    it('shows new session button', () => {
      render(<FeedbackScreen {...resultProps} />);
      expect(screen.getByTestId('feedback-new-session-btn')).toBeInTheDocument();
    });
  });
});
