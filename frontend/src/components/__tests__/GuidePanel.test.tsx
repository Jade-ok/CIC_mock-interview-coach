import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { GuidePanel } from '@/components/GuidePanel';

/** Regex matching Korean Unicode ranges */
const KOREAN_REGEX = /[\uAC00-\uD7AF\u1100-\u11FF\u3130-\u318F]/;

const mockAnalystOutput = {
  interview_plan: [
    { topic: 'team project', target_skill: 'collaboration', source_experience_id: 'exp-1', priority: 1, question_type: 'behavioral' },
    { topic: 'debugging skills', target_skill: 'problem-solving', source_experience_id: null, priority: 2, question_type: 'technical' },
    { topic: 'leadership experience', target_skill: 'leadership', source_experience_id: 'exp-2', priority: 3, question_type: 'behavioral' },
  ],
  target_role: {
    title: 'SDE Intern',
    required_skills: ['collaboration', 'problem-solving'],
    preferred_skills: ['leadership'],
    evaluation_priorities: ['teamwork and communication', 'technical problem-solving'],
  },
  selected_experiences: [
    { experience_id: 'exp-1', title: 'Hackathon Project', organization: 'University CS Club', relevance_score: 0.92 },
    { experience_id: 'exp-2', title: 'Club President', organization: 'Engineering Society', relevance_score: 0.78 },
    { experience_id: 'exp-3', title: 'Course Project', organization: 'CS Department', relevance_score: 0.85 },
    { experience_id: 'exp-4', title: 'Volunteer Work', organization: 'Community Center', relevance_score: 0.60 },
    { experience_id: 'exp-5', title: 'Research Assistant', organization: 'AI Lab', relevance_score: 0.55 },
  ],
  resume_job_alignment: {
    strong_matches: [
      { resume_evidence: 'Built REST API with Flask', job_requirement: 'Python and REST APIs', match_reason: 'Direct experience' },
    ],
    partial_matches: [
      { resume_evidence: 'Used asyncio for testing', job_requirement: 'Testing skills', match_reason: 'Limited scope' },
    ],
    areas_to_explore: [
      { topic: 'Docker experience', reason: 'No container evidence on resume' },
    ],
  },
};

describe('GuidePanel', () => {
  describe('no Korean text', () => {
    it('contains zero Korean characters when analystOutput is null', () => {
      const { container } = render(<GuidePanel analystOutput={null} />);
      expect(container.textContent).not.toMatch(KOREAN_REGEX);
    });

    it('contains zero Korean characters when analystOutput is provided', () => {
      const { container } = render(<GuidePanel analystOutput={mockAnalystOutput} />);
      expect(container.textContent).not.toMatch(KOREAN_REGEX);
    });
  });

  describe('no panel title', () => {
    it('does NOT render "Interview Guide" title text', () => {
      render(<GuidePanel analystOutput={mockAnalystOutput} />);
      expect(screen.queryByText('Interview Guide')).not.toBeInTheDocument();
    });
  });

  describe('no alignment sections', () => {
    it('does NOT render "Strong Matches" text', () => {
      render(<GuidePanel analystOutput={mockAnalystOutput} />);
      expect(screen.queryByText('Strong Matches')).not.toBeInTheDocument();
    });

    it('does NOT render "Areas to Grow" text', () => {
      render(<GuidePanel analystOutput={mockAnalystOutput} />);
      expect(screen.queryByText('Areas to Grow')).not.toBeInTheDocument();
    });

    it('does NOT render alignment-summary section', () => {
      render(<GuidePanel analystOutput={mockAnalystOutput} />);
      expect(screen.queryByTestId('alignment-summary')).not.toBeInTheDocument();
    });

    it('does NOT render any alignment evidence text', () => {
      render(<GuidePanel analystOutput={mockAnalystOutput} />);
      expect(screen.queryByText('Built REST API with Flask')).not.toBeInTheDocument();
      expect(screen.queryByText('Used asyncio for testing')).not.toBeInTheDocument();
    });
  });

  describe('no organization in experience cards', () => {
    it('does NOT contain · separator in card titles', () => {
      render(<GuidePanel analystOutput={mockAnalystOutput} />);
      const topics = document.querySelectorAll('.star-card__topic');
      topics.forEach(topic => {
        expect(topic.textContent).not.toContain('·');
      });
    });

    it('does NOT render organization names', () => {
      render(<GuidePanel analystOutput={mockAnalystOutput} />);
      expect(screen.queryByText(/University CS Club/)).not.toBeInTheDocument();
      expect(screen.queryByText(/CS Department/)).not.toBeInTheDocument();
      expect(screen.queryByText(/Engineering Society/)).not.toBeInTheDocument();
    });

    it('renders only the project title in each card', () => {
      render(<GuidePanel analystOutput={mockAnalystOutput} />);
      expect(screen.getByText('Hackathon Project')).toBeInTheDocument();
      expect(screen.getByText('Course Project')).toBeInTheDocument();
      expect(screen.getByText('Club President')).toBeInTheDocument();
    });
  });

  describe('empty state', () => {
    it('renders guide-panel container when analystOutput is null', () => {
      render(<GuidePanel analystOutput={null} />);
      expect(screen.getByTestId('guide-panel')).toBeInTheDocument();
    });

    it('does NOT render content when analystOutput is null', () => {
      render(<GuidePanel analystOutput={null} />);
      expect(screen.queryByTestId('guide-panel-layer2')).not.toBeInTheDocument();
    });
  });

  describe('role skills hint — exactly 3 chips with accent color', () => {
    it('renders role-skills-hint section', () => {
      render(<GuidePanel analystOutput={mockAnalystOutput} />);
      expect(screen.getByTestId('role-skills-hint')).toBeInTheDocument();
    });

    it('displays exactly 3 skill chips', () => {
      render(<GuidePanel analystOutput={mockAnalystOutput} />);
      const chipContainer = screen.getByTestId('role-skill-chips');
      const chips = chipContainer.querySelectorAll('.role-skills-hint__chip');
      expect(chips).toHaveLength(3);
    });

    it('uses accent color class on skill chips', () => {
      render(<GuidePanel analystOutput={mockAnalystOutput} />);
      const chipContainer = screen.getByTestId('role-skill-chips');
      const accentChips = chipContainer.querySelectorAll('.role-skills-hint__chip');
      expect(accentChips.length).toBeGreaterThan(0);
      const genericChips = chipContainer.querySelectorAll('.star-card__chip');
      expect(genericChips).toHaveLength(0);
    });

    it('displays first 3 unique skills from target_skill + evaluation_priorities', () => {
      render(<GuidePanel analystOutput={mockAnalystOutput} />);
      const chipContainer = screen.getByTestId('role-skill-chips');
      const chipTexts = Array.from(chipContainer.querySelectorAll('.role-skills-hint__chip'))
        .map(c => c.textContent);
      expect(chipTexts).toEqual(['collaboration', 'problem-solving', 'leadership']);
    });
  });

  describe('experience cards — exactly 3 cards', () => {
    it('renders exactly 3 experience cards even when 5 experiences exist', () => {
      render(<GuidePanel analystOutput={mockAnalystOutput} />);
      const cards = screen.getAllByTestId('experience-card');
      expect(cards).toHaveLength(3);
    });

    it('selects the top 3 by relevance_score descending', () => {
      render(<GuidePanel analystOutput={mockAnalystOutput} />);
      const cards = screen.getAllByTestId('experience-card');
      expect(cards[0]).toHaveTextContent('Hackathon Project');
      expect(cards[1]).toHaveTextContent('Course Project');
      expect(cards[2]).toHaveTextContent('Club President');
    });

    it('uses "Experience N" label', () => {
      render(<GuidePanel analystOutput={mockAnalystOutput} />);
      expect(screen.getByText('Experience 1')).toBeInTheDocument();
      expect(screen.getByText('Experience 2')).toBeInTheDocument();
      expect(screen.getByText('Experience 3')).toBeInTheDocument();
    });

    it('renders English section labels in cards', () => {
      render(<GuidePanel analystOutput={mockAnalystOutput} />);
      expect(screen.getAllByText('Skills to highlight:').length).toBeGreaterThan(0);
      expect(screen.getAllByText('Angle to prepare:').length).toBeGreaterThan(0);
      expect(screen.getAllByText('Emphasize:').length).toBeGreaterThan(0);
    });
  });

  describe('final structure — only two sections', () => {
    it('renders Key Competencies section', () => {
      render(<GuidePanel analystOutput={mockAnalystOutput} />);
      expect(screen.getByText('Key Competencies')).toBeInTheDocument();
    });

    it('renders Experiences to Prepare section', () => {
      render(<GuidePanel analystOutput={mockAnalystOutput} />);
      expect(screen.getByText('Experiences to Prepare')).toBeInTheDocument();
    });

    it('renders only these two section titles (no others)', () => {
      render(<GuidePanel analystOutput={mockAnalystOutput} />);
      const sectionTitles = document.querySelectorAll('.guide-panel__section-title');
      const titleTexts = Array.from(sectionTitles).map(t => t.textContent);
      expect(titleTexts).toEqual(['Key Competencies', 'Experiences to Prepare']);
    });
  });

  describe('theme compliance', () => {
    it('style block contains no #4A9EFF color reference', () => {
      const { container } = render(<GuidePanel analystOutput={mockAnalystOutput} />);
      const styleTag = container.querySelector('style');
      expect(styleTag).not.toBeNull();
      expect(styleTag!.textContent).not.toContain('#4A9EFF');
    });

    it('style block uses accent color for role-skills-hint chips', () => {
      const { container } = render(<GuidePanel analystOutput={mockAnalystOutput} />);
      const styleTag = container.querySelector('style');
      expect(styleTag).not.toBeNull();
      expect(styleTag!.textContent).toContain('.role-skills-hint__chip');
      expect(styleTag!.textContent).toContain('--color-accent');
    });
  });
});
