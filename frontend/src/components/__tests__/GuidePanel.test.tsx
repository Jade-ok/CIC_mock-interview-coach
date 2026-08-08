import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { GuidePanel } from '@/components/GuidePanel';

const mockAnalystOutput = {
  interview_plan: [
    { topic: 'team project', target_skill: 'collaboration', source_experience_id: 'exp-1', priority: 1, question_type: 'behavioral' },
    { topic: 'debugging skills', target_skill: 'problem-solving', source_experience_id: null, priority: 2, question_type: 'technical' },
    { topic: 'leadership experience', target_skill: 'leadership', source_experience_id: 'exp-2', priority: 3, question_type: 'behavioral' },
  ],
  target_role: { title: 'SDE Intern', required_skills: ['collaboration', 'problem-solving'], preferred_skills: ['leadership'] },
  selected_experiences: [
    { experience_id: 'exp-1', title: 'Hackathon Project', organization: 'University CS Club' },
    { experience_id: 'exp-2', title: 'Club President', organization: 'Engineering Society' },
  ],
};

describe('GuidePanel', () => {
  describe('card count', () => {
    it('renders exactly 3 cards from valid analyst output with 3 plan items', () => {
      render(<GuidePanel analystOutput={mockAnalystOutput} />);

      const cards = screen.getAllByTestId('star-card');
      expect(cards).toHaveLength(3);
    });

    it('renders fewer cards when plan has < 3 items', () => {
      const twoItemOutput = {
        ...mockAnalystOutput,
        interview_plan: mockAnalystOutput.interview_plan.slice(0, 2),
      };

      render(<GuidePanel analystOutput={twoItemOutput} />);

      const cards = screen.getAllByTestId('star-card');
      expect(cards).toHaveLength(2);
    });
  });

  describe('empty state', () => {
    it('renders no cards when analystOutput is null', () => {
      render(<GuidePanel analystOutput={null} />);

      expect(screen.queryAllByTestId('star-card')).toHaveLength(0);
      expect(screen.getByTestId('guide-panel')).toBeInTheDocument();
    });

    it('renders no cards when interview_plan is empty array', () => {
      render(<GuidePanel analystOutput={{ interview_plan: [] }} />);

      expect(screen.queryAllByTestId('star-card')).toHaveLength(0);
    });
  });

  describe('card labels — "Expected Question N"', () => {
    it('renders "Expected Question 1", "Expected Question 2", "Expected Question 3"', () => {
      render(<GuidePanel analystOutput={mockAnalystOutput} />);

      expect(screen.getByText('Expected Question 1')).toBeInTheDocument();
      expect(screen.getByText('Expected Question 2')).toBeInTheDocument();
      expect(screen.getByText('Expected Question 3')).toBeInTheDocument();
    });
  });

  describe('section labels', () => {
    it('does NOT render "Question focus:" label (removed for compression)', () => {
      render(<GuidePanel analystOutput={mockAnalystOutput} />);

      expect(screen.queryByText('Question focus:')).not.toBeInTheDocument();
    });

    it('renders "Skills to highlight:" label in each card', () => {
      render(<GuidePanel analystOutput={mockAnalystOutput} />);

      const labels = screen.getAllByText('Skills to highlight:');
      expect(labels).toHaveLength(3);
    });

    it('renders "Question type:" label in each card', () => {
      render(<GuidePanel analystOutput={mockAnalystOutput} />);

      const labels = screen.getAllByText('Question type:');
      expect(labels).toHaveLength(3);
    });

    it('renders "Emphasize in your answer:" label in each card', () => {
      render(<GuidePanel analystOutput={mockAnalystOutput} />);

      const labels = screen.getAllByText('Emphasize in your answer:');
      expect(labels).toHaveLength(3);
    });

    it('renders "Relevant experience:" label only for cards with experience', () => {
      render(<GuidePanel analystOutput={mockAnalystOutput} />);

      // Cards 1 and 3 have experiences, card 2 has source_experience_id: null
      const labels = screen.getAllByText(/Relevant experience:/);
      expect(labels).toHaveLength(2);
    });

    it('does NOT render "Relevant experience:" label when experience is null', () => {
      // Use only the card with null source_experience_id
      const singleNullExpOutput = {
        ...mockAnalystOutput,
        interview_plan: [mockAnalystOutput.interview_plan[1]], // debugging skills, source_experience_id: null
      };

      render(<GuidePanel analystOutput={singleNullExpOutput} />);

      expect(screen.queryByText(/Relevant experience:/)).not.toBeInTheDocument();
    });
  });

  describe('inline layout — label and value on same row', () => {
    it('"Question type:" and category label share the same parent element', () => {
      render(<GuidePanel analystOutput={mockAnalystOutput} />);

      const row = screen.getAllByTestId('question-type-row')[0];
      expect(row).toBeInTheDocument();
      // Both the label and the value are direct children of the same row
      expect(row.querySelector('.star-card__section-label')).not.toBeNull();
      expect(row.querySelector('.star-card__category-label')).not.toBeNull();
    });

    it('"Emphasize in your answer:" and element badges share the same parent element', () => {
      render(<GuidePanel analystOutput={mockAnalystOutput} />);

      const row = screen.getAllByTestId('emphasize-row')[0];
      expect(row).toBeInTheDocument();
      expect(row.querySelector('.star-card__section-label')).not.toBeNull();
      expect(row.querySelector('.star-card__element-badge')).not.toBeNull();
    });
  });

  describe('green accent color — no blue references', () => {
    it('style block contains no #4A9EFF color reference', () => {
      const { container } = render(<GuidePanel analystOutput={mockAnalystOutput} />);

      const styleTag = container.querySelector('style');
      expect(styleTag).not.toBeNull();
      expect(styleTag!.textContent).not.toContain('#4A9EFF');
    });

    it('style block contains no --color-guide-highlight reference', () => {
      const { container } = render(<GuidePanel analystOutput={mockAnalystOutput} />);

      const styleTag = container.querySelector('style');
      expect(styleTag).not.toBeNull();
      expect(styleTag!.textContent).not.toContain('--color-guide-highlight');
    });
  });

  describe('topic text', () => {
    it('displays each card topic', () => {
      render(<GuidePanel analystOutput={mockAnalystOutput} />);

      expect(screen.getByText('team project')).toBeInTheDocument();
      expect(screen.getByText('debugging skills')).toBeInTheDocument();
      expect(screen.getByText('leadership experience')).toBeInTheDocument();
    });
  });

  describe('keyword chips', () => {
    it('renders target_skill as a chip for each card', () => {
      render(<GuidePanel analystOutput={mockAnalystOutput} />);

      const chips = document.querySelectorAll('.star-card__chip');
      const chipTexts = Array.from(chips).map(c => c.textContent);

      expect(chipTexts).toContain('collaboration');
      expect(chipTexts).toContain('problem-solving');
      expect(chipTexts).toContain('leadership');
    });
  });

  describe('STAR section', () => {
    it('renders category label for each card', () => {
      render(<GuidePanel analystOutput={mockAnalystOutput} />);

      // "team project" matches "Team Experience" (keyword: "team")
      expect(screen.getByText('Team Experience')).toBeInTheDocument();
      // "debugging skills" matches "Problem Solving" (keyword: "debug")
      expect(screen.getByText('Problem Solving', { selector: '.star-card__category-label' })).toBeInTheDocument();
    });

    it('renders STAR element badges', () => {
      render(<GuidePanel analystOutput={mockAnalystOutput} />);

      const badges = document.querySelectorAll('.star-card__element-badge');
      expect(badges.length).toBeGreaterThan(0);

      const badgeTexts = Array.from(badges).map(b => b.textContent);
      expect(badgeTexts).toContain('Action');
      expect(badgeTexts).toContain('Result');
    });

    it('renders English reasoning text', () => {
      render(<GuidePanel analystOutput={mockAnalystOutput} />);

      // "Team Experience" reasoning (English)
      expect(screen.getByText('What you actually did within the team and how it affected outcomes')).toBeInTheDocument();
      // "Problem Solving" reasoning (English)
      expect(screen.getByText('Your approach, iterations, and adjustments')).toBeInTheDocument();
    });
  });

  describe('related experience', () => {
    it('shows experience when source_experience_id matches', () => {
      render(<GuidePanel analystOutput={mockAnalystOutput} />);

      // Card 1: source_experience_id='exp-1' → 'Hackathon Project' at 'University CS Club'
      expect(screen.getByText('Hackathon Project')).toBeInTheDocument();
      expect(screen.getByText('University CS Club')).toBeInTheDocument();

      // Card 3: source_experience_id='exp-2' → 'Club President' at 'Engineering Society'
      expect(screen.getByText('Club President')).toBeInTheDocument();
      expect(screen.getByText('Engineering Society')).toBeInTheDocument();
    });

    it('hides experience section when source_experience_id is null', () => {
      render(<GuidePanel analystOutput={mockAnalystOutput} />);

      // Card 2 has source_experience_id: null, so only 2 experience sections should appear
      const experienceSections = screen.getAllByTestId('star-card-experience');
      expect(experienceSections).toHaveLength(2);
    });
  });
});
