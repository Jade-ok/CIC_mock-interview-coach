/**
 * FeedbackScreen — Displays Agent 3 evaluation results as card-based UI.
 * Three states: loading, error (with retry), result (score + competency cards).
 *
 * Data schema is preserved as-is for Agent 3 integration.
 * Only the rendering is changed — debug fields (transcriptLength) are hidden from UI.
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

interface CompetencyScore {
  id: string;
  title: string;
  score: number;
  feedback: string;
  suggestedExperience?: string;
}

interface FeedbackData {
  overallScore: number;
  summary: string;
  competencyScores: CompetencyScore[];
  transcriptLength?: number; // hidden from UI
}

function isFeedbackData(data: unknown): data is FeedbackData {
  if (!data || typeof data !== 'object') return false;
  const d = data as Record<string, unknown>;
  return (
    typeof d.overallScore === 'number' &&
    typeof d.summary === 'string' &&
    Array.isArray(d.competencyScores)
  );
}

function ScoreRing({ score }: { score: number }) {
  const radius = 54;
  const stroke = 8;
  const normalizedRadius = radius - stroke / 2;
  const circumference = normalizedRadius * 2 * Math.PI;
  const strokeDashoffset = circumference - (score / 100) * circumference;

  return (
    <div className="score-ring" data-testid="overall-score">
      <svg width={radius * 2} height={radius * 2}>
        <circle
          className="score-ring__bg"
          stroke="var(--color-control-bar, #2C2C2E)"
          fill="transparent"
          strokeWidth={stroke}
          r={normalizedRadius}
          cx={radius}
          cy={radius}
        />
        <circle
          className="score-ring__progress"
          stroke="var(--color-accent, #9AE05C)"
          fill="transparent"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={strokeDashoffset}
          r={normalizedRadius}
          cx={radius}
          cy={radius}
          style={{ transition: 'stroke-dashoffset 0.8s ease-out' }}
        />
      </svg>
      <div className="score-ring__value">
        <span className="score-ring__number">{score}</span>
        <span className="score-ring__label">/100</span>
      </div>
    </div>
  );
}

function CompetencyCard({ item }: { item: CompetencyScore }) {
  const barColor =
    item.score >= 85
      ? 'var(--color-accent, #9AE05C)'
      : item.score >= 70
        ? 'var(--color-highlight, #4A9EFF)'
        : 'var(--color-error, #FF5C5C)';

  return (
    <div className="competency-card" data-testid={`competency-card-${item.id}`}>
      <div className="competency-card__header">
        <span className="competency-card__title">{item.title}</span>
        <span className="competency-card__score">{item.score}</span>
      </div>
      <div className="competency-card__bar-bg">
        <div
          className="competency-card__bar-fill"
          style={{ width: `${item.score}%`, backgroundColor: barColor }}
        />
      </div>
      <p className="competency-card__feedback">{item.feedback}</p>
      {item.suggestedExperience && (
        <div className="competency-card__suggestion">
          <span className="competency-card__suggestion-label">Suggested experience to highlight</span>
          <p className="competency-card__suggestion-text">{item.suggestedExperience}</p>
        </div>
      )}
    </div>
  );
}

export function FeedbackScreen({
  loading,
  error,
  feedbackResult,
  onRetry,
  onNewSession,
}: FeedbackScreenProps) {
  const feedbackData = isFeedbackData(feedbackResult) ? feedbackResult : null;

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
              Start New Session
            </button>
          </div>
        </div>
      )}

      {!loading && !error && feedbackData && (
        <div className="feedback-screen__result" data-testid="feedback-result">
          <h2 className="feedback-screen__title">Interview Feedback</h2>

          {/* Overall Score Ring */}
          <div className="feedback-screen__score-section">
            <ScoreRing score={feedbackData.overallScore} />
            <p className="feedback-screen__summary">{feedbackData.summary}</p>
          </div>

          {/* Competency Score Cards */}
          <div className="feedback-screen__cards">
            {feedbackData.competencyScores.map((item) => (
              <CompetencyCard key={item.id} item={item} />
            ))}
          </div>

          <button
            className="feedback-screen__btn feedback-screen__btn--new"
            onClick={onNewSession}
            type="button"
            data-testid="feedback-new-session-btn"
          >
            Start New Session
          </button>
        </div>
      )}

      {/* Fallback: non-standard data shape — render raw (shouldn't happen in demo) */}
      {!loading && !error && feedbackResult != null && !feedbackData && (
        <div className="feedback-screen__result" data-testid="feedback-result">
          <h2 className="feedback-screen__title">Interview Feedback</h2>
          <pre className="feedback-screen__data">
            {String(JSON.stringify(feedbackResult, null, 2))}
          </pre>
          <button
            className="feedback-screen__btn feedback-screen__btn--new"
            onClick={onNewSession}
            type="button"
            data-testid="feedback-new-session-btn"
          >
            Start New Session
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
          padding: 32px 24px;
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

        /* Result layout */
        .feedback-screen__result {
          max-width: 640px;
          width: 100%;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 32px;
        }

        .feedback-screen__title {
          font-size: 24px;
          font-weight: 600;
          margin: 0;
          text-align: center;
        }

        /* Score Section */
        .feedback-screen__score-section {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 16px;
        }

        .score-ring {
          position: relative;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .score-ring svg {
          transform: rotate(-90deg);
        }

        .score-ring__value {
          position: absolute;
          display: flex;
          align-items: baseline;
          gap: 2px;
        }

        .score-ring__number {
          font-size: 32px;
          font-weight: 700;
          color: var(--color-accent, #9AE05C);
        }

        .score-ring__label {
          font-size: 14px;
          color: var(--color-text-secondary, #A0A0A5);
        }

        .feedback-screen__summary {
          font-size: 15px;
          color: var(--color-text-secondary, #A0A0A5);
          text-align: center;
          line-height: 1.5;
          margin: 0;
          max-width: 480px;
        }

        /* Competency Cards */
        .feedback-screen__cards {
          width: 100%;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .competency-card {
          background-color: var(--color-tile-bg, #1C1C1E);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 8px;
          padding: 16px;
        }

        .competency-card__header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 10px;
        }

        .competency-card__title {
          font-size: 14px;
          font-weight: 600;
          color: var(--color-text-primary, #FFFFFF);
        }

        .competency-card__score {
          font-size: 14px;
          font-weight: 700;
          color: var(--color-accent, #9AE05C);
          background-color: rgba(154, 224, 92, 0.12);
          padding: 2px 8px;
          border-radius: 4px;
        }

        .competency-card__bar-bg {
          width: 100%;
          height: 6px;
          background-color: var(--color-control-bar, #2C2C2E);
          border-radius: 3px;
          overflow: hidden;
          margin-bottom: 10px;
        }

        .competency-card__bar-fill {
          height: 100%;
          border-radius: 3px;
          transition: width 0.6s ease-out;
        }

        .competency-card__feedback {
          font-size: 12px;
          color: var(--color-text-secondary, #A0A0A5);
          line-height: 1.5;
          margin: 0;
        }

        .competency-card__suggestion {
          margin-top: 12px;
          padding-top: 12px;
          border-top: 1px solid rgba(255, 255, 255, 0.06);
        }

        .competency-card__suggestion-label {
          display: block;
          font-size: 11px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.4px;
          color: var(--color-highlight, #4A9EFF);
          margin-bottom: 6px;
        }

        .competency-card__suggestion-text {
          font-size: 12px;
          color: var(--color-text-secondary, #A0A0A5);
          line-height: 1.6;
          margin: 0;
          padding: 8px 10px;
          background-color: rgba(74, 158, 255, 0.06);
          border-radius: 6px;
          border-left: 3px solid var(--color-highlight, #4A9EFF);
        }

        /* Fallback raw data */
        .feedback-screen__data {
          background-color: var(--color-tile-bg, #1C1C1E);
          border-radius: 8px;
          padding: 16px;
          font-size: 13px;
          color: var(--color-text-secondary, #A0A0A5);
          overflow-x: auto;
          white-space: pre-wrap;
          word-break: break-word;
          width: 100%;
        }

        /* Buttons */
        .feedback-screen__btn {
          padding: 12px 28px;
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
