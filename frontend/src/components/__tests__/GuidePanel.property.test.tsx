import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import fc from 'fast-check';
import { GuidePanel } from '@/components/GuidePanel';

/**
 * Feature: guide-panel-ux-improvements, Property 2: Rendered Guide Panel contains no Korean text
 * Validates: Requirements 1.4
 *
 * For any valid analystOutput containing an interview_plan array of 1–3 items
 * with arbitrary topic and target_skill strings, rendering GuidePanel SHALL produce
 * text content containing zero Korean Unicode characters.
 */

/** Regex matching Korean Unicode ranges: Hangul Syllables, Jamo, Compatibility Jamo */
const KOREAN_REGEX = /[\uAC00-\uD7AF\u1100-\u11FF\u3130-\u318F]/;

/** Arbitrary for a single interview plan item */
const interviewPlanItemArb = fc.record({
  topic: fc.string({ minLength: 0, maxLength: 100 }),
  target_skill: fc.string({ minLength: 0, maxLength: 50 }),
  source_experience_id: fc.option(fc.string({ minLength: 1, maxLength: 20 }), { nil: null }),
  priority: fc.nat({ max: 10 }),
  question_type: fc.string({ minLength: 1, maxLength: 30 }),
});

/** Arbitrary for target_role */
const targetRoleArb = fc.record({
  title: fc.string({ minLength: 1, maxLength: 50 }),
  required_skills: fc.array(fc.string({ minLength: 1, maxLength: 30 }), { minLength: 0, maxLength: 5 }),
  preferred_skills: fc.array(fc.string({ minLength: 1, maxLength: 30 }), { minLength: 0, maxLength: 5 }),
});

/** Arbitrary for selected_experiences */
const selectedExperienceArb = fc.record({
  experience_id: fc.string({ minLength: 1, maxLength: 20 }),
  title: fc.string({ minLength: 1, maxLength: 50 }),
  organization: fc.string({ minLength: 1, maxLength: 50 }),
});

/** Arbitrary for a complete analystOutput object */
const analystOutputArb = fc.record({
  interview_plan: fc.array(interviewPlanItemArb, { minLength: 1, maxLength: 3 }),
  target_role: fc.option(targetRoleArb, { nil: undefined }),
  selected_experiences: fc.option(
    fc.array(selectedExperienceArb, { minLength: 0, maxLength: 5 }),
    { nil: undefined }
  ),
});

describe('GuidePanel — Property-Based Tests', () => {
  it('Property 2: rendered GuidePanel contains no Korean text for any valid analystOutput', () => {
    fc.assert(
      fc.property(analystOutputArb, (output) => {
        // Build the analystOutput record, filtering out undefined optional fields
        const analystOutput: Record<string, unknown> = {
          interview_plan: output.interview_plan,
        };
        if (output.target_role !== undefined) {
          analystOutput.target_role = output.target_role;
        }
        if (output.selected_experiences !== undefined) {
          analystOutput.selected_experiences = output.selected_experiences;
        }

        const { container, unmount } = render(<GuidePanel analystOutput={analystOutput} />);

        // Extract all visible text content from the rendered output
        const textContent = container.textContent ?? '';

        // Assert no Korean characters appear in the rendered text
        expect(textContent).not.toMatch(KOREAN_REGEX);

        unmount();
      }),
      { numRuns: 100 }
    );
  });
});
