import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { HeroSection } from '../HeroSection';

describe('HeroSection', () => {
  const defaultProps = {
    readinessLabel: 'Developing well',
    totalScore: 3.0,
    questionCount: 4,
    targetRole: 'Software Engineering Intern',
    dimensions: {
      concrete_example: 3.5,
      star_structure: 2.5,
      link_to_job: 3.0,
      quantifiable_outcome: 3.0,
    },
  };

  it('displays neutral "Your Interview Report" heading', () => {
    render(<HeroSection {...defaultProps} />);
    expect(screen.getByRole('heading', { name: 'Your Interview Report' })).toBeTruthy();
  });

  it('displays the target role context', () => {
    render(<HeroSection {...defaultProps} />);
    expect(screen.getByText(/SOFTWARE ENGINEERING INTERN/)).toBeTruthy();
  });

  it('displays the total score in the ring gauge', () => {
    render(<HeroSection {...defaultProps} />);
    expect(screen.getByText('3.0')).toBeTruthy();
  });

  it('displays YOUR ONE THING TO FIX label', () => {
    render(<HeroSection {...defaultProps} />);
    expect(screen.getByText('YOUR ONE THING TO FIX')).toBeTruthy();
  });

  it('shows the action for the weakest dimension', () => {
    render(<HeroSection {...defaultProps} />);
    // star_structure at 2.5 is weakest — callout shows STAR action text
    expect(screen.getByText(/STAR/)).toBeTruthy();
  });

  it('shows ring gauge with accessible label', () => {
    render(<HeroSection {...defaultProps} />);
    expect(screen.getByLabelText('Score: 3.0 out of 5')).toBeTruthy();
  });
});
