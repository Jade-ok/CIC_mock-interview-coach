/**
 * FeedbackScreen — Displays Agent 3 evaluation results.
 * Three states: loading, error (with retry), result.
 *
 * Validates: Requirements 4.5, 4.7
 */

import type { SessionError, TranscriptEntry } from '@/types/session';
import type { EvaluatorOutput } from '@/types/evaluator';
import { FeedbackReport } from './FeedbackReport';

export interface FeedbackScreenProps {
  loading: boolean;
  error: SessionError | null;
  feedbackResult: EvaluatorOutput | null;
  transcript?: TranscriptEntry[];
  onRetry: () => void;
  onNewSession: () => void;
  onPracticeAgain: () => void;
}

export function FeedbackScreen({
  loading,
  error,
  feedbackResult,
  transcript,
  onRetry,
  onNewSession,
  onPracticeAgain,
}: FeedbackScreenProps) {
  return (
    <div className="feedback-screen" data-testid="feedback-screen">
      {loading && (
        <div className="feedback-screen__loading" data-testid="feedback-loading">
          <div className="feedback-screen__spinner" aria-hidden="true" />
          <p className="feedback-screen__loading-text">
            Generating your feedback...
          </p>
        </div>
      )}

      {!loading && error && (
        <div className="feedback-screen__error" data-testid="feedback-error" role="alert">
          <p className="feedback-screen__error-text">{error.message}</p>
          <div className="feedback-screen__error-actions">
            {error.retryable && (
              <button
                className="feedback-screen__btn feedback-screen__btn--retry"
                onClick={onRetry}
                type="button"
                data-testid="feedback-retry-btn"
              >
                Retry
              </button>
            )}
            <button
              className="feedback-screen__btn feedback-screen__btn--new"
              onClick={onNewSession}
              type="button"
              data-testid="feedback-new-session-btn"
            >
              New Session
            </button>
          </div>
        </div>
      )}

      {!loading && !error && feedbackResult != null && (
        <div className="feedback-screen__result" data-testid="feedback-result">
          <FeedbackReport
            data={feedbackResult}
            onPracticeAgain={onPracticeAgain}
            onNewSession={onNewSession}
            transcript={transcript}
          />
        </div>
      )}

      <style>{`
        .feedback-screen {
          min-height: 100vh;
          background-color: var(--color-canvas, #0A0A0A);
          display: flex;
          align-items: center;
          justify-content: center;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          color: var(--color-text-primary, #FFFFFF);
          padding: 24px;
        }

        .feedback-screen__loading {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 16px;
        }

        .feedback-screen__spinner {
          width: 48px;
          height: 48px;
          border: 4px solid var(--color-control-bar, #2C2C2E);
          border-top-color: var(--color-accent, #9AE05C);
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        .feedback-screen__loading-text {
          font-size: 16px;
          color: var(--color-text-secondary, #A0A0A5);
        }

        .feedback-screen__error {
          text-align: center;
          max-width: 400px;
        }

        .feedback-screen__error-text {
          font-size: 16px;
          color: var(--color-error, #FF5C5C);
          margin: 0 0 24px;
        }

        .feedback-screen__error-actions {
          display: flex;
          gap: 12px;
          justify-content: center;
        }

        .feedback-screen__result {
          width: 100%;
        }

        .feedback-screen__actions {
          display: flex;
          gap: 12px;
          justify-content: center;
          margin-top: 32px;
          padding-bottom: 48px;
        }

        .feedback-screen__btn {
          padding: 10px 24px;
          border-radius: 8px;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          border: none;
          transition: opacity 0.2s;
        }

        .feedback-screen__btn:hover {
          opacity: 0.85;
        }

        .feedback-screen__btn--practice {
          background-color: var(--color-accent, #9AE05C);
          color: var(--color-canvas, #0A0A0A);
          padding: 12px 28px;
          font-size: 15px;
        }

        .feedback-screen__btn--retry {
          background-color: var(--color-accent, #9AE05C);
          color: var(--color-canvas, #0A0A0A);
        }

        .feedback-screen__btn--new {
          background-color: var(--color-control-bar, #2C2C2E);
          color: var(--color-text-primary, #FFFFFF);
          border: 1px solid var(--color-text-secondary, #A0A0A5);
        }
      `}</style>
    </div>
  );
}
