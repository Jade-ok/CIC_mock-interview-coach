import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { GuidePanel } from '@/components/GuidePanel';

const mockAnalystOutput = {
  interview_plan: [
    { topic: 'Tell me about a team conflict you resolved', target_skill: 'Collaboration', source_experience_id: 'exp1', priority: 1, question_type: 'behavioral' },
    { topic: 'Describe a technical problem you solved', target_skill: 'Problem Solving', source_experience_id: 'exp2', priority: 2, question_type: 'behavioral' },
    { topic: 'How do you handle tight deadlines', target_skill: 'Time Management', source_experience_id: null, priority: 3, question_type: 'behavioral' },
    { topic: 'Tell me about a leadership experience', target_skill: 'Leadership', source_experience_id: 'exp3', priority: 4, question_type: 'behavioral' },
    { topic: 'Describe a failure you learned from', target_skill: 'Resilience', source_experience_id: 'exp4', priority: 5, question_type: 'behavioral' },
  ],
  target_role: {
    title: 'Software Engineer Intern',
    required_skills: ['Collaboration', 'Problem Solving'],
    preferred_skills: ['Time Management', 'Leadership'],
  },
  selected_experiences: [
    { experience_id: 'exp1', title: 'Hackathon Team Lead', organization: 'University CS Club' },
    { experience_id: 'exp2', title: 'Bug Fix Sprint', organization: 'Startup Inc' },
    { experience_id: 'exp3', title: 'Open Source Contributor', organization: 'Apache Foundation' },
    { experience_id: 'exp4', title: 'Database Migration', organization: 'Company X' },
  ],
};

describe('GuidePanel', () => {
  describe('card count', () => {
    it('renders exactly 3 cards from valid analyst output with 5 plan items', () => {
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

  describe('card labels', () => {
    it('shows "예상 질문 1", "예상 질문 2", "예상 질문 3"', () => {
      render(<GuidePanel analystOutput={mockAnalystOutput} />);

      expect(screen.getByText('예상 질문 1')).toBeInTheDocument();
      expect(screen.getByText('예상 질문 2')).toBeInTheDocument();
      expect(screen.getByText('예상 질문 3')).toBeInTheDocument();
    });
  });

  describe('topic text', () => {
    it('displays each card topic', () => {
      render(<GuidePanel analystOutput={mockAnalystOutput} />);

      expect(screen.getByText('Tell me about a team conflict you resolved')).toBeInTheDocument();
      expect(screen.getByText('Describe a technical problem you solved')).toBeInTheDocument();
      expect(screen.getByText('How do you handle tight deadlines')).toBeInTheDocument();
    });
  });

  describe('keyword chips', () => {
    it('renders target_skill as a chip for each card', () => {
      render(<GuidePanel analystOutput={mockAnalystOutput} />);

      const chips = document.querySelectorAll('.star-card__chip');
      const chipTexts = Array.from(chips).map(c => c.textContent);

      // First card: target_skill is "Collaboration"
      expect(chipTexts).toContain('Collaboration');
      // Second card: target_skill is "Problem Solving"
      expect(chipTexts).toContain('Problem Solving');
      // Third card: target_skill is "Time Management"
      expect(chipTexts).toContain('Time Management');
    });
  });

  describe('STAR section', () => {
    it('renders category label for each card', () => {
      render(<GuidePanel analystOutput={mockAnalystOutput} />);

      // First card: "team conflict" matches "Team Experience" (keyword: "conflict")
      expect(screen.getByText('Team Experience')).toBeInTheDocument();
      // Second card: "technical problem" matches "Problem Solving" (keyword: "problem")
      expect(screen.getByText('Problem Solving', { selector: '.star-card__category-label' })).toBeInTheDocument();
    });

    it('renders STAR element badges', () => {
      render(<GuidePanel analystOutput={mockAnalystOutput} />);

      // "Team Experience" has elements: ['Action', 'Result']
      const badges = document.querySelectorAll('.star-card__element-badge');
      expect(badges.length).toBeGreaterThan(0);

      // Check that Action badge exists (used by multiple categories)
      const badgeTexts = Array.from(badges).map(b => b.textContent);
      expect(badgeTexts).toContain('Action');
      expect(badgeTexts).toContain('Result');
    });

    it('renders reasoning text', () => {
      render(<GuidePanel analystOutput={mockAnalystOutput} />);

      // "Team Experience" reasoning
      expect(screen.getByText('팀 내에서 실제로 어떻게 행동했는지, 그 결과 관계/성과가 어떻게 됐는지')).toBeInTheDocument();
      // "Problem Solving" reasoning
      expect(screen.getByText('접근 방식, 시도와 조정 과정이 핵심')).toBeInTheDocument();
    });
  });

  describe('related experience', () => {
    it('shows experience when source_experience_id matches', () => {
      render(<GuidePanel analystOutput={mockAnalystOutput} />);

      // Card 1: source_experience_id='exp1' → 'Hackathon Team Lead' at 'University CS Club'
      expect(screen.getByText('Hackathon Team Lead')).toBeInTheDocument();
      expect(screen.getByText('University CS Club')).toBeInTheDocument();

      // Card 2: source_experience_id='exp2' → 'Bug Fix Sprint' at 'Startup Inc'
      expect(screen.getByText('Bug Fix Sprint')).toBeInTheDocument();
      expect(screen.getByText('Startup Inc')).toBeInTheDocument();
    });

    it('hides experience when source_experience_id is null', () => {
      render(<GuidePanel analystOutput={mockAnalystOutput} />);

      // Card 3 has source_experience_id: null, so only 2 experience sections should appear
      const experienceSections = screen.getAllByTestId('star-card-experience');
      expect(experienceSections).toHaveLength(2);
    });
  });
});
