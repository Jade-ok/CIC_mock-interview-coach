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

  it('displays the readiness label as heading', () => {
    render(<HeroSection {...defaultProps} />);
    expect(screen.getByRole('heading', { name: 'Developing well' })).toBeTruthy();
  });

  it('displays the supportive subheading', () => {
    render(<HeroSection {...defaultProps} />);
    expect(screen.getByText(/building real interview skills/)).toBeTruthy();
  });

  it('displays the context line with target role', () => {
    render(<HeroSection {...defaultProps} />);
    expect(screen.getByText(/INTERVIEW FEEDBACK · SOFTWARE ENGINEERING INTERN/)).toBeTruthy();
  });

  it('displays the total score formatted to 1 decimal', () => {
    render(<HeroSection {...defaultProps} />);
    expect(screen.getByText('3.0')).toBeTruthy();
  });

  it('displays question count', () => {
    render(<HeroSection {...defaultProps} />);
    expect(screen.getByText(/4 questions answered/)).toBeTruthy();
  });

  it('handles unknown readiness label gracefully', () => {
    render(<HeroSection {...defaultProps} readinessLabel="Unknown label" />);
    expect(screen.getByRole('heading', { name: 'Unknown label' })).toBeTruthy();
  });
});
