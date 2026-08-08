import { useMemo } from 'react';
import { classifyStarCategory, deriveKeywordChips } from '@/utils/starCategoryMatcher';
import type { StarClassification } from '@/utils/starCategoryMatcher';

interface GuidePanelProps {
  analystOutput: Record<string, unknown> | null;
}

// Local types describing the analystOutput shape this component depends on

interface InterviewPlanItem {
  topic: string;
  target_skill: string;
  source_experience_id: string | null;
  priority: number;
  question_type: string;
}

interface TargetRole {
  title: string;
  required_skills: string[];
  preferred_skills: string[];
}

interface SelectedExperience {
  experience_id: string;
  title: string;
  organization: string;
}

interface StarCardData {
  index: number;
  topic: string;
  classification: StarClassification;
  keywordChips: string[];
  relatedExperience: { title: string; organization: string } | null;
}

/**
 * GuidePanel displays STAR-method preparation cards derived from the Analyst output.
 *
 * - Computes card data at render time from analystOutput (no speech events)
 * - Shows up to 3 cards from interview_plan
 * - Each card shows: predicted topic, keyword chips, STAR category guidance, optional related experience
 * - Renders empty (no error) when analystOutput is null or plan is empty
 */
export function GuidePanel({ analystOutput }: GuidePanelProps) {
  const cards: StarCardData[] = useMemo(() => {
    if (!analystOutput) return [];

    const plan = (analystOutput.interview_plan || []) as InterviewPlanItem[];
    const targetRole = analystOutput.target_role as TargetRole | undefined;
    const experiences = (analystOutput.selected_experiences || []) as SelectedExperience[];

    return plan.slice(0, 3).map((item, idx) => {
      const classification = classifyStarCategory(item.topic, item.target_skill);

      const chips = deriveKeywordChips(
        { target_skill: item.target_skill, topic: item.topic },
        targetRole
      );

      const exp = item.source_experience_id
        ? experiences.find(e => e.experience_id === item.source_experience_id) ?? null
        : null;

      return {
        index: idx + 1,
        topic: item.topic,
        classification,
        keywordChips: chips,
        relatedExperience: exp ? { title: exp.title, organization: exp.organization } : null,
      };
    });
  }, [analystOutput]);

  return (
    <div className="guide-panel" data-testid="guide-panel">
      <span className="guide-panel__title">Interview Guide</span>
      <ul className="guide-panel__list" data-testid="guide-panel-list">
        {cards.map((card) => (
          <li key={card.index} className="star-card" data-testid="star-card">
            <span className="star-card__label">예상 질문 {card.index}</span>
            <p className="star-card__topic">{card.topic}</p>
            <div className="star-card__chips">
              {card.keywordChips.map((chip, i) => (
                <span key={i} className="star-card__chip">{chip}</span>
              ))}
            </div>
            <div className="star-card__star-section">
              <span className="star-card__category-label">{card.classification.label}</span>
              <div className="star-card__elements">
                {card.classification.starElements.map((el) => (
                  <span key={el} className="star-card__element-badge">{el}</span>
                ))}
              </div>
              <span className="star-card__reasoning">{card.classification.reasoning}</span>
            </div>
            {card.relatedExperience && (
              <div className="star-card__experience" data-testid="star-card-experience">
                <span>{card.relatedExperience.title}</span> · <span>{card.relatedExperience.organization}</span>
              </div>
            )}
          </li>
        ))}
      </ul>
      <style>{`
        .guide-panel {
          background-color: var(--color-tile-bg, #1C1C1E);
          border-radius: 8px;
          height: 100%;
          padding: 16px;
          display: flex;
          flex-direction: column;
          overflow-y: auto;
        }

        .guide-panel__title {
          font-size: 15px;
          font-weight: 600;
          color: var(--color-text-primary, #FFFFFF);
          margin-bottom: 14px;
        }

        .guide-panel__list {
          list-style: none;
          margin: 0;
          padding: 0;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .star-card {
          padding: 14px 16px;
          border-radius: 10px;
          border: 1.5px solid rgba(255, 255, 255, 0.08);
          background-color: rgba(255, 255, 255, 0.03);
          display: flex;
          flex-direction: column;
          gap: 10px;
        }

        .star-card__label {
          font-size: 11px;
          font-weight: 600;
          letter-spacing: 0.5px;
          color: var(--color-guide-highlight, #4A9EFF);
          text-transform: uppercase;
        }

        .star-card__topic {
          font-size: 14px;
          font-weight: 600;
          color: var(--color-text-primary, #FFFFFF);
          margin: 0;
          line-height: 1.4;
        }

        .star-card__chips {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
        }

        .star-card__chip {
          font-size: 11px;
          color: var(--color-text-secondary, #A0A0A5);
          background-color: rgba(255, 255, 255, 0.07);
          padding: 3px 10px;
          border-radius: 12px;
          white-space: nowrap;
        }

        .star-card__star-section {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .star-card__category-label {
          font-size: 12px;
          font-weight: 500;
          color: var(--color-text-secondary, #A0A0A5);
        }

        .star-card__elements {
          display: flex;
          flex-wrap: wrap;
          gap: 5px;
        }

        .star-card__element-badge {
          font-size: 10px;
          font-weight: 600;
          color: var(--color-guide-highlight, #4A9EFF);
          background-color: rgba(74, 158, 255, 0.12);
          padding: 3px 8px;
          border-radius: 4px;
          white-space: nowrap;
        }

        .star-card__reasoning {
          font-size: 12px;
          color: var(--color-text-secondary, #A0A0A5);
          line-height: 1.5;
        }

        .star-card__experience {
          font-size: 11px;
          color: var(--color-text-secondary, #A0A0A5);
          border-top: 1px solid rgba(255, 255, 255, 0.06);
          padding-top: 8px;
          margin-top: 2px;
        }
      `}</style>
    </div>
  );
}
