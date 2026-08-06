import { ScoreBar } from './ScoreBar';
import './DimensionCard.css';

interface DimensionCardProps {
  label: string;
  description: string;
  score: number;
}

export function DimensionCard({ label, description, score }: DimensionCardProps) {
  return (
    <div className="dimension-card">
      <div className="dimension-card__header">
        <h3 className="dimension-card__label">{label}</h3>
        <span className="dimension-card__score">{score.toFixed(1)}</span>
      </div>
      <p className="dimension-card__description">{description}</p>
      <ScoreBar score={score} label={label} />
    </div>
  );
}
