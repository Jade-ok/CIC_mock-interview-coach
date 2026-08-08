import { useState } from 'react';
import { ScoreBar } from './ScoreBar';
import { DIMENSION_LABELS, DIMENSION_KEYS } from '../../utils/dimensionLabels';
import type { PerQuestionScore } from '../../types/evaluator';
import './QuestionCard.css';

interface QuestionCardProps {
  index: number;
  turnType: string;
  questionText: string;
  answerSummary: string;
  scores: PerQuestionScore['scores'];
  fullAnswer?: string;
}

/** Find the weakest scoring dimension for this question. */
function getWeakestDimension(scores: PerQuestionScore['scores']): { key: string; score: number } {
  let weakestKey = DIMENSION_KEYS[0] as string;
  let weakestScore = Infinity;

  for (const key of DIMENSION_KEYS) {
    const s = scores[key as keyof typeof scores];
    if (s < weakestScore) {
      weakestScore = s;
      weakestKey = key;
    }
  }
  return { key: weakestKey, score: weakestScore };
}

/** Color class for the chip based on score. */
function getChipTier(score: number): string {
  if (score >= 4) return 'question-card__chip--high';
  if (score >= 3) return 'question-card__chip--mid';
  if (score >= 2) return 'question-card__chip--low';
  return 'question-card__chip--minimal';
}

export function QuestionCard({ index, turnType, questionText, answerSummary, scores, fullAnswer }: QuestionCardProps) {
  const [showScores, setShowScores] = useState(false);
  const badgeLabel = turnType === 'main_question' ? 'Main question' : 'Follow-up';
  const badgeClass = turnType === 'main_question' ? 'question-card__badge--main' : 'question-card__badge--followup';

  const weakest = getWeakestDimension(scores);
  const weakestLabel = DIMENSION_LABELS[weakest.key]?.label || weakest.key;
  const chipTier = getChipTier(weakest.score);

  return (
    <article className="question-card">
      <div className="question-card__header">
        <span className="question-card__number">Q{index}</span>
        <span className={`question-card__badge ${badgeClass}`}>{badgeLabel}</span>
        <button
          type="button"
          className={`question-card__chip ${chipTier}`}
          onClick={() => setShowScores((prev) => !prev)}
          aria-expanded={showScores}
          aria-label={`${weakestLabel}: ${weakest.score}/5. Click to ${showScores ? 'hide' : 'show'} all scores`}
        >
          {weakestLabel} {weakest.score}/5
        </button>
      </div>
      <h3 className="question-card__question">{questionText}</h3>
      <p className="question-card__answer">{answerSummary}</p>

      {fullAnswer && (
        <div className="question-card__transcript">
          <p className="question-card__transcript-label">Your full answer:</p>
          <p className="question-card__transcript-text">{fullAnswer}</p>
        </div>
      )}

      {showScores && (
        <div className="question-card__scores">
          {DIMENSION_KEYS.map((key) => (
            <div key={key} className="question-card__score-row">
              <span className="question-card__dimension-label">
                {DIMENSION_LABELS[key].label}
              </span>
              <ScoreBar
                score={scores[key as keyof typeof scores]}
                size="sm"
                label={DIMENSION_LABELS[key].label}
              />
            </div>
          ))}
        </div>
      )}
    </article>
  );
}
