import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import fc from 'fast-check';
import { PracticeBubbles } from '@/components/PracticeBubbles';
import { GuidePanel } from '@/components/GuidePanel';
import { matchKeywords } from '@/utils/keywordMatcher';
import type { SessionState, CompetencyGuide, TranscriptEntry } from '@/types/session';
import { initialState } from '@/reducers/sessionReducer';
import { InterviewScreen } from '@/components/InterviewScreen';

// --- Mocks for InterviewScreen tests ---
const mockDispatch = vi.fn();
const mockSetWebSocketClient = vi.fn();
let mockState: SessionState;

vi.mock('@/contexts/SessionContext', () => ({
  useSession: () => ({
    state: mockState,
    dispatch: mockDispatch,
    setWebSocketClient: mockSetWebSocketClient,
  }),
}));

vi.mock('@/hooks/useInterviewStreaming', () => ({
  useInterviewStreaming: () => ({
    audioManagerRef: { current: null },
  }),
}));

vi.mock('@/services/agent3Client', () => ({
  callAgent3: vi.fn(),
}));

// --- Helpers ---
function makeGuide(overrides: Partial<CompetencyGuide> = {}): CompetencyGuide {
  return {
    id: overrides.id ?? 'guide-1',
    title: overrides.title ?? 'Leadership',
    keywords: overrides.keywords ?? ['leadership', 'team'],
    description: overrides.description ?? 'Team leadership skills',
    highlighted: overrides.highlighted ?? false,
  };
}

function makeTranscriptEntry(role: 'interviewer' | 'user', text: string): TranscriptEntry {
  return { role, text, timestamp: new Date().toISOString() };
}

// --- fast-check Arbitraries ---
const guidArb = fc.record({
  id: fc.uuid(),
  title: fc.string({ minLength: 1, maxLength: 50 }),
  keywords: fc.array(fc.string({ minLength: 1, maxLength: 30 }), { minLength: 1, maxLength: 5 }),
  description: fc.string({ minLength: 1, maxLength: 100 }),
  highlighted: fc.boolean(),
});

const transcriptEntryArb = fc.record({
  role: fc.oneof(fc.constant('interviewer' as const), fc.constant('user' as const)),
  text: fc.string({ minLength: 1, maxLength: 200 }),
  timestamp: fc.date().map((d) => d.toISOString()),
});

// --- Unit Tests ---
describe('keywordMatcher', () => {
  it('returns empty array for empty text', () => {
    const guides = [makeGuide()];
    expect(matchKeywords('', guides)).toEqual([]);
  });

  it('returns empty array for empty guides', () => {
    expect(matchKeywords('some text', [])).toEqual([]);
  });

  it('matches English keyword with word boundary', () => {
    const guide = makeGuide({ id: 'g1', keywords: ['team'] });
    expect(matchKeywords('Working with the team was great', [guide])).toEqual(['g1']);
  });

  it('does not match English keyword without word boundary', () => {
    const guide = makeGuide({ id: 'g1', keywords: ['team'] });
    // "teamwork" should NOT match "team" with word boundary
    expect(matchKeywords('teamwork is important', [guide])).toEqual([]);
  });

  it('matches case-insensitively for English', () => {
    const guide = makeGuide({ id: 'g1', keywords: ['Leadership'] });
    expect(matchKeywords('My LEADERSHIP experience', [guide])).toEqual(['g1']);
  });

  it('matches Korean keyword by simple inclusion', () => {
    const guide = makeGuide({ id: 'g1', keywords: ['리더십'] });
    expect(matchKeywords('저는 리더십이 있습니다', [guide])).toEqual(['g1']);
  });

  it('matches Korean keyword case-insensitively', () => {
    const guide = makeGuide({ id: 'g1', keywords: ['협업'] });
    expect(matchKeywords('팀 협업 경험', [guide])).toEqual(['g1']);
  });

  it('returns multiple matched guide IDs', () => {
    const guides = [
      makeGuide({ id: 'g1', keywords: ['python'] }),
      makeGuide({ id: 'g2', keywords: ['java'] }),
      makeGuide({ id: 'g3', keywords: ['rust'] }),
    ];
    expect(matchKeywords('I use python and java daily', guides)).toEqual(['g1', 'g2']);
  });

  it('handles special regex characters in keywords', () => {
    const guide = makeGuide({ id: 'g1', keywords: ['C++'] });
    // C++ contains regex special chars; should not throw
    expect(() => matchKeywords('I know C++ well', [guide])).not.toThrow();
  });
});

describe('PracticeBubbles', () => {
  it('shows interviewer bubbles when practiceMode is ON', () => {
    const transcript = [
      makeTranscriptEntry('interviewer', 'Tell me about yourself'),
      makeTranscriptEntry('user', 'I am a student'),
      makeTranscriptEntry('interviewer', 'What project are you proud of?'),
    ];
    render(<PracticeBubbles practiceMode={true} transcript={transcript} />);
    const bubbles = screen.getAllByTestId('practice-bubble');
    expect(bubbles).toHaveLength(2); // only interviewer entries
    expect(bubbles[0].textContent).toBe('Tell me about yourself');
    expect(bubbles[1].textContent).toBe('What project are you proud of?');
  });

  it('never shows user answers as bubbles', () => {
    const transcript = [
      makeTranscriptEntry('user', 'My answer here'),
      makeTranscriptEntry('user', 'Another answer'),
    ];
    render(<PracticeBubbles practiceMode={true} transcript={transcript} />);
    expect(screen.queryAllByTestId('practice-bubble')).toHaveLength(0);
  });

  it('shows no bubbles when practiceMode is OFF', () => {
    const transcript = [
      makeTranscriptEntry('interviewer', 'Tell me about yourself'),
    ];
    render(<PracticeBubbles practiceMode={false} transcript={transcript} />);
    expect(screen.queryAllByTestId('practice-bubble')).toHaveLength(0);
  });

  it('ON→OFF immediately removes bubbles', () => {
    const transcript = [makeTranscriptEntry('interviewer', 'Question')];
    const { rerender } = render(<PracticeBubbles practiceMode={true} transcript={transcript} />);
    expect(screen.getAllByTestId('practice-bubble')).toHaveLength(1);

    rerender(<PracticeBubbles practiceMode={false} transcript={transcript} />);
    expect(screen.queryAllByTestId('practice-bubble')).toHaveLength(0);
  });
});

describe('GuidePanel', () => {
  it('always shows guide list regardless of practiceMode', () => {
    const guides = [makeGuide({ id: 'g1' }), makeGuide({ id: 'g2' })];
    render(<GuidePanel guides={guides} practiceMode={false} currentInterviewerText={null} />);
    expect(screen.getAllByTestId('guide-panel-item')).toHaveLength(2);
  });

  it('highlights matching guides when practiceMode ON', () => {
    const guides = [
      makeGuide({ id: 'g1', keywords: ['leadership'] }),
      makeGuide({ id: 'g2', keywords: ['python'] }),
    ];
    render(<GuidePanel guides={guides} practiceMode={true} currentInterviewerText="Tell me about your leadership" />);
    const items = screen.getAllByTestId('guide-panel-item');
    expect(items[0].getAttribute('data-highlighted')).toBe('true');
    expect(items[1].getAttribute('data-highlighted')).toBe('false');
  });

  it('no highlights when practiceMode OFF', () => {
    const guides = [makeGuide({ id: 'g1', keywords: ['leadership'] })];
    render(<GuidePanel guides={guides} practiceMode={false} currentInterviewerText="Tell me about your leadership" />);
    const items = screen.getAllByTestId('guide-panel-item');
    expect(items[0].getAttribute('data-highlighted')).toBe('false');
  });

  it('clears highlights on ON→OFF transition', () => {
    const guides = [makeGuide({ id: 'g1', keywords: ['leadership'] })];
    const { rerender } = render(
      <GuidePanel guides={guides} practiceMode={true} currentInterviewerText="leadership example" />
    );
    expect(screen.getByTestId('guide-panel-item').getAttribute('data-highlighted')).toBe('true');

    rerender(<GuidePanel guides={guides} practiceMode={false} currentInterviewerText="leadership example" />);
    expect(screen.getByTestId('guide-panel-item').getAttribute('data-highlighted')).toBe('false');
  });
});

// --- Property-Based Tests ---

describe('Property 8: Practice Mode 격리', () => {
  /**
   * Feature: frontend-interview, Property 8: Practice Mode 격리
   * Validates: Requirements 5.2
   *
   * For any Practice Mode toggle state change, WebSocket messages or
   * Nova Sonic session must not be affected (frontend rendering only).
   */
  beforeEach(() => {
    mockDispatch.mockClear();
    mockState = {
      ...initialState,
      phase: 'interview',
      turnState: 'idle',
      practiceMode: true,
      elapsedSeconds: 0,
    };
  });

  it('PBT: toggling Practice Mode only dispatches TOGGLE_PRACTICE_MODE, no WS-related actions', () => {
    fc.assert(
      fc.property(
        fc.nat({ max: 20 }),
        (toggleCount) => {
          mockDispatch.mockClear();
          mockState = {
            ...initialState,
            phase: 'interview',
            turnState: 'idle',
            practiceMode: true,
            elapsedSeconds: 0,
          };

          const { unmount } = render(<InterviewScreen />);
          const toggle = screen.getByTestId('practice-mode-toggle');

          for (let i = 0; i < toggleCount; i++) {
            fireEvent.click(toggle);
          }

          // Filter out TICK dispatches (from timer)
          const nonTickCalls = mockDispatch.mock.calls.filter(
            (call) => call[0].type !== 'TICK'
          );

          // Every dispatch should be TOGGLE_PRACTICE_MODE only
          for (const call of nonTickCalls) {
            expect(call[0].type).toBe('TOGGLE_PRACTICE_MODE');
          }
          expect(nonTickCalls).toHaveLength(toggleCount);

          unmount();
        }
      ),
      { numRuns: 100 }
    );
  });
});

describe('Property 9: Practice Mode ON — 표시 규칙', () => {
  /**
   * Feature: frontend-interview, Property 9: Practice Mode ON — 표시 규칙
   * Validates: Requirements 5.3, 5.4
   *
   * For any transcript entries with Practice Mode ON:
   * - Interviewer text is shown as bubbles
   * - User text is NEVER shown as bubbles
   */
  it('PBT: Practice Mode ON shows only interviewer bubbles, never user bubbles', () => {
    fc.assert(
      fc.property(
        fc.array(transcriptEntryArb, { minLength: 0, maxLength: 20 }),
        (transcript) => {
          const { unmount } = render(
            <PracticeBubbles practiceMode={true} transcript={transcript} />
          );

          const bubbles = screen.queryAllByTestId('practice-bubble');
          const interviewerEntries = transcript.filter((e) => e.role === 'interviewer');

          // Number of bubbles must equal number of interviewer entries
          expect(bubbles.length).toBe(interviewerEntries.length);

          // Each bubble text matches interviewer entries in order
          for (let i = 0; i < bubbles.length; i++) {
            expect(bubbles[i].textContent).toBe(interviewerEntries[i].text);
          }

          unmount();
        }
      ),
      { numRuns: 100 }
    );
  });
});

describe('Property 10: Practice Mode OFF — 텍스트 숨김', () => {
  /**
   * Feature: frontend-interview, Property 10: Practice Mode OFF — 텍스트 숨김
   * Validates: Requirements 5.5
   *
   * For any transcript entries with Practice Mode OFF, no text bubbles are displayed.
   */
  it('PBT: Practice Mode OFF shows no bubbles regardless of transcript content', () => {
    fc.assert(
      fc.property(
        fc.array(transcriptEntryArb, { minLength: 0, maxLength: 20 }),
        (transcript) => {
          const { unmount } = render(
            <PracticeBubbles practiceMode={false} transcript={transcript} />
          );

          const bubbles = screen.queryAllByTestId('practice-bubble');
          expect(bubbles.length).toBe(0);

          unmount();
        }
      ),
      { numRuns: 100 }
    );
  });
});

describe('Property 11: Practice Mode ON→OFF 즉시 제거', () => {
  /**
   * Feature: frontend-interview, Property 11: Practice Mode ON→OFF 즉시 제거
   * Validates: Requirements 5.6
   *
   * For any state with Practice Mode ON that has bubbles/highlights displayed,
   * switching to OFF immediately removes all bubbles and guide highlights.
   */
  it('PBT: ON→OFF transition immediately removes all bubbles and highlights', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            role: fc.constant('interviewer' as const),
            text: fc.string({ minLength: 1, maxLength: 100 }),
            timestamp: fc.date().map((d) => d.toISOString()),
          }),
          { minLength: 1, maxLength: 10 }
        ),
        fc.array(guidArb, { minLength: 1, maxLength: 5 }),
        (interviewerTranscript, guides) => {
          // Render PracticeBubbles in ON state
          const { rerender: rerenderBubbles, unmount: unmountBubbles } = render(
            <PracticeBubbles practiceMode={true} transcript={interviewerTranscript} />
          );

          // Verify bubbles exist in ON state
          const bubblesOn = screen.queryAllByTestId('practice-bubble');
          expect(bubblesOn.length).toBe(interviewerTranscript.length);

          // Switch to OFF
          rerenderBubbles(
            <PracticeBubbles practiceMode={false} transcript={interviewerTranscript} />
          );

          // Verify all bubbles removed
          const bubblesOff = screen.queryAllByTestId('practice-bubble');
          expect(bubblesOff.length).toBe(0);

          unmountBubbles();

          // Now test GuidePanel highlights
          const textWithKeyword = guides[0]?.keywords[0]
            ? `This text contains ${guides[0].keywords[0]} keyword`
            : 'no match';

          const { rerender: rerenderGuide, unmount: unmountGuide } = render(
            <GuidePanel guides={guides} practiceMode={true} currentInterviewerText={textWithKeyword} />
          );

          // Switch to OFF
          rerenderGuide(
            <GuidePanel guides={guides} practiceMode={false} currentInterviewerText={textWithKeyword} />
          );

          // All highlights must be cleared
          const items = screen.queryAllByTestId('guide-panel-item');
          for (const item of items) {
            expect(item.getAttribute('data-highlighted')).toBe('false');
          }

          unmountGuide();
        }
      ),
      { numRuns: 100 }
    );
  });
});

describe('Property 12: Guide 키워드 매칭 일관성', () => {
  /**
   * Feature: frontend-interview, Property 12: Guide 키워드 매칭 일관성
   * Validates: Requirements 6.2
   *
   * For any interviewer text and competency_guides list, every guide ID
   * returned by matchKeywords has at least one keyword present in the text.
   */
  it('PBT: every returned guide ID has at least one keyword present in the text', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 0, maxLength: 500 }),
        fc.array(guidArb, { minLength: 0, maxLength: 10 }),
        (text, guides) => {
          const matchedIds = matchKeywords(text, guides);

          for (const id of matchedIds) {
            const guide = guides.find((g) => g.id === id);
            expect(guide).toBeDefined();

            // At least one keyword must actually be present in the text
            const hasKeywordInText = guide!.keywords.some((keyword) => {
              if (!keyword) return false;
              // Use the same logic as the matcher
              const isKoreanKw = /[\uAC00-\uD7AF\u1100-\u11FF\u3130-\u318F]/.test(keyword);
              if (isKoreanKw) {
                return text.toLowerCase().includes(keyword.toLowerCase());
              }
              const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
              const regex = new RegExp(`\\b${escaped}\\b`, 'i');
              return regex.test(text);
            });

            expect(hasKeywordInText).toBe(true);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});
