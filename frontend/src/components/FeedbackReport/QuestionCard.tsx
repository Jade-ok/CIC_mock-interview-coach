import { useState } from 'react';
import { ScoreBar } from './ScoreBar';
import { DIMENSION_LABELS, DIMENSION_KEYS } from '../../utils/dimensionLabels';
import type { PerQuestionScore } from '../../types/evaluator';
import './QuestionCard.css';

interface QuestionCardProps {
  index: number;
  questionText: string;
  feedback?: { strength: string; improvement: string };
  scores: PerQuestionScore['scores'];
  transcriptAnswer?: string;
}

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

export function QuestionCard({ index, questionText, feedback, scores, transcriptAnswer }: QuestionCardProps) {
  const [showScores, setShowScores] = useState(false);
  const [showAnswer, setShowAnswer] = useState(false);
  const weakest = getWeakestDimension(scores);
  const weakestLabel = DIMENSION_LABELS[weakest.key]?.label || weakest.key;

  return (
    <article className="question-card">
      <div className="question-card__header">
        <span className="question-card__number">Q{index}</span>
        <button
          type="button"
          className="question-card__chip"
          onClick={() => setShowScores((prev) => !prev)}
          aria-expanded={showScores}
          aria-label={`${weakestLabel}: ${weakest.score}/5. Click to ${showScores ? 'hide' : 'show'} all scores`}
        >
          {weakestLabel} {weakest.score}/5
        </button>
        {transcriptAnswer && (
          <button
            type="button"
            className="question-card__answer-toggle"
            onClick={() => setShowAnswer((prev) => !prev)}
            aria-expanded={showAnswer}
          >
            {showAnswer ? 'Hide my answer' : 'Show my answer'}
          </button>
        )}
      </div>
      <h3 className="question-card__question">{questionText}</h3>

      {showAnswer && transcriptAnswer && (
        <div className="question-card__transcript">
          <p className="question-card__transcript-text">{transcriptAnswer}</p>
        </div>
      )}

      {feedback && (
        <div className="question-card__feedback">
          {feedback.strength && (
            <p className="question-card__feedback-item question-card__feedback-item--strength">
              <span className="question-card__dot question-card__dot--filled" aria-hidden="true" />
              {feedback.strength}
            </p>
          )}
          {feedback.improvement && (
            <p className="question-card__feedback-item question-card__feedback-item--improvement">
              <span className="question-card__dot question-card__dot--outline" aria-hidden="true" />
              {feedback.improvement}
            </p>
          )}
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
