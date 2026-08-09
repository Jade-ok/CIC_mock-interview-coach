import { DIMENSION_LABELS, DIMENSION_KEYS } from '../../utils/dimensionLabels';
import type { OverallScores } from '../../types/evaluator';
import './TldrCard.css';

interface TldrCardProps {
  dimensions: OverallScores['dimensions'];
}

/** Short action phrase for each dimension. */
const DIMENSION_ACTIONS: Record<string, string> = {
  concrete_example: 'pick one specific project and name it',
  star_structure: 'structure your answer using STAR (Situation, Task, Action, Result)',
  link_to_job: 'connect your example to this role',
  quantifiable_outcome: 'add a number or measurable outcome',
};

export function TldrCard({ dimensions }: TldrCardProps) {
  // Find the weakest dimension
  let weakestKey = DIMENSION_KEYS[0] as string;
  let weakestScore = Infinity;

  for (const key of DIMENSION_KEYS) {
    const score = dimensions[key as keyof typeof dimensions];
    if (score < weakestScore) {
      weakestScore = score;
      weakestKey = key;
    }
  }

  const action = DIMENSION_ACTIONS[weakestKey] || 'add more detail to your answers';
  const label = DIMENSION_LABELS[weakestKey]?.label || weakestKey;

  return (
    <div className="tldr-card" role="note" aria-label="Key takeaway">
      <span className="tldr-card__icon" aria-hidden="true">&#9889;</span>
      <p className="tldr-card__text">
        <strong>If you improve one thing:</strong> {action}
      </p>
      <span className="tldr-card__chip">{label}</span>
    </div>
  );
}
