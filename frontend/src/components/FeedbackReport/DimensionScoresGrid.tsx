import { DIMENSION_LABELS, DIMENSION_KEYS } from '../../utils/dimensionLabels';
import type { OverallScores } from '../../types/evaluator';
import { DimensionCard } from './DimensionCard';
import './DimensionScoresGrid.css';

interface DimensionScoresGridProps {
  dimensions: OverallScores['dimensions'];
}

export function DimensionScoresGrid({ dimensions }: DimensionScoresGridProps) {
  return (
    <section className="dimension-scores-grid">
      <h2 className="dimension-scores-grid__title">How your answers scored</h2>
      <div className="dimension-scores-grid__grid">
        {DIMENSION_KEYS.map((key) => (
          <DimensionCard
            key={key}
            label={DIMENSION_LABELS[key].label}
            description={DIMENSION_LABELS[key].description}
            score={dimensions[key as keyof typeof dimensions]}
          />
        ))}
      </div>
    </section>
  );
}
