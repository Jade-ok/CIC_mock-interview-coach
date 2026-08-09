import { DIMENSION_LABELS, DIMENSION_KEYS } from '../../utils/dimensionLabels';
import type { OverallScores } from '../../types/evaluator';
import './HeroSection.css';

interface HeroSectionProps {
  readinessLabel: string;
  totalScore: number;
  questionCount: number;
  targetRole: string;
  dimensions: OverallScores['dimensions'];
}

/** Short action phrase for each dimension, with highlight markers around key words. */
const DIMENSION_ACTIONS: Record<string, string> = {
  concrete_example: 'Pick one **specific project** and name it.',
  situation_action_result: 'Complete your **SAR structure** (Situation, Action, Result).',
  link_to_job: 'Connect your example to **this role** explicitly.',
  quantifiable_outcome: 'Add a **number or measurable outcome** to every story.',
};

/** Renders text with **bold** markers as accent-colored spans. */
function HighlightedText({ text }: { text: string }) {
  const parts = text.split(/\*\*(.*?)\*\*/g);
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1
          ? <span key={i} className="hero-section__highlight">{part}</span>
          : <span key={i}>{part}</span>
      )}
    </>
  );
}

export function HeroSection({ totalScore, targetRole, dimensions }: HeroSectionProps) {
  // Find weakest dimension
  let weakestKey = DIMENSION_KEYS[0] as string;
  let weakestScore = Infinity;
  for (const key of DIMENSION_KEYS) {
    const s = dimensions[key as keyof typeof dimensions];
    if (s < weakestScore) {
      weakestScore = s;
      weakestKey = key;
    }
  }
  const weakestLabel = DIMENSION_LABELS[weakestKey]?.label || weakestKey;
  void weakestLabel; // used only for chip (removed)
  const action = DIMENSION_ACTIONS[weakestKey] || 'add more detail to your answers';

  // Ring gauge SVG
  const radius = 54;
  const stroke = 8;
  const circumference = 2 * Math.PI * radius;
  const progress = (totalScore / 5) * circumference;
  const gap = circumference - progress;

  return (
    <section className="hero-section">
      <p className="hero-section__context">{targetRole.toUpperCase()}</p>
      <h1 className="hero-section__title">Your Interview Report</h1>

      <div className="hero-section__body">
        {/* Ring gauge */}
        <div className="hero-section__ring-container" aria-label={`Score: ${totalScore.toFixed(1)} out of 5`}>
          <svg className="hero-section__ring" viewBox="0 0 128 128" aria-hidden="true">
            <circle cx="64" cy="64" r={radius} fill="none" stroke="var(--bg-control)" strokeWidth={stroke} />
            <circle
              cx="64" cy="64" r={radius} fill="none"
              stroke="var(--accent)"
              strokeWidth={stroke}
              strokeLinecap="round"
              strokeDasharray={`${progress} ${gap}`}
              strokeDashoffset={circumference * 0.25}
              className="hero-section__ring-progress"
            />
          </svg>
          <div className="hero-section__ring-label">
            <span className="hero-section__ring-value">{totalScore.toFixed(1)}</span>
            <span className="hero-section__ring-max">/ 5</span>
          </div>
        </div>

        {/* One thing to fix */}
        <div className="hero-section__callout">
          <span className="hero-section__callout-label">YOUR ONE THING TO FIX</span>
          <p className="hero-section__callout-text"><HighlightedText text={action} /></p>
        </div>
      </div>
    </section>
  );
}
