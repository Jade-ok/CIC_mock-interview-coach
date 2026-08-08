import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import fc from 'fast-check';
import { GuidePanel } from '@/components/GuidePanel';

/**
 * Guide Panel — Property-Based Tests
 *
 * Property 1: Renders without crashing for any valid analystOutput shape.
 * Property 2: No Korean text appears for any valid analystOutput.
 * Property 3: No "Expected Question" predictive text ever appears.
 * Property 4: Experience cards never exceed 3.
 * Property 5: Role skill chips never exceed 3.
 * Property 6: No alignment-related text (Strong Matches, Areas to Grow) ever appears.
 * Property 7: No · separator appears in card topics.
 * Property 8: No "Interview Guide" panel title appears.
 */

const KOREAN_REGEX = /[\uAC00-\uD7AF\u1100-\u11FF\u3130-\u318F]/;

const interviewPlanItemArb = fc.record({
  topic: fc.string({ minLength: 0, maxLength: 100 }),
  target_skill: fc.string({ minLength: 0, maxLength: 50 }),
  source_experience_id: fc.option(fc.string({ minLength: 1, maxLength: 20 }), { nil: null }),
  priority: fc.nat({ max: 10 }),
  question_type: fc.string({ minLength: 1, maxLength: 30 }),
});

const targetRoleArb = fc.record({
  title: fc.string({ minLength: 1, maxLength: 50 }),
  required_skills: fc.array(fc.string({ minLength: 1, maxLength: 30 }), { minLength: 0, maxLength: 5 }),
  preferred_skills: fc.array(fc.string({ minLength: 1, maxLength: 30 }), { minLength: 0, maxLength: 5 }),
  evaluation_priorities: fc.array(fc.string({ minLength: 1, maxLength: 30 }), { minLength: 0, maxLength: 5 }),
});

const selectedExperienceArb = fc.record({
  experience_id: fc.string({ minLength: 1, maxLength: 20 }),
  title: fc.string({ minLength: 1, maxLength: 50 }),
  organization: fc.string({ minLength: 1, maxLength: 50 }),
  relevance_score: fc.double({ min: 0, max: 1, noNaN: true }),
});

const analystOutputArb = fc.record({
  interview_plan: fc.array(interviewPlanItemArb, { minLength: 0, maxLength: 5 }),
  target_role: fc.option(targetRoleArb, { nil: undefined }),
  selected_experiences: fc.option(
    fc.array(selectedExperienceArb, { minLength: 0, maxLength: 5 }),
    { nil: undefined }
  ),
});

function buildAnalystOutput(output: {
  interview_plan: unknown[];
  target_role?: unknown;
  selected_experiences?: unknown[];
}): Record<string, unknown> {
  const ao: Record<string, unknown> = { interview_plan: output.interview_plan };
  if (output.target_role !== undefined) ao.target_role = output.target_role;
  if (output.selected_experiences !== undefined) ao.selected_experiences = output.selected_experiences;
  return ao;
}

describe('GuidePanel — Property-Based Tests', () => {
  it('Property 1: renders without crashing for any valid analystOutput', () => {
    fc.assert(
      fc.property(analystOutputArb, (output) => {
        const { container, unmount } = render(<GuidePanel analystOutput={buildAnalystOutput(output)} />);
        expect(container.querySelector('[data-testid="guide-panel"]')).not.toBeNull();
        unmount();
      }),
      { numRuns: 100 }
    );
  });

  it('Property 2: no Korean text for any valid analystOutput', () => {
    fc.assert(
      fc.property(analystOutputArb, (output) => {
        const { container, unmount } = render(<GuidePanel analystOutput={buildAnalystOutput(output)} />);
        expect(container.textContent).not.toMatch(KOREAN_REGEX);
        unmount();
      }),
      { numRuns: 100 }
    );
  });

  it('Property 3: no "Expected Question" text ever appears', () => {
    fc.assert(
      fc.property(analystOutputArb, (output) => {
        const { container, unmount } = render(<GuidePanel analystOutput={buildAnalystOutput(output)} />);
        expect(container.textContent).not.toContain('Expected Question');
        unmount();
      }),
      { numRuns: 100 }
    );
  });

  it('Property 4: experience cards never exceed 3', () => {
    fc.assert(
      fc.property(analystOutputArb, (output) => {
        const { container, unmount } = render(<GuidePanel analystOutput={buildAnalystOutput(output)} />);
        const cards = container.querySelectorAll('[data-testid="experience-card"]');
        expect(cards.length).toBeLessThanOrEqual(3);
        unmount();
      }),
      { numRuns: 100 }
    );
  });

  it('Property 5: role skill chips never exceed 3', () => {
    fc.assert(
      fc.property(analystOutputArb, (output) => {
        const { container, unmount } = render(<GuidePanel analystOutput={buildAnalystOutput(output)} />);
        const chips = container.querySelectorAll('.role-skills-hint__chip');
        expect(chips.length).toBeLessThanOrEqual(3);
        unmount();
      }),
      { numRuns: 100 }
    );
  });

  it('Property 6: no alignment text (Strong Matches, Areas to Grow) ever appears', () => {
    fc.assert(
      fc.property(analystOutputArb, (output) => {
        const { container, unmount } = render(<GuidePanel analystOutput={buildAnalystOutput(output)} />);
        const text = container.textContent ?? '';
        expect(text).not.toContain('Strong Matches');
        expect(text).not.toContain('Areas to Grow');
        unmount();
      }),
      { numRuns: 100 }
    );
  });

  it('Property 7: no · separator in card topics', () => {
    fc.assert(
      fc.property(analystOutputArb, (output) => {
        const { container, unmount } = render(<GuidePanel analystOutput={buildAnalystOutput(output)} />);
        const topics = container.querySelectorAll('.star-card__topic');
        topics.forEach(topic => {
          expect(topic.textContent).not.toContain('·');
        });
        unmount();
      }),
      { numRuns: 100 }
    );
  });

  it('Property 8: no "Interview Guide" panel title appears', () => {
    fc.assert(
      fc.property(analystOutputArb, (output) => {
        const { container, unmount } = render(<GuidePanel analystOutput={buildAnalystOutput(output)} />);
        expect(container.textContent).not.toContain('Interview Guide');
        unmount();
      }),
      { numRuns: 100 }
    );
  });
});
