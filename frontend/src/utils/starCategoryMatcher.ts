export interface StarCategory {
  label: string;
  triggerKeywords: string[];
  starElements: string[];
  reasoning: string;
}

export interface StarClassification {
  label: string;
  starElements: string[];
  reasoning: string;
}

/**
 * Priority-ordered STAR category table.
 * Index 0 = highest priority. First match wins during classification.
 */
export const STAR_CATEGORIES: StarCategory[] = [
  {
    label: 'Above & Beyond / Problem Solving',
    triggerKeywords: ['beyond', 'extra', 'above'],
    starElements: ['Task', 'Action'],
    reasoning: 'Why you set a higher bar than expected + how you solved it',
  },
  {
    label: 'Team Experience',
    triggerKeywords: ['team', 'conflict', 'collaborat', 'disagreement'],
    starElements: ['Action', 'Result'],
    reasoning: 'What you actually did within the team and how it affected outcomes',
  },
  {
    label: 'Initiative',
    triggerKeywords: ['initiative', 'self-motivat', 'own idea', 'ownership', 'autonom'],
    starElements: ['Task'],
    reasoning: 'Show that you set your own goal without being told to',
  },
  {
    label: 'Leadership',
    triggerKeywords: ['lead', 'leadership', 'mentor', 'delegate'],
    starElements: ['Action', 'Result'],
    reasoning: 'How you moved the team and what changed as a result',
  },
  {
    label: 'Failure / Mistake',
    triggerKeywords: ['failure', 'mistake', 'fail', 'wrong'],
    starElements: ['Learning', 'Action'],
    reasoning: 'Focus on acknowledging the failure and what you learned — Learning matters more than Result here',
  },
  {
    label: 'Pressure and Time Management',
    triggerKeywords: ['deadline', 'pressure', 'time management', 'prioritiz'],
    starElements: ['Action'],
    reasoning: 'Your prioritization process — what you chose to do first and why',
  },
  {
    label: 'Problem Solving',
    triggerKeywords: ['problem', 'solve', 'debug', 'issue', 'implement', 'technical', 'develop', 'design'],
    starElements: ['Action'],
    reasoning: 'Your approach, iterations, and adjustments',
  },
  {
    label: 'Communication',
    triggerKeywords: ['communicat', 'explain', 'non-technical'],
    starElements: ['Situation', 'Action'],
    reasoning: 'Briefly establish who the audience was, then explain how you adapted your communication',
  },
];

export const DEFAULT_CLASSIFICATION: StarClassification = {
  label: 'General',
  starElements: ['Situation', 'Task', 'Action', 'Result'],
  reasoning: 'General behavioral question. Keep Situation and Task brief; focus on your Actions and Results.',
};

/**
 * Classifies a single interview plan item into a STAR category.
 *
 * Algorithm:
 * 1. Concatenate topic + " " + targetSkill
 * 2. Convert to lowercase
 * 3. Iterate categories in priority order (index 0 = highest)
 * 4. For each category, check if ANY trigger keyword is found
 *    via combinedString.includes(keyword)
 * 5. Return the first match; if none match, return DEFAULT_CLASSIFICATION
 */
export function classifyStarCategory(topic: string, targetSkill: string): StarClassification {
  const combined = `${topic} ${targetSkill}`.toLowerCase();

  for (const category of STAR_CATEGORIES) {
    const matched = category.triggerKeywords.some(
      (keyword) => combined.includes(keyword)
    );
    if (matched) {
      return {
        label: category.label,
        starElements: category.starElements,
        reasoning: category.reasoning,
      };
    }
  }

  return DEFAULT_CLASSIFICATION;
}

/**
 * Derives keyword chips for a STAR card.
 *
 * Always includes item's target_skill as the first chip.
 * Then checks each skill in targetRole's required_skills and preferred_skills
 * for a case-insensitive includes() match against the lowercased
 * "target_skill + ' ' + topic" string. Avoids duplicates.
 */
export function deriveKeywordChips(
  item: { target_skill: string; topic: string },
  targetRole?: { required_skills?: string[]; preferred_skills?: string[] }
): string[] {
  const chips: string[] = [item.target_skill];

  if (!targetRole) return chips;

  const combined = `${item.target_skill} ${item.topic}`.toLowerCase();
  const allSkills = [
    ...(targetRole.required_skills || []),
    ...(targetRole.preferred_skills || []),
  ];

  for (const skill of allSkills) {
    if (combined.includes(skill.toLowerCase()) && !chips.includes(skill)) {
      chips.push(skill);
    }
  }

  return chips;
}
