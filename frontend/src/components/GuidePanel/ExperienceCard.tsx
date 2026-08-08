/**
 * ExperienceCard — Personalized experience preparation card.
 * Reuses the existing .star-card layout with updated messaging:
 * - No predictive "Expected Question" language
 * - Framed as "an experience worth preparing" with STAR angle suggestions
 * - Title only (no organization/source shown)
 */

import type { StarClassification } from '@/utils/starCategoryMatcher';

interface ExperienceCardProps {
  index: number;
  title: string;
  classification: StarClassification;
  keywordChips: string[];
}

export function ExperienceCard({
  index,
  title,
  classification,
  keywordChips,
}: ExperienceCardProps) {
  return (
    <li className="star-card" data-testid="experience-card">
      <span className="star-card__label">Experience {index}</span>

      <p className="star-card__topic">{title}</p>

      {keywordChips.length > 0 && (
        <div className="star-card__inline-row">
          <span className="star-card__section-label">Skills to highlight:</span>
          <div className="star-card__chips">
            {keywordChips.map((chip, i) => (
              <span key={i} className="star-card__chip">{chip}</span>
            ))}
          </div>
        </div>
      )}

      <div className="star-card__inline-row" data-testid="star-angle-row">
        <span className="star-card__section-label">Angle to prepare:</span>
        <span className="star-card__category-label">{classification.label}</span>
      </div>

      <div className="star-card__inline-row" data-testid="emphasize-row">
        <span className="star-card__section-label">Emphasize:</span>
        <div className="star-card__elements">
          {classification.starElements.map((el) => (
            <span key={el} className="star-card__element-badge">{el}</span>
          ))}
        </div>
      </div>

      <span className="star-card__reasoning">{classification.reasoning}</span>
    </li>
  );
}
