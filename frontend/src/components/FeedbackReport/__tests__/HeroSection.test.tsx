import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { HeroSection } from '../HeroSection';

describe('HeroSection', () => {
  const defaultProps = {
    readinessLabel: 'Developing well',
    totalScore: 3.0,
    questionCount: 4,
    targetRole: 'Software Engineering Intern',
  };

  it('displays neutral "Your Interview Report" heading', () => {
    render(<HeroSection {...defaultProps} />);
    expect(screen.getByRole('heading', { name: 'Your Interview Report' })).toBeTruthy();
  });

  it('displays the supportive subheading', () => {
    render(<HeroSection {...defaultProps} />);
    expect(screen.getByText(/building real interview skills/)).toBeTruthy();
  });

  it('displays the target role context', () => {
    render(<HeroSection {...defaultProps} />);
    expect(screen.getByText(/SOFTWARE ENGINEERING INTERN/)).toBeTruthy();
  });

  it('displays the total score in the ring gauge', () => {
    render(<HeroSection {...defaultProps} />);
    expect(screen.getByText('3.0')).toBeTruthy();
  });

  it('displays question count', () => {
    render(<HeroSection {...defaultProps} />);
    expect(screen.getByText(/4 questions answered/)).toBeTruthy();
  });

  it('displays focus area tag', () => {
    render(<HeroSection {...defaultProps} />);
    expect(screen.getByText('Focus area: story structure')).toBeTruthy();
  });

  it('handles unknown readiness label gracefully', () => {
    render(<HeroSection {...defaultProps} readinessLabel="Unknown label" />);
    expect(screen.getByRole('heading', { name: 'Your Interview Report' })).toBeTruthy();
  });

  it('shows ring gauge with accessible label', () => {
    render(<HeroSection {...defaultProps} />);
    expect(screen.getByLabelText('Score: 3.0 out of 5')).toBeTruthy();
  });
});
