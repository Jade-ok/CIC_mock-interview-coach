import { useState } from 'react';
import { ScoreBar } from './ScoreBar';
import './DimensionCard.css';

interface DimensionCardProps {
  label: string;
  description: string;
  score: number;
  /** Per-question scores for this dimension (e.g. [3, 2, 4]) */
  perQuestionScores?: number[];
}

/** Threshold for "good" on a dimension — 3 or above counts as demonstrated. */
const GOOD_THRESHOLD = 3;

function buildRationale(_label: string, scores: number[]): string {
  const total = scores.length;
  const good = scores.filter((s) => s >= GOOD_THRESHOLD).length;

  if (good === total) {
    return `All ${total} answers demonstrated this well.`;
  }
  if (good === 0) {
    return `None of your ${total} answers clearly showed this.`;
  }
  return `${good} of ${total} answers demonstrated this clearly.`;
}

export function DimensionCard({ label, description, score, perQuestionScores }: DimensionCardProps) {
  const [expanded, setExpanded] = useState(false);

  const rationale = perQuestionScores && perQuestionScores.length > 0
    ? buildRationale(label, perQuestionScores)
    : null;

  return (
    <div
      className={`dimension-card ${rationale ? 'dimension-card--interactive' : ''}`}
      onClick={() => rationale && setExpanded((prev) => !prev)}
      role={rationale ? 'button' : undefined}
      tabIndex={rationale ? 0 : undefined}
      onKeyDown={(e) => {
        if (rationale && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          setExpanded((prev) => !prev);
        }
      }}
    >
      <div className="dimension-card__header">
        <h3 className="dimension-card__label">{label}</h3>
        <span className="dimension-card__score">{score.toFixed(1)}</span>
      </div>
      <p className="dimension-card__description">{description}</p>
      <ScoreBar score={score} label={label} />
      {expanded && rationale && (
        <p className="dimension-card__rationale">{rationale}</p>
      )}
    </div>
  );
}
