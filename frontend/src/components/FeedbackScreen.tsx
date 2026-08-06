/**
 * FeedbackScreen — Displays Agent 3 evaluation results.
 * Three states: loading, error (with retry), result.
 *
 * Validates: Requirements 4.5, 4.7
 */

import type { SessionError } from '@/types/session';

export interface FeedbackScreenProps {
  loading: boolean;
  error: SessionError | null;
  feedbackResult: unknown;
  onRetry: () => void;
  onNewSession: () => void;
}

export function FeedbackScreen({
  loading,
  error,
  feedbackResult,
  onRetry,
  onNewSession,
}: FeedbackScreenProps) {
  return (
    <div className="feedback-screen" data-testid="feedback-screen">
      {loading && (
        <div className="feedback-screen__loading" data-testid="feedback-loading">
          <div className="feedback-screen__spinner" aria-hidden="true" />
          <p className="feedback-screen__loading-text">
            피드백을 생성하고 있습니다...
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
                재시도
              </button>
            )}
            <button
              className="feedback-screen__btn feedback-screen__btn--new"
              onClick={onNewSession}
              type="button"
              data-testid="feedback-new-session-btn"
            >
              새 세션 시작
            </button>
          </div>
        </div>
      )}

      {!loading && !error && feedbackResult != null && (
        <div className="feedback-screen__result" data-testid="feedback-result">
          <h2 className="feedback-screen__title">인터뷰 피드백</h2>
          <pre className="feedback-screen__data">
            {String(JSON.stringify(feedbackResult, null, 2))}
          </pre>
          <button
            className="feedback-screen__btn feedback-screen__btn--new"
            onClick={onNewSession}
            type="button"
            data-testid="feedback-new-session-btn"
          >
            새 세션 시작
          </button>
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
          max-width: 600px;
          width: 100%;
        }

        .feedback-screen__title {
          font-size: 24px;
          font-weight: 600;
          margin: 0 0 24px;
          text-align: center;
        }

        .feedback-screen__data {
          background-color: var(--color-tile-bg, #1C1C1E);
          border-radius: 8px;
          padding: 16px;
          font-size: 13px;
          color: var(--color-text-secondary, #A0A0A5);
          overflow-x: auto;
          white-space: pre-wrap;
          word-break: break-word;
          margin: 0 0 24px;
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
