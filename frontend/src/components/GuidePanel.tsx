import { useMemo } from 'react';
import type { CompetencyGuide } from '@/types/session';
import { matchKeywords } from '@/utils/keywordMatcher';

interface GuidePanelProps {
  guides: CompetencyGuide[];
  practiceMode: boolean;
  currentInterviewerText: string | null;
}

/** Displays all competency guides and highlights current keyword matches in Practice Mode. */
export function GuidePanel({ guides, practiceMode, currentInterviewerText }: GuidePanelProps) {
  const highlightedIds = useMemo(() => {
    if (!practiceMode || !currentInterviewerText) return new Set<string>();
    return new Set(matchKeywords(currentInterviewerText, guides));
  }, [practiceMode, currentInterviewerText, guides]);

  return (
    <div className="guide-panel" data-testid="guide-panel">
      <span className="guide-panel__title">Interview Guide</span>
      <ul className="guide-panel__list" data-testid="guide-panel-list">
        {guides.map((guide) => {
          const isHighlighted = highlightedIds.has(guide.id);
          return (
            <li
              key={guide.id}
              className={`guide-panel__card ${isHighlighted ? 'guide-panel__card--highlighted' : ''}`}
              data-testid="guide-panel-item"
              data-highlighted={isHighlighted}
            >
              <div className="guide-panel__card-header">
                <span className="guide-panel__card-title">{guide.title}</span>
                {isHighlighted && (
                  <span className="guide-panel__badge" data-testid="guide-key-match-badge">
                    KEY MATCH
                  </span>
                )}
              </div>
              <span className="guide-panel__card-description">{guide.description}</span>
              <div className="guide-panel__pills">
                {guide.keywords.map((keyword, index) => (
                  <span key={`${keyword}-${index}`} className="guide-panel__pill">{keyword}</span>
                ))}
              </div>
            </li>
          );
        })}
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

        .guide-panel__card {
          padding: 14px 16px;
          border-radius: 10px;
          border: 1.5px solid rgba(255, 255, 255, 0.08);
          background-color: rgba(255, 255, 255, 0.03);
          transition: border-color 0.2s, background-color 0.2s, box-shadow 0.2s;
        }

        .guide-panel__card--highlighted {
          border-color: var(--color-accent, #9AE05C);
          background-color: rgba(154, 224, 92, 0.06);
          box-shadow: 0 0 0 1px rgba(154, 224, 92, 0.15);
        }

        .guide-panel__card-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 6px;
        }

        .guide-panel__card-title {
          font-size: 14px;
          font-weight: 600;
          color: var(--color-text-primary, #FFFFFF);
        }

        .guide-panel__badge {
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 0.5px;
          color: var(--color-accent, #9AE05C);
          background-color: rgba(154, 224, 92, 0.12);
          padding: 3px 8px;
          border-radius: 4px;
          white-space: nowrap;
        }

        .guide-panel__card-description {
          display: block;
          font-size: 12px;
          color: var(--color-text-secondary, #A0A0A5);
          line-height: 1.5;
          margin-bottom: 10px;
        }

        .guide-panel__pills {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
        }

        .guide-panel__pill {
          font-size: 11px;
          color: var(--color-text-secondary, #A0A0A5);
          background-color: rgba(255, 255, 255, 0.07);
          padding: 3px 10px;
          border-radius: 12px;
          white-space: nowrap;
        }
      `}</style>
    </div>
  );
}
