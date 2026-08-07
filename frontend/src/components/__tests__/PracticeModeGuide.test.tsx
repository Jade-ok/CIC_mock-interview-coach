import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { GuidePanel } from '@/components/GuidePanel';
import { PracticeBubbles } from '@/components/PracticeBubbles';
import { matchKeywords } from '@/utils/keywordMatcher';
import type { CompetencyGuide, TranscriptEntry } from '@/types/session';

function guide(id: string, keywords: string[]): CompetencyGuide {
  return {
    id,
    title: `${id} guide`,
    description: `${id} description`,
    keywords,
    highlighted: false,
  };
}

function entry(role: TranscriptEntry['role'], text: string, timestamp: string): TranscriptEntry {
  return { role, text, timestamp };
}

describe('matchKeywords', () => {
  const guides = [
    guide('leadership', ['leadership', 'team']),
    guide('technical', ['C++', 'API design']),
  ];

  it('matches complete English keywords case-insensitively', () => {
    expect(matchKeywords('Describe your LEADERSHIP experience.', guides)).toEqual(['leadership']);
  });

  it('does not match a keyword inside a larger word', () => {
    expect(matchKeywords('How do you encourage teamwork?', guides)).toEqual([]);
  });

  it('supports phrases, flexible whitespace, and punctuation in keywords', () => {
    expect(matchKeywords('Tell me about your API   design work in C++.', guides)).toEqual(['technical']);
  });

  it('returns each matching guide once even when several keywords match', () => {
    expect(matchKeywords('How did your team demonstrate leadership?', guides)).toEqual(['leadership']);
  });
});

describe('PracticeBubbles', () => {
  const transcript = [
    entry('interviewer', 'Tell me about a difficult project.', '2026-01-01T00:00:00Z'),
    entry('user', 'I led a platform migration.', '2026-01-01T00:00:01Z'),
    entry('interviewer', 'What did you learn?', '2026-01-01T00:00:02Z'),
  ];

  it('shows only interviewer entries while Practice Mode is on', () => {
    render(<PracticeBubbles practiceMode transcript={transcript} />);

    expect(screen.getAllByTestId('practice-bubble')).toHaveLength(2);
    expect(screen.getByText('Tell me about a difficult project.')).toBeInTheDocument();
    expect(screen.queryByText('I led a platform migration.')).not.toBeInTheDocument();
  });

  it('removes all bubbles immediately when Practice Mode is turned off', () => {
    const { rerender } = render(<PracticeBubbles practiceMode transcript={transcript} />);
    rerender(<PracticeBubbles practiceMode={false} transcript={transcript} />);

    expect(screen.queryAllByTestId('practice-bubble')).toHaveLength(0);
  });
});

describe('GuidePanel', () => {
  const guides = [guide('leadership', ['leadership']), guide('technical', ['Python'])];

  it('always renders guides and highlights matches only in Practice Mode', () => {
    const { rerender } = render(
      <GuidePanel
        guides={guides}
        practiceMode
        currentInterviewerText="Give me a leadership example."
      />
    );

    const items = screen.getAllByTestId('guide-panel-item');
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveAttribute('data-highlighted', 'true');
    expect(items[1]).toHaveAttribute('data-highlighted', 'false');
    expect(screen.getByTestId('guide-key-match-badge')).toHaveTextContent('KEY MATCH');

    rerender(
      <GuidePanel
        guides={guides}
        practiceMode={false}
        currentInterviewerText="Give me a leadership example."
      />
    );

    for (const item of screen.getAllByTestId('guide-panel-item')) {
      expect(item).toHaveAttribute('data-highlighted', 'false');
    }
    expect(screen.queryByTestId('guide-key-match-badge')).not.toBeInTheDocument();
  });
});
