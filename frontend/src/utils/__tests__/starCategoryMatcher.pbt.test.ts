import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  classifyStarCategory,
  deriveKeywordChips,
  STAR_CATEGORIES,
  DEFAULT_CLASSIFICATION,
} from '@/utils/starCategoryMatcher';

/**
 * Collects all trigger keywords across all 8 STAR categories.
 * Used to generate strings guaranteed NOT to contain any keyword.
 */
const ALL_TRIGGER_KEYWORDS = STAR_CATEGORIES.flatMap((c) => c.triggerKeywords);

/**
 * Regex matching Korean Unicode ranges:
 * - Hangul Syllables: U+AC00–U+D7AF
 * - Hangul Jamo: U+1100–U+11FF
 * - Hangul Compatibility Jamo: U+3130–U+318F
 */
const KOREAN_CHAR_REGEX = /[\uAC00-\uD7AF\u1100-\u11FF\u3130-\u318F]/;

/**
 * Feature: guide-panel-ux-improvements
 * Property 1: All reasoning strings contain no Korean characters
 *
 * For any entry in STAR_CATEGORIES and for DEFAULT_CLASSIFICATION, the `reasoning`
 * field SHALL contain zero characters in the Korean Unicode ranges (Hangul Syllables
 * U+AC00–U+D7AF, Hangul Jamo U+1100–U+11FF, Hangul Compatibility Jamo U+3130–U+318F).
 *
 * **Validates: Requirements 1.1, 1.2**
 */
describe('Feature: guide-panel-ux-improvements, Property 1: All reasoning strings contain no Korean characters', () => {
  it('no STAR_CATEGORIES entry has Korean characters in reasoning', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...STAR_CATEGORIES),
        (category) => {
          expect(KOREAN_CHAR_REGEX.test(category.reasoning)).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('DEFAULT_CLASSIFICATION.reasoning contains no Korean characters', () => {
    fc.assert(
      fc.property(
        fc.constant(DEFAULT_CLASSIFICATION),
        (classification) => {
          expect(KOREAN_CHAR_REGEX.test(classification.reasoning)).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('all reasoning strings (categories + default) are non-empty English text', () => {
    const allReasonings = [
      ...STAR_CATEGORIES.map((c) => c.reasoning),
      DEFAULT_CLASSIFICATION.reasoning,
    ];

    fc.assert(
      fc.property(
        fc.constantFrom(...allReasonings),
        (reasoning) => {
          // Must not contain Korean
          expect(KOREAN_CHAR_REGEX.test(reasoning)).toBe(false);
          // Must be non-empty
          expect(reasoning.length).toBeGreaterThan(0);
          // Must contain at least some ASCII letters (confirming it's English text)
          expect(/[a-zA-Z]/.test(reasoning)).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });
});

/**
 * Property 1: Classification uses lowercased concatenation
 *
 * For any topic string and target_skill string, classifyStarCategory(topic, targetSkill)
 * SHALL produce the same result as classifying the same inputs with arbitrary casing —
 * i.e., the classification is case-insensitive and considers both fields together.
 *
 * **Validates: Requirements 1.2**
 */
describe('Property 1: Classification uses lowercased concatenation', () => {
  it('classification is identical regardless of input casing', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 0, maxLength: 60 }),
        fc.string({ minLength: 0, maxLength: 40 }),
        (topic, targetSkill) => {
          const baseline = classifyStarCategory(topic, targetSkill);
          const uppercased = classifyStarCategory(topic.toUpperCase(), targetSkill.toUpperCase());
          const lowercased = classifyStarCategory(topic.toLowerCase(), targetSkill.toLowerCase());

          expect(uppercased).toEqual(baseline);
          expect(lowercased).toEqual(baseline);
        }
      ),
      { numRuns: 200 }
    );
  });

  it('swapping keyword between topic and targetSkill yields same result', () => {
    // Pick a random keyword and place it in either topic or targetSkill
    const keywordArb = fc.constantFrom(...ALL_TRIGGER_KEYWORDS);
    const paddingArb = fc.string({ minLength: 0, maxLength: 30 });

    fc.assert(
      fc.property(keywordArb, paddingArb, paddingArb, (keyword, padA, padB) => {
        // Keyword in topic
        const resultA = classifyStarCategory(`${padA} ${keyword} ${padB}`, 'noop');
        // Keyword in targetSkill
        const resultB = classifyStarCategory('noop', `${padA} ${keyword} ${padB}`);

        expect(resultA.label).toBe(resultB.label);
        expect(resultA.starElements).toEqual(resultB.starElements);
        expect(resultA.reasoning).toBe(resultB.reasoning);
      }),
      { numRuns: 100 }
    );
  });
});

/**
 * Property 2: First-match priority ordering
 *
 * For any combined input string that contains trigger keywords belonging to categories
 * at indices i and j (where i < j), classifyStarCategory SHALL return the category
 * at index i (the higher-priority category).
 *
 * **Validates: Requirements 1.3**
 */
describe('Property 2: First-match priority ordering', () => {
  // Generate two distinct category indices where i < j
  const categoryPairArb = fc
    .tuple(
      fc.integer({ min: 0, max: STAR_CATEGORIES.length - 1 }),
      fc.integer({ min: 0, max: STAR_CATEGORIES.length - 1 })
    )
    .filter(([a, b]) => a !== b)
    .map(([a, b]) => (a < b ? [a, b] : [b, a]) as [number, number]);

  it('when input contains keywords from two categories, higher-priority one wins', () => {
    fc.assert(
      fc.property(categoryPairArb, ([highIdx, lowIdx]) => {
        const highCategory = STAR_CATEGORIES[highIdx];
        const lowCategory = STAR_CATEGORIES[lowIdx];

        // Pick first keyword from each category
        const highKeyword = highCategory.triggerKeywords[0];
        const lowKeyword = lowCategory.triggerKeywords[0];

        // Construct input containing both keywords
        const topic = `${highKeyword} and ${lowKeyword}`;

        const result = classifyStarCategory(topic, '');

        expect(result.label).toBe(highCategory.label);
        expect(result.starElements).toEqual(highCategory.starElements);
        expect(result.reasoning).toBe(highCategory.reasoning);
      }),
      { numRuns: 100 }
    );
  });

  it('order of keywords in the string does not matter — priority is by table order', () => {
    fc.assert(
      fc.property(categoryPairArb, ([highIdx, lowIdx]) => {
        const highCategory = STAR_CATEGORIES[highIdx];
        const lowCategory = STAR_CATEGORIES[lowIdx];

        const highKeyword = highCategory.triggerKeywords[0];
        const lowKeyword = lowCategory.triggerKeywords[0];

        // Put low-priority keyword first in the string
        const topic = `${lowKeyword} then ${highKeyword}`;

        const result = classifyStarCategory(topic, '');

        expect(result.label).toBe(highCategory.label);
      }),
      { numRuns: 100 }
    );
  });
});

/**
 * Property 3: Default fallback for unmatched inputs
 *
 * For any topic and target_skill whose lowercased concatenation contains none of the
 * trigger keywords defined in any of the 8 STAR categories, classifyStarCategory SHALL
 * return the default classification with label "General", elements [Situation, Task,
 * Action, Result], and the default Korean reasoning string.
 *
 * **Validates: Requirements 1.4**
 */
describe('Property 3: Default fallback for unmatched inputs', () => {
  /**
   * Generates strings that are guaranteed not to contain any trigger keyword.
   * Uses a character set that cannot form any keyword substring.
   */
  const safeChars = '0123456789_@#$%^&*(){}[]|~`';
  const noKeywordString = fc.stringOf(fc.constantFrom(...safeChars.split('')), {
    minLength: 0,
    maxLength: 50,
  });

  it('returns default classification when no keywords match', () => {
    fc.assert(
      fc.property(noKeywordString, noKeywordString, (topic, targetSkill) => {
        const result = classifyStarCategory(topic, targetSkill);

        expect(result.label).toBe(DEFAULT_CLASSIFICATION.label);
        expect(result.starElements).toEqual(DEFAULT_CLASSIFICATION.starElements);
        expect(result.reasoning).toBe(DEFAULT_CLASSIFICATION.reasoning);
      }),
      { numRuns: 200 }
    );
  });

  it('returns default with label "General" and all 4 STAR elements', () => {
    fc.assert(
      fc.property(noKeywordString, (input) => {
        const result = classifyStarCategory(input, input);

        expect(result.label).toBe('General');
        expect(result.starElements).toEqual(['Situation', 'Task', 'Action', 'Result']);
      }),
      { numRuns: 100 }
    );
  });
});

/**
 * Property 4: Card count bounded by min(plan length, 3)
 *
 * For any analystOutput with an interview_plan array of length N (where N >= 0),
 * the GuidePanel SHALL derive exactly min(N, 3) StarCards. When analystOutput is null
 * or interview_plan is absent, the card count SHALL be 0.
 *
 * **Validates: Requirements 2.1, 2.2, 3.1, 4.2**
 */
describe('Property 4: Card count bounded by min(plan length, 3)', () => {
  interface InterviewPlanItem {
    topic: string;
    target_skill: string;
    source_experience_id: string | null;
    priority: number;
    question_type: string;
  }

  // Arbitrary for a single interview plan item
  const planItemArb: fc.Arbitrary<InterviewPlanItem> = fc.record({
    topic: fc.string({ minLength: 1, maxLength: 50 }),
    target_skill: fc.string({ minLength: 1, maxLength: 30 }),
    source_experience_id: fc.option(fc.uuid(), { nil: null }),
    priority: fc.integer({ min: 1, max: 5 }),
    question_type: fc.constantFrom('behavioral', 'technical', 'situational'),
  });

  /**
   * Replicates the card derivation logic from GuidePanel (pure function version).
   * This tests the algorithm, not the React component.
   */
  function deriveCards(analystOutput: Record<string, unknown> | null) {
    if (!analystOutput) return [];
    const plan = (analystOutput.interview_plan || []) as InterviewPlanItem[];
    return plan.slice(0, 3);
  }

  it('card count equals min(N, 3) for any plan length', () => {
    fc.assert(
      fc.property(
        fc.array(planItemArb, { minLength: 0, maxLength: 10 }),
        (plan) => {
          const analystOutput = { interview_plan: plan };
          const cards = deriveCards(analystOutput);

          expect(cards.length).toBe(Math.min(plan.length, 3));
        }
      ),
      { numRuns: 200 }
    );
  });

  it('returns 0 cards when analystOutput is null', () => {
    const cards = deriveCards(null);
    expect(cards.length).toBe(0);
  });

  it('returns 0 cards when interview_plan is absent', () => {
    fc.assert(
      fc.property(fc.string(), (randomField) => {
        const analystOutput = { some_field: randomField };
        const cards = deriveCards(analystOutput);

        expect(cards.length).toBe(0);
      }),
      { numRuns: 50 }
    );
  });

  it('returns 0 cards when interview_plan is empty array', () => {
    const analystOutput = { interview_plan: [] };
    const cards = deriveCards(analystOutput);
    expect(cards.length).toBe(0);
  });
});

/**
 * Property 5: Keyword chips always include target_skill
 *
 * For any interview plan item and target_role with required/preferred skills lists,
 * the derived keyword chips SHALL: (a) always contain the item's target_skill as
 * the first element, and (b) contain every skill from required_skills or
 * preferred_skills whose lowercase form is found (via includes()) in the lowercased
 * "target_skill + ' ' + topic" string, with no duplicates.
 *
 * **Validates: Requirements 2.3**
 */
describe('Property 5: Keyword chips always include target_skill', () => {
  const itemArb = fc.record({
    target_skill: fc.string({ minLength: 1, maxLength: 30 }),
    topic: fc.string({ minLength: 0, maxLength: 50 }),
  });

  const targetRoleArb = fc.record({
    required_skills: fc.array(fc.string({ minLength: 1, maxLength: 20 }), {
      minLength: 0,
      maxLength: 5,
    }),
    preferred_skills: fc.array(fc.string({ minLength: 1, maxLength: 20 }), {
      minLength: 0,
      maxLength: 5,
    }),
  });

  it('first chip is always the item target_skill', () => {
    fc.assert(
      fc.property(itemArb, targetRoleArb, (item, targetRole) => {
        const chips = deriveKeywordChips(item, targetRole);

        expect(chips[0]).toBe(item.target_skill);
      }),
      { numRuns: 200 }
    );
  });

  it('chips contain no duplicates', () => {
    fc.assert(
      fc.property(itemArb, targetRoleArb, (item, targetRole) => {
        const chips = deriveKeywordChips(item, targetRole);
        const uniqueChips = new Set(chips);

        expect(chips.length).toBe(uniqueChips.size);
      }),
      { numRuns: 200 }
    );
  });

  it('all matching role skills are included in chips', () => {
    fc.assert(
      fc.property(itemArb, targetRoleArb, (item, targetRole) => {
        const chips = deriveKeywordChips(item, targetRole);
        const combined = `${item.target_skill} ${item.topic}`.toLowerCase();
        const allSkills = [
          ...(targetRole.required_skills || []),
          ...(targetRole.preferred_skills || []),
        ];

        for (const skill of allSkills) {
          if (combined.includes(skill.toLowerCase())) {
            expect(chips).toContain(skill);
          }
        }
      }),
      { numRuns: 200 }
    );
  });

  it('returns only target_skill when targetRole is undefined', () => {
    fc.assert(
      fc.property(itemArb, (item) => {
        const chips = deriveKeywordChips(item, undefined);

        expect(chips).toEqual([item.target_skill]);
      }),
      { numRuns: 100 }
    );
  });
});

/**
 * Property 6: Experience resolution correctness
 *
 * For any interview plan item, if source_experience_id is non-null and matches an
 * entry in selected_experiences, the card's relatedExperience SHALL be { title,
 * organization } from that entry. If source_experience_id is null or matches no
 * entry, relatedExperience SHALL be null.
 *
 * **Validates: Requirements 2.4, 2.5**
 */
describe('Property 6: Experience resolution correctness', () => {
  interface SelectedExperience {
    experience_id: string;
    title: string;
    organization: string;
  }

  /**
   * Replicates the experience resolution logic from GuidePanel (pure function).
   */
  function resolveExperience(
    sourceExperienceId: string | null,
    experiences: SelectedExperience[]
  ): { title: string; organization: string } | null {
    if (!sourceExperienceId) return null;
    const exp = experiences.find((e) => e.experience_id === sourceExperienceId) ?? null;
    return exp ? { title: exp.title, organization: exp.organization } : null;
  }

  const experienceArb: fc.Arbitrary<SelectedExperience> = fc.record({
    experience_id: fc.uuid(),
    title: fc.string({ minLength: 1, maxLength: 50 }),
    organization: fc.string({ minLength: 1, maxLength: 30 }),
  });

  const experienceListArb = fc.array(experienceArb, { minLength: 1, maxLength: 5 });

  it('resolves to {title, organization} when experience_id matches', () => {
    fc.assert(
      fc.property(experienceListArb, (experiences) => {
        // Pick a random experience from the list
        const target = experiences[0];
        const result = resolveExperience(target.experience_id, experiences);

        expect(result).toEqual({
          title: target.title,
          organization: target.organization,
        });
      }),
      { numRuns: 200 }
    );
  });

  it('returns null when source_experience_id is null', () => {
    fc.assert(
      fc.property(experienceListArb, (experiences) => {
        const result = resolveExperience(null, experiences);

        expect(result).toBeNull();
      }),
      { numRuns: 100 }
    );
  });

  it('returns null when source_experience_id does not match any experience', () => {
    fc.assert(
      fc.property(experienceListArb, fc.uuid(), (experiences, unmatchedId) => {
        // Ensure the generated UUID doesn't accidentally match
        const ids = new Set(experiences.map((e) => e.experience_id));
        fc.pre(!ids.has(unmatchedId));

        const result = resolveExperience(unmatchedId, experiences);

        expect(result).toBeNull();
      }),
      { numRuns: 200 }
    );
  });

  it('returns null when experiences list is empty', () => {
    fc.assert(
      fc.property(fc.uuid(), (id) => {
        const result = resolveExperience(id, []);

        expect(result).toBeNull();
      }),
      { numRuns: 50 }
    );
  });
});
