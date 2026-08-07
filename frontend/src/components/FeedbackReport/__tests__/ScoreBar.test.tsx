import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { ScoreBar } from '../ScoreBar';

describe('ScoreBar', () => {
  it('renders 5 segments', () => {
    const { container } = render(<ScoreBar score={3} />);
    const segments = container.querySelectorAll('.score-bar__segment');
    expect(segments).toHaveLength(5);
  });

  it('fills correct number of segments for integer score 3', () => {
    const { container } = render(<ScoreBar score={3} />);
    const fills = container.querySelectorAll('.score-bar__fill');
    const fullFills = Array.from(fills).filter(
      (el) => (el as HTMLElement).style.width === '100%'
    );
    const emptyFills = Array.from(fills).filter(
      (el) => (el as HTMLElement).style.width === '0%'
    );
    expect(fullFills).toHaveLength(3);
    expect(emptyFills).toHaveLength(2);
  });

  it('fills all segments for score 5', () => {
    const { container } = render(<ScoreBar score={5} />);
    const fills = container.querySelectorAll('.score-bar__fill');
    const fullFills = Array.from(fills).filter(
      (el) => (el as HTMLElement).style.width === '100%'
    );
    expect(fullFills).toHaveLength(5);
  });

  it('fills 1 segment for score 1', () => {
    const { container } = render(<ScoreBar score={1} />);
    const fills = container.querySelectorAll('.score-bar__fill');
    const fullFills = Array.from(fills).filter(
      (el) => (el as HTMLElement).style.width === '100%'
    );
    expect(fullFills).toHaveLength(1);
  });

  it('handles float score 3.5 with partial fill', () => {
    const { container } = render(<ScoreBar score={3.5} />);
    const fills = container.querySelectorAll('.score-bar__fill');
    const widths = Array.from(fills).map(
      (el) => (el as HTMLElement).style.width
    );
    // First 3 segments full, 4th at 50%, 5th at 0%
    expect(widths[0]).toBe('100%');
    expect(widths[1]).toBe('100%');
    expect(widths[2]).toBe('100%');
    expect(widths[3]).toBe('50%');
    expect(widths[4]).toBe('0%');
  });

  it('applies md size class by default', () => {
    const { container } = render(<ScoreBar score={3} />);
    expect(container.querySelector('.score-bar--md')).toBeTruthy();
  });

  it('applies sm size class when specified', () => {
    const { container } = render(<ScoreBar score={3} size="sm" />);
    expect(container.querySelector('.score-bar--sm')).toBeTruthy();
  });

  it('has accessible aria-label with score', () => {
    render(<ScoreBar score={3.5} label="Concrete example" />);
    expect(
      screen.getByRole('img', { name: 'Concrete example: 3.5 out of 5' })
    ).toBeTruthy();
  });

  it('has default aria-label without label prop', () => {
    render(<ScoreBar score={4} />);
    expect(
      screen.getByRole('img', { name: 'Score: 4.0 out of 5' })
    ).toBeTruthy();
  });
});
