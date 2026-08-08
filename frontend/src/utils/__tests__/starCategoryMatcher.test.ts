import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  classifyStarCategory,
  deriveKeywordChips,
  STAR_CATEGORIES,
  DEFAULT_CLASSIFICATION,
} from '@/utils/starCategoryMatcher';

describe('classifyStarCategory', () => {
  describe('matches each of the 8 categories correctly', () => {
    it('matches "Above & Beyond / Problem Solving" with keyword "beyond"', () => {
      const result = classifyStarCategory('going beyond expectations', 'initiative');
      expect(result.label).toBe('Above & Beyond / Problem Solving');
      expect(result.starElements).toEqual(['Task', 'Action']);
    });

    it('matches "Team Experience" with keyword "team"', () => {
      const result = classifyStarCategory('team project', 'collaboration');
      expect(result.label).toBe('Team Experience');
      expect(result.starElements).toEqual(['Action', 'Result']);
    });

    it('matches "Initiative" with keyword "ownership"', () => {
      const result = classifyStarCategory('took ownership of feature', 'proactivity');
      expect(result.label).toBe('Initiative');
      expect(result.starElements).toEqual(['Task']);
    });

    it('matches "Leadership" with keyword "mentor"', () => {
      const result = classifyStarCategory('mentor junior engineers', 'guidance');
      expect(result.label).toBe('Leadership');
      expect(result.starElements).toEqual(['Action', 'Result']);
    });

    it('matches "Failure / Mistake" with keyword "failure"', () => {
      const result = classifyStarCategory('handling failure', 'resilience');
      expect(result.label).toBe('Failure / Mistake');
      expect(result.starElements).toEqual(['Learning', 'Action']);
    });

    it('matches "Pressure and Time Management" with keyword "deadline"', () => {
      const result = classifyStarCategory('tight deadline', 'planning');
      expect(result.label).toBe('Pressure and Time Management');
      expect(result.starElements).toEqual(['Action']);
    });

    it('matches "Problem Solving" with keyword "debug"', () => {
      const result = classifyStarCategory('debug production', 'analysis');
      expect(result.label).toBe('Problem Solving');
      expect(result.starElements).toEqual(['Action']);
    });

    it('matches "Communication" with keyword "explain"', () => {
      const result = classifyStarCategory('explain to stakeholders', 'clarity');
      expect(result.label).toBe('Communication');
      expect(result.starElements).toEqual(['Situation', 'Action']);
    });
  });

  describe('priority order — first match wins', () => {
    it('returns "Team Experience" over "Problem Solving" when both match', () => {
      // "team" triggers Team Experience (index 1), "problem" triggers Problem Solving (index 6)
      const result = classifyStarCategory('team problem resolution', 'coordination');
      expect(result.label).toBe('Team Experience');
    });

    it('returns "Above & Beyond" over "Leadership" when both match', () => {
      // "beyond" triggers Above & Beyond (index 0), "lead" triggers Leadership (index 3)
      const result = classifyStarCategory('lead beyond expectations', 'drive');
      expect(result.label).toBe('Above & Beyond / Problem Solving');
    });

    it('returns "Initiative" over "Problem Solving" when both match', () => {
      // "ownership" triggers Initiative (index 2), "implement" triggers Problem Solving (index 6)
      const result = classifyStarCategory('ownership of implementation', 'delivery');
      expect(result.label).toBe('Initiative');
    });

    it('returns "Failure / Mistake" over "Communication" when both match', () => {
      // "mistake" triggers Failure (index 4), "explain" triggers Communication (index 7)
      const result = classifyStarCategory('explain a mistake', 'honesty');
      expect(result.label).toBe('Failure / Mistake');
    });
  });

  describe('default fallback for unmatched input', () => {
    it('returns default classification when no keywords match', () => {
      const result = classifyStarCategory('random topic', 'unrelated skill');
      expect(result).toEqual(DEFAULT_CLASSIFICATION);
    });

    it('default has label "General"', () => {
      const result = classifyStarCategory('xyz', 'abc');
      expect(result.label).toBe('General');
    });

    it('default has all four STAR elements', () => {
      const result = classifyStarCategory('nothing matches', 'here');
      expect(result.starElements).toEqual(['Situation', 'Task', 'Action', 'Result']);
    });

    it('default has English reasoning text', () => {
      const result = classifyStarCategory('no match', 'at all');
      expect(result.reasoning).toBe(
        'General behavioral question. Keep Situation and Task brief; focus on your Actions and Results.'
      );
    });
  });

  describe('case insensitivity', () => {
    it('matches uppercase keyword in topic', () => {
      const result = classifyStarCategory('TEAM project', 'skill');
      expect(result.label).toBe('Team Experience');
    });

    it('matches mixed-case keyword in targetSkill', () => {
      const result = classifyStarCategory('some topic', 'DeadLine management');
      expect(result.label).toBe('Pressure and Time Management');
    });

    it('matches keyword with random casing across both fields', () => {
      const result = classifyStarCategory('LeaDERship', 'SKILLS');
      expect(result.label).toBe('Leadership');
    });
  });

  describe('keyword in topic vs target_skill both work', () => {
    it('matches keyword present only in topic', () => {
      const result = classifyStarCategory('conflict resolution', 'interpersonal');
      expect(result.label).toBe('Team Experience');
    });

    it('matches keyword present only in targetSkill', () => {
      const result = classifyStarCategory('general experience', 'collaborate with others');
      expect(result.label).toBe('Team Experience');
    });

    it('matches partial keyword via includes (e.g., "collaborat" in "collaboration")', () => {
      const result = classifyStarCategory('cross-team collaboration', 'skill');
      expect(result.label).toBe('Team Experience');
    });
  });

  describe('empty strings return default', () => {
    it('returns default when both topic and targetSkill are empty', () => {
      const result = classifyStarCategory('', '');
      expect(result).toEqual(DEFAULT_CLASSIFICATION);
    });

    it('returns default when topic is empty and targetSkill has no keywords', () => {
      const result = classifyStarCategory('', 'nothing');
      expect(result).toEqual(DEFAULT_CLASSIFICATION);
    });

    it('returns default when targetSkill is empty and topic has no keywords', () => {
      const result = classifyStarCategory('unrelated', '');
      expect(result).toEqual(DEFAULT_CLASSIFICATION);
    });
  });

  describe('category table structure', () => {
    it('contains exactly 8 categories', () => {
      expect(STAR_CATEGORIES).toHaveLength(8);
    });

    it('each category has required fields with correct types', () => {
      for (const category of STAR_CATEGORIES) {
        expect(typeof category.label).toBe('string');
        expect(Array.isArray(category.triggerKeywords)).toBe(true);
        expect(category.triggerKeywords.length).toBeGreaterThan(0);
        expect(Array.isArray(category.starElements)).toBe(true);
        expect(category.starElements.length).toBeGreaterThan(0);
        expect(typeof category.reasoning).toBe('string');
      }
    });

    it('categories are in the expected priority order', () => {
      const expectedOrder = [
        'Above & Beyond / Problem Solving',
        'Team Experience',
        'Initiative',
        'Leadership',
        'Failure / Mistake',
        'Pressure and Time Management',
        'Problem Solving',
        'Communication',
      ];
      const actualOrder = STAR_CATEGORIES.map((c) => c.label);
      expect(actualOrder).toEqual(expectedOrder);
    });
  });
});

describe('deriveKeywordChips', () => {
  it('should always include target_skill as first element', () => {
    const item = { target_skill: 'React', topic: 'building a dashboard' };
    const chips = deriveKeywordChips(item);
    expect(chips[0]).toBe('React');
  });

  it('should return only target_skill when targetRole is undefined', () => {
    const item = { target_skill: 'Python', topic: 'data processing pipeline' };
    const chips = deriveKeywordChips(item);
    expect(chips).toEqual(['Python']);
  });

  it('should return only target_skill when targetRole has empty skill arrays', () => {
    const item = { target_skill: 'TypeScript', topic: 'api design' };
    const chips = deriveKeywordChips(item, { required_skills: [], preferred_skills: [] });
    expect(chips).toEqual(['TypeScript']);
  });

  it('should include matching required_skills (case-insensitive)', () => {
    const item = { target_skill: 'React', topic: 'building a frontend dashboard' };
    const targetRole = {
      required_skills: ['react', 'Node.js'],
      preferred_skills: [],
    };
    const chips = deriveKeywordChips(item, targetRole);
    // "react" matches in target_skill "React" (lowercased)
    expect(chips).toContain('react');
  });

  it('should include matching preferred_skills (case-insensitive)', () => {
    const item = { target_skill: 'API Design', topic: 'implementing REST endpoints' };
    const targetRole = {
      required_skills: [],
      preferred_skills: ['REST', 'GraphQL'],
    };
    const chips = deriveKeywordChips(item, targetRole);
    // "rest" matches in topic "implementing REST endpoints" (lowercased)
    expect(chips).toContain('REST');
  });

  it('should not produce duplicate chips', () => {
    // target_skill is "React" and required_skills has "React" — should not appear twice
    const item = { target_skill: 'React', topic: 'component architecture' };
    const targetRole = {
      required_skills: ['React'],
      preferred_skills: [],
    };
    const chips = deriveKeywordChips(item, targetRole);
    const reactOccurrences = chips.filter((c) => c === 'React');
    expect(reactOccurrences).toHaveLength(1);
  });

  it('should not include skills that do not match the combined string', () => {
    const item = { target_skill: 'Python', topic: 'data analysis' };
    const targetRole = {
      required_skills: ['Java', 'Kubernetes'],
      preferred_skills: ['Go'],
    };
    const chips = deriveKeywordChips(item, targetRole);
    expect(chips).toEqual(['Python']);
  });

  it('should match skills found in topic', () => {
    const item = { target_skill: 'Backend', topic: 'designing scalable microservices with Docker' };
    const targetRole = {
      required_skills: ['Docker'],
      preferred_skills: [],
    };
    const chips = deriveKeywordChips(item, targetRole);
    expect(chips).toContain('Docker');
  });

  it('should handle missing required_skills and preferred_skills in targetRole', () => {
    const item = { target_skill: 'AWS', topic: 'cloud deployment' };
    const chips = deriveKeywordChips(item, {});
    expect(chips).toEqual(['AWS']);
  });
});


describe('Property-based tests', () => {
  /**
   * Feature: guide-panel-ux-improvements, Property 3: Classification is independent of reasoning text
   *
   * Validates: Requirements 1.5
   *
   * For any random (topic, targetSkill) pair, classifyStarCategory returns a deterministic
   * StarClassification where label and starElements are determined solely by keyword matching
   * against STAR_CATEGORIES[].triggerKeywords — the content of reasoning fields does not
   * influence the returned label or starElements.
   *
   * Approach: Temporarily mutate all STAR_CATEGORIES reasoning fields with random strings,
   * call classifyStarCategory, restore original reasoning, then compare the result against
   * a baseline call. label and starElements must be identical.
   */
  it('Property 3: classification label and starElements are independent of reasoning text content', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 0, maxLength: 100 }),
        fc.string({ minLength: 0, maxLength: 100 }),
        fc.array(fc.string({ minLength: 1, maxLength: 50 }), { minLength: 9, maxLength: 9 }),
        (topic, targetSkill, randomReasonings) => {
          // Baseline: call with current reasoning values
          const baseline = classifyStarCategory(topic, targetSkill);

          // Save original reasoning strings
          const originalReasonings = STAR_CATEGORIES.map((c) => c.reasoning);
          const originalDefault = DEFAULT_CLASSIFICATION.reasoning;

          // Mutate all reasoning fields with random strings
          STAR_CATEGORIES.forEach((category, i) => {
            category.reasoning = randomReasonings[i];
          });
          (DEFAULT_CLASSIFICATION as { reasoning: string }).reasoning = randomReasonings[8];

          // Call with mutated reasoning
          const mutated = classifyStarCategory(topic, targetSkill);

          // Restore original reasoning
          STAR_CATEGORIES.forEach((category, i) => {
            category.reasoning = originalReasonings[i];
          });
          (DEFAULT_CLASSIFICATION as { reasoning: string }).reasoning = originalDefault;

          // label and starElements must be identical regardless of reasoning content
          expect(mutated.label).toBe(baseline.label);
          expect(mutated.starElements).toEqual(baseline.starElements);
        }
      ),
      { numRuns: 100 }
    );
  });
});
