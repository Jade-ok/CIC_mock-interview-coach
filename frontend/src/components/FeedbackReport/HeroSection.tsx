import { READINESS_SUBHEADINGS } from '../../utils/readinessSubheadings';
import './HeroSection.css';

interface HeroSectionProps {
  readinessLabel: string;
  totalScore: number;
  questionCount: number;
  targetRole: string;
}

export function HeroSection({ readinessLabel, totalScore, questionCount, targetRole }: HeroSectionProps) {
  const subheading = READINESS_SUBHEADINGS[readinessLabel] || '';

  return (
    <section className="hero-section">
      <p className="hero-section__context">INTERVIEW FEEDBACK · {targetRole.toUpperCase()}</p>
      <h1 className="hero-section__label">{readinessLabel}</h1>
      <p className="hero-section__subheading">{subheading}</p>
      <p className="hero-section__score">
        <span className="hero-section__score-value">{totalScore.toFixed(1)}</span>
        {' '}/ 5 overall · {questionCount} of 6 questions answered
      </p>
    </section>
  );
}
