import { DIMENSION_LABELS, DIMENSION_KEYS } from '../../utils/dimensionLabels';
import type { OverallScores, PerQuestionScore } from '../../types/evaluator';
import { DimensionCard } from './DimensionCard';
import './DimensionScoresGrid.css';

interface DimensionScoresGridProps {
  dimensions: OverallScores['dimensions'];
  perQuestionScores?: PerQuestionScore[];
}

export function DimensionScoresGrid({ dimensions, perQuestionScores }: DimensionScoresGridProps) {
  return (
    <section className="dimension-scores-grid">
      <h2 className="dimension-scores-grid__title">How your answers scored</h2>
      <div className="dimension-scores-grid__grid">
        {DIMENSION_KEYS.map((key) => {
          const dimKey = key as keyof OverallScores['dimensions'];
          const qScores = perQuestionScores?.map((q) => q.scores[dimKey]) ?? [];
          return (
            <DimensionCard
              key={key}
              label={DIMENSION_LABELS[key].label}
              description={DIMENSION_LABELS[key].description}
              score={dimensions[dimKey]}
              perQuestionScores={qScores}
            />
          );
        })}
      </div>
    </section>
  );
}
