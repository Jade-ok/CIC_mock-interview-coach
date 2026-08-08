/**
 * RoleSkillsHint — Displays the top 3 competencies the target role emphasizes.
 * Data source: interview_plan[].target_skill (unique) + target_role.evaluation_priorities.
 * Does NOT predict which questions will be asked — only shows what the role values.
 */

interface RoleSkillsHintProps {
  targetSkills: string[];
  evaluationPriorities: string[];
}

const MAX_CHIPS = 3;

export function RoleSkillsHint({ targetSkills, evaluationPriorities }: RoleSkillsHintProps) {
  const chips = deduplicateAndLimit(targetSkills, evaluationPriorities);

  if (chips.length === 0) return null;

  return (
    <section className="role-skills-hint" data-testid="role-skills-hint" aria-label="Key competencies for this role">
      <span className="guide-panel__section-title">Key Competencies</span>
      <p className="role-skills-hint__desc">
        Skills this role values most. Connect your experiences to these keywords.
      </p>
      <div className="role-skills-hint__chips" data-testid="role-skill-chips">
        {chips.map((chip, i) => (
          <span key={i} className="role-skills-hint__chip">{chip}</span>
        ))}
      </div>
    </section>
  );
}

function deduplicateAndLimit(skills: string[], priorities: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const item of [...skills, ...priorities]) {
    const normalized = item.toLowerCase().trim();
    if (!seen.has(normalized) && item.trim()) {
      seen.add(normalized);
      result.push(item.trim());
      if (result.length >= MAX_CHIPS) break;
    }
  }

  return result;
}
