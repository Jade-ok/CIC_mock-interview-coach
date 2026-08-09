import { useMemo } from 'react';
import { classifyStarCategory, deriveKeywordChips } from '@/utils/starCategoryMatcher';
import { RoleSkillsHint } from '@/components/GuidePanel/RoleSkillsHint';
import { ExperienceCard } from '@/components/GuidePanel/ExperienceCard';

interface GuidePanelProps {
  analystOutput: Record<string, unknown> | null;
}

// Local types for the analystOutput shape this component depends on

interface InterviewPlanItem {
  topic: string;
  target_skill: string;
  source_experience_id: string | null;
  priority: number;
}

interface TargetRole {
  title: string;
  required_skills: string[];
  preferred_skills: string[];
  evaluation_priorities: string[];
}

interface SelectedExperience {
  experience_id: string;
  title: string;
  organization: string;
  relevance_score: number;
}

const MAX_EXPERIENCE_CARDS = 3;

/**
 * GuidePanel — Personalized interview preparation guide.
 *
 * Two sections only:
 * 1. Key Competencies — top 3 role skills (accent-highlighted)
 * 2. Experiences to Prepare — top 3 experiences by relevance (title only, no org)
 *
 * Does NOT predict specific questions. Framed as preparation material.
 */
export function GuidePanel({ analystOutput }: GuidePanelProps) {
  const panelData = useMemo(() => {
    if (!analystOutput) return null;

    const plan = (analystOutput.interview_plan || []) as InterviewPlanItem[];
    const targetRole = analystOutput.target_role as TargetRole | undefined;
    const experiences = (analystOutput.selected_experiences || []) as SelectedExperience[];

    // Role skills: unique target_skills + evaluation_priorities (limited to 3 in RoleSkillsHint)
    const targetSkills = [...new Set(plan.map(p => p.target_skill).filter(Boolean))];
    const evaluationPriorities = targetRole?.evaluation_priorities ?? [];

    // Experience cards: sorted by relevance_score DESC, top 3 only
    const experienceCards = [...experiences]
      .sort((a, b) => b.relevance_score - a.relevance_score)
      .slice(0, MAX_EXPERIENCE_CARDS)
      .map((exp, idx) => {
        const planItem = plan.find(p => p.source_experience_id === exp.experience_id);
        const classification = classifyStarCategory(
          planItem?.topic ?? exp.title,
          planItem?.target_skill ?? ''
        );
        const chips = deriveKeywordChips(
          { target_skill: planItem?.target_skill ?? '', topic: exp.title },
          targetRole
        );
        return { index: idx + 1, exp, classification, chips };
      });

    return { targetSkills, evaluationPriorities, experienceCards };
  }, [analystOutput]);

  return (
    <div className="guide-panel" data-testid="guide-panel">
      {panelData && (
        <div className="guide-panel__content" data-testid="guide-panel-layer2">
          <div className="guide-panel__card-entry" style={{ animationDelay: '0ms' }}>
            <RoleSkillsHint
              targetSkills={panelData.targetSkills}
              evaluationPriorities={panelData.evaluationPriorities}
            />
          </div>

          {panelData.experienceCards.length > 0 && (
            <div className="guide-panel__experiences-section">
              <span className="guide-panel__section-title">Experiences to Prepare</span>
              <ul className="guide-panel__list" data-testid="experience-card-list">
                {panelData.experienceCards.map((card, i) => (
                  <li
                    key={card.exp.experience_id}
                    className="guide-panel__card-entry"
                    style={{ animationDelay: `${(i + 1) * 120}ms` }}
                  >
                    <ExperienceCard
                      index={card.index}
                      title={card.exp.title}
                      classification={card.classification}
                      keywordChips={card.chips}
                    />
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      <style>{`
        .guide-panel {
          background-color: var(--color-tile-bg, #1C1C1E);
          border-radius: 8px;
          height: 100%;
          padding: 12px;
          display: flex;
          flex-direction: column;
          overflow-y: auto;
          gap: 0;
        }

        .guide-panel__section-title {
          display: block;
          font-size: 13px;
          font-weight: 600;
          color: var(--color-text-secondary, #A0A0A5);
          margin-bottom: 8px;
          text-transform: uppercase;
          letter-spacing: 0.3px;
        }

        .guide-panel__list {
          list-style: none;
          margin: 0;
          padding: 0;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .guide-panel__card-entry {
          opacity: 0;
          animation: guideFadeIn 0.35s ease-out forwards;
        }

        @keyframes guideFadeIn {
          from {
            opacity: 0;
            transform: translateY(8px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .guide-panel__content {
          display: flex;
          flex-direction: column;
          gap: 14px;
        }

        .guide-panel__experiences-section {
          display: flex;
          flex-direction: column;
        }

        /* Role Skills Hint */
        .role-skills-hint {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .role-skills-hint__desc {
          font-size: 12px;
          color: var(--color-text-secondary, #A0A0A5);
          line-height: 1.4;
          margin: 0;
        }

        .role-skills-hint__chips {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
        }

        .role-skills-hint__chip {
          font-size: 13px;
          font-weight: 600;
          color: var(--color-accent, #9AE05C);
          background-color: rgba(154, 224, 92, 0.12);
          padding: 4px 12px;
          border-radius: 12px;
          white-space: nowrap;
        }

        /* Experience Cards */
        .star-card {
          padding: 14px;
          border-radius: 8px;
          border: 1.5px solid rgba(255, 255, 255, 0.08);
          background-color: rgba(255, 255, 255, 0.03);
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .star-card__label {
          font-size: 11px;
          font-weight: 600;
          letter-spacing: 0.5px;
          color: var(--color-accent, #9AE05C);
          text-transform: uppercase;
        }

        .star-card__topic {
          font-size: 16px;
          font-weight: 600;
          color: var(--color-text-primary, #FFFFFF);
          margin: 0;
          line-height: 1.4;
        }

        .star-card__inline-row {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 6px;
        }

        .star-card__section-label {
          font-size: 11px;
          color: var(--color-text-secondary, #A0A0A5);
          white-space: nowrap;
        }

        .star-card__chips {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
        }

        .star-card__chip {
          font-size: 13px;
          color: var(--color-text-secondary, #A0A0A5);
          background-color: rgba(255, 255, 255, 0.07);
          padding: 3px 10px;
          border-radius: 12px;
          white-space: nowrap;
        }

        .star-card__category-label {
          font-size: 14px;
          font-weight: 500;
          color: var(--color-text-primary, #FFFFFF);
        }

        .star-card__elements {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
        }

        .star-card__element-badge {
          font-size: 12px;
          font-weight: 600;
          color: var(--color-accent, #9AE05C);
          background-color: rgba(154, 224, 92, 0.12);
          padding: 3px 9px;
          border-radius: 4px;
          white-space: nowrap;
        }

        .star-card__reasoning {
          font-size: 13px;
          color: var(--color-text-secondary, #A0A0A5);
          line-height: 1.5;
          padding: 8px 10px;
          background-color: rgba(255, 255, 255, 0.04);
          border-left: 2px solid var(--color-accent, #9AE05C);
          border-radius: 3px;
        }
      `}</style>
    </div>
  );
}
