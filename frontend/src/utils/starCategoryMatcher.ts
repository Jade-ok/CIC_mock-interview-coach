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
    reasoning: '왜 그게 필요했는지(기대 이상의 기준을 스스로 설정) + 어떻게 풀었는지',
  },
  {
    label: 'Team Experience',
    triggerKeywords: ['team', 'conflict', 'collaborat', 'disagreement'],
    starElements: ['Action', 'Result'],
    reasoning: '팀 내에서 실제로 어떻게 행동했는지, 그 결과 관계/성과가 어떻게 됐는지',
  },
  {
    label: 'Initiative',
    triggerKeywords: ['initiative', 'self-motivat', 'own idea', 'ownership', 'autonom'],
    starElements: ['Task'],
    reasoning: '"시키지 않았는데 스스로 목표를 설정했다"는 판단 지점이 핵심',
  },
  {
    label: 'Leadership',
    triggerKeywords: ['lead', 'leadership', 'mentor', 'delegate'],
    starElements: ['Action', 'Result'],
    reasoning: '어떻게 팀을 움직였고, 결과적으로 무엇이 바뀌었는지',
  },
  {
    label: 'Failure / Mistake',
    triggerKeywords: ['failure', 'mistake', 'fail', 'wrong'],
    starElements: ['Learning', 'Action'],
    reasoning: '무엇을 했는지보다 "실패를 인정하고 무엇을 배워 바꿨는지"가 핵심. 이 카테고리는 유일하게 L이 R보다 중요',
  },
  {
    label: 'Pressure and Time Management',
    triggerKeywords: ['deadline', 'pressure', 'time management', 'prioritiz'],
    starElements: ['Action'],
    reasoning: '우선순위 판단 과정, 즉 무엇을 먼저 처리하기로 판단했는지, 그 판단 기준이 핵심',
  },
  {
    label: 'Problem Solving',
    triggerKeywords: ['problem', 'solve', 'debug', 'issue', 'implement', 'technical', 'develop', 'design'],
    starElements: ['Action'],
    reasoning: '접근 방식, 시도와 조정 과정이 핵심',
  },
  {
    label: 'Communication',
    triggerKeywords: ['communicat', 'explain', 'non-technical'],
    starElements: ['Situation', 'Action'],
    reasoning: '상대가 누구였는지를 짧게라도 짚어야 번역의 의미가 살고, 실제로 어떻게 설명/조정했는지가 핵심',
  },
];

export const DEFAULT_CLASSIFICATION: StarClassification = {
  label: 'General',
  starElements: ['Situation', 'Task', 'Action', 'Result'],
  reasoning: '일반적인 행동 질문입니다. 상황과 과제를 짧게, 본인의 행동과 결과를 구체적으로 답하세요.',
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
