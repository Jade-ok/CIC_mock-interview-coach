import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { DimensionCard } from '../DimensionCard';
import { DimensionScoresGrid } from '../DimensionScoresGrid';
import { FeedbackColumns } from '../FeedbackColumns';
import { ContextualAdvice } from '../ContextualAdvice';
import { QuestionCard } from '../QuestionCard';
import { QuestionBreakdown } from '../QuestionBreakdown';
import { FooterCTA } from '../FooterCTA';

describe('DimensionCard', () => {
  it('displays label, description, and score', () => {
    render(<DimensionCard label="Concrete example" description="Did you point to a real project?" score={3.5} />);
    expect(screen.getByText('Concrete example')).toBeTruthy();
    expect(screen.getByText('Did you point to a real project?')).toBeTruthy();
    expect(screen.getByText('3.5')).toBeTruthy();
  });
});

describe('DimensionScoresGrid', () => {
  it('renders all 4 dimension cards', () => {
    const dimensions = { concrete_example: 4.0, star_structure: 3.0, link_to_job: 3.5, quantifiable_outcome: 2.0 };
    render(<DimensionScoresGrid dimensions={dimensions} />);
    expect(screen.getByText('Concrete example')).toBeTruthy();
    expect(screen.getByText(/Situation/)).toBeTruthy();
    expect(screen.getByText('Link to the job')).toBeTruthy();
    expect(screen.getByText('Quantifiable outcome')).toBeTruthy();
  });

  it('displays section title', () => {
    const dimensions = { concrete_example: 3.0, star_structure: 3.0, link_to_job: 3.0, quantifiable_outcome: 3.0 };
    render(<DimensionScoresGrid dimensions={dimensions} />);
    expect(screen.getByText('How your answers scored')).toBeTruthy();
  });
});

describe('FeedbackColumns', () => {
  it('renders strengths and improvements', () => {
    render(
      <FeedbackColumns
        strengths={['Great specific example.', 'Clear SAR structure.']}
        improvements={['Add numbers.', 'Connect to role.']}
      />
    );
    expect(screen.getByText('What you did well')).toBeTruthy();
    expect(screen.getByText('What to work on next')).toBeTruthy();
    expect(screen.getByText('Great specific example.')).toBeTruthy();
    expect(screen.getByText('Add numbers.')).toBeTruthy();
  });
});

describe('ContextualAdvice', () => {
  it('renders numbered advice items', () => {
    render(<ContextualAdvice advice={['Use hackathon experience.', 'Prepare AWS story.']} />);
    expect(screen.getByText('For your next interview')).toBeTruthy();
    expect(screen.getByText(/resume and the job/)).toBeTruthy();
    expect(screen.getByText('Use hackathon experience.')).toBeTruthy();
    expect(screen.getByText('Prepare AWS story.')).toBeTruthy();
  });
});

describe('QuestionCard', () => {
  it('displays question and feedback', () => {
    const scores = { concrete_example: 4, star_structure: 3, link_to_job: 4, quantifiable_outcome: 2 };
    const feedback = { strength: 'Great specific example.', improvement: 'Add a measurable outcome.' };
    render(
      <QuestionCard index={1} questionText="Tell me about a project." feedback={feedback} scores={scores} />
    );
    expect(screen.getByText('Q1')).toBeTruthy();
    expect(screen.getByText('Tell me about a project.')).toBeTruthy();
    expect(screen.getByText('Great specific example.')).toBeTruthy();
    expect(screen.getByText('Add a measurable outcome.')).toBeTruthy();
  });

  it('shows weakest dimension chip', () => {
    const scores = { concrete_example: 3, star_structure: 3, link_to_job: 3, quantifiable_outcome: 2 };
    const feedback = { strength: 'Good.', improvement: 'More detail.' };
    render(
      <QuestionCard index={2} questionText="What was hard?" feedback={feedback} scores={scores} />
    );
    expect(screen.getByText(/Quantifiable outcome 2\/5/)).toBeTruthy();
  });
});

describe('QuestionBreakdown', () => {
  it('renders intro line with question count', () => {
    const questions = [{ question_text: 'Q1?', feedback: { strength: 'Good.', improvement: 'More detail.' }, scores: { concrete_example: 3, star_structure: 3, link_to_job: 3, quantifiable_outcome: 3 } }];
    render(<QuestionBreakdown questions={questions} questionCount={1} />);
    expect(screen.getByText(/1 question/)).toBeTruthy();
  });

  it('renders correct number of question cards', () => {
    const questions = Array.from({ length: 4 }, (_, i) => ({
      question_text: `Question ${i + 1}?`,
      feedback: { strength: `Good ${i + 1}.`, improvement: `Improve ${i + 1}.` },
      scores: { concrete_example: 3, star_structure: 3, link_to_job: 3, quantifiable_outcome: 3 },
    }));
    render(<QuestionBreakdown questions={questions} questionCount={4} />);
    expect(screen.getByText('Question 1?')).toBeTruthy();
    expect(screen.getByText('Question 4?')).toBeTruthy();
  });
});

describe('FooterCTA', () => {
  it('displays motivational message', () => {
    render(<FooterCTA onPracticeAgain={() => {}} onNewSession={() => {}} onViewTranscript={() => {}} />);
    expect(screen.getByText(/Every practice round/)).toBeTruthy();
  });


  it('triggers onViewTranscript callback', () => {
    const onViewTranscript = vi.fn();
    render(<FooterCTA onPracticeAgain={() => {}} onNewSession={() => {}} onViewTranscript={onViewTranscript} />);
    fireEvent.click(screen.getByText('View full transcript'));
    expect(onViewTranscript).toHaveBeenCalledOnce();
  });
});
