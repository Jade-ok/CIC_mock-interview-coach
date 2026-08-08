import { READINESS_SUBHEADINGS } from '../../utils/readinessSubheadings';
import './HeroSection.css';

interface HeroSectionProps {
  readinessLabel: string;
  totalScore: number;
  questionCount: number;
  targetRole: string;
}

/** Map score to a ring color using design theme tokens. */
function getScoreColor(score: number): string {
  if (score >= 4.3) return 'var(--accent-green)';
  if (score >= 3.5) return 'var(--accent-green)';
  if (score >= 2.8) return 'var(--accent-blue)';
  if (score >= 2.0) return 'var(--accent-amber)';
  return 'var(--accent-red)';
}

/** Map readiness label to a short focus-area tag. */
function getFocusTag(label: string): string {
  switch (label) {
    case 'Interview ready': return 'Ready to go';
    case 'Strong foundation': return 'Focus area: structure & detail';
    case 'Developing well': return 'Focus area: story structure';
    case 'Needs more practice': return 'Focus area: clear presentation';
    case 'Needs clearer examples': return 'Focus area: clearer examples';
    default: return '';
  }
}

export function HeroSection({ readinessLabel, totalScore, questionCount, targetRole }: HeroSectionProps) {
  const subheading = READINESS_SUBHEADINGS[readinessLabel] || '';
  const scoreColor = getScoreColor(totalScore);
  const focusTag = getFocusTag(readinessLabel);

  // Ring gauge SVG parameters
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
        {/* Ring gauge — score */}
        <div className="hero-section__ring-container" aria-label={`Score: ${totalScore.toFixed(1)} out of 5`}>
          <svg
            className="hero-section__ring"
            viewBox="0 0 128 128"
            aria-hidden="true"
          >
            <circle
              cx="64"
              cy="64"
              r={radius}
              fill="none"
              stroke="var(--bg-control)"
              strokeWidth={stroke}
            />
            <circle
              cx="64"
              cy="64"
              r={radius}
              fill="none"
              stroke={scoreColor}
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

        {/* Reason — readiness context */}
        <div className="hero-section__details">
          {focusTag && (
            <span className="hero-section__focus-tag" style={{ borderColor: scoreColor, color: scoreColor }}>
              {focusTag}
            </span>
          )}
          <p className="hero-section__subheading">{subheading}</p>
          <p className="hero-section__meta">
            {questionCount} question{questionCount !== 1 ? 's' : ''} answered
          </p>
        </div>
      </div>
    </section>
  );
}
