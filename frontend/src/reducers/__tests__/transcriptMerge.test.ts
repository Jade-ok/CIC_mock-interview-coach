import { describe, it, expect } from 'vitest';
import { sessionReducer, initialState } from '../sessionReducer';
import type { SessionState, TranscriptEntry } from '@/types/session';

/**
 * Tests for APPEND_TRANSCRIPT merge behavior:
 * - Same-role entries within 4s window are merged into one
 * - Different-role entries are never merged
 * - Same-role entries beyond the 4s window are NOT merged
 * - Merged text has proper space separation
 * - livePartial is cleared in both paths
 */

function makeEntry(role: 'interviewer' | 'user', text: string, isoTimestamp: string): TranscriptEntry {
  return { role, text, timestamp: isoTimestamp };
}

function stateWithTranscript(entries: TranscriptEntry[]): SessionState {
  return { ...initialState, transcript: entries, phase: 'interview' };
}

describe('APPEND_TRANSCRIPT — merge behavior', () => {
  describe('same-role within time window → merges', () => {
    it('merges two consecutive same-role user entries within 4s', () => {
      const t0 = '2026-08-08T10:00:00.000Z';
      const t1 = '2026-08-08T10:00:02.000Z'; // 2s later
      const state = stateWithTranscript([makeEntry('user', 'everyone has a different background and', t0)]);

      const result = sessionReducer(state, {
        type: 'APPEND_TRANSCRIPT',
        payload: makeEntry('user', 'then try to communicate', t1),
      });

      expect(result.transcript).toHaveLength(1);
      expect(result.transcript[0].text).toBe('everyone has a different background and then try to communicate');
      expect(result.transcript[0].role).toBe('user');
      expect(result.transcript[0].timestamp).toBe(t1);
    });

    it('merges three consecutive same-role entries within window', () => {
      const t0 = '2026-08-08T10:00:00.000Z';
      const t1 = '2026-08-08T10:00:01.500Z';
      const t2 = '2026-08-08T10:00:03.000Z';
      let state = stateWithTranscript([makeEntry('user', 'I tried', t0)]);

      state = sessionReducer(state, {
        type: 'APPEND_TRANSCRIPT',
        payload: makeEntry('user', 'to understand', t1),
      });

      state = sessionReducer(state, {
        type: 'APPEND_TRANSCRIPT',
        payload: makeEntry('user', 'the problem', t2),
      });

      expect(state.transcript).toHaveLength(1);
      expect(state.transcript[0].text).toBe('I tried to understand the problem');
    });

    it('merges consecutive interviewer entries within window', () => {
      const t0 = '2026-08-08T10:00:00.000Z';
      const t1 = '2026-08-08T10:00:03.500Z'; // 3.5s later — still within 4s
      const state = stateWithTranscript([makeEntry('interviewer', 'Tell me about', t0)]);

      const result = sessionReducer(state, {
        type: 'APPEND_TRANSCRIPT',
        payload: makeEntry('interviewer', 'your experience.', t1),
      });

      expect(result.transcript).toHaveLength(1);
      expect(result.transcript[0].text).toBe('Tell me about your experience.');
    });
  });

  describe('different role → does NOT merge', () => {
    it('creates new entry when role changes from interviewer to user', () => {
      const t0 = '2026-08-08T10:00:00.000Z';
      const t1 = '2026-08-08T10:00:01.000Z';
      const state = stateWithTranscript([makeEntry('interviewer', 'Tell me about yourself.', t0)]);

      const result = sessionReducer(state, {
        type: 'APPEND_TRANSCRIPT',
        payload: makeEntry('user', 'I am a student', t1),
      });

      expect(result.transcript).toHaveLength(2);
      expect(result.transcript[0].text).toBe('Tell me about yourself.');
      expect(result.transcript[1].text).toBe('I am a student');
    });

    it('creates new entry when role changes from user to interviewer', () => {
      const t0 = '2026-08-08T10:00:00.000Z';
      const t1 = '2026-08-08T10:00:00.500Z';
      const state = stateWithTranscript([makeEntry('user', 'My answer', t0)]);

      const result = sessionReducer(state, {
        type: 'APPEND_TRANSCRIPT',
        payload: makeEntry('interviewer', 'Great. Next question.', t1),
      });

      expect(result.transcript).toHaveLength(2);
    });
  });

  describe('same role but beyond time window → does NOT merge', () => {
    it('creates new entry when gap exceeds 4 seconds', () => {
      const t0 = '2026-08-08T10:00:00.000Z';
      const t1 = '2026-08-08T10:00:05.000Z'; // 5s later
      const state = stateWithTranscript([makeEntry('user', 'First thought.', t0)]);

      const result = sessionReducer(state, {
        type: 'APPEND_TRANSCRIPT',
        payload: makeEntry('user', 'Second thought after pause.', t1),
      });

      expect(result.transcript).toHaveLength(2);
      expect(result.transcript[0].text).toBe('First thought.');
      expect(result.transcript[1].text).toBe('Second thought after pause.');
    });

    it('creates new entry at exactly 4 seconds gap (boundary)', () => {
      const t0 = '2026-08-08T10:00:00.000Z';
      const t1 = '2026-08-08T10:00:04.000Z'; // exactly 4s — not < 4s
      const state = stateWithTranscript([makeEntry('user', 'Part one', t0)]);

      const result = sessionReducer(state, {
        type: 'APPEND_TRANSCRIPT',
        payload: makeEntry('user', 'Part two', t1),
      });

      expect(result.transcript).toHaveLength(2);
    });
  });

  describe('space handling in merged text', () => {
    it('adds space between fragments when neither ends/starts with space', () => {
      const t0 = '2026-08-08T10:00:00.000Z';
      const t1 = '2026-08-08T10:00:01.000Z';
      const state = stateWithTranscript([makeEntry('user', 'hello', t0)]);

      const result = sessionReducer(state, {
        type: 'APPEND_TRANSCRIPT',
        payload: makeEntry('user', 'world', t1),
      });

      expect(result.transcript[0].text).toBe('hello world');
    });

    it('does not double-space when first text ends with space', () => {
      const t0 = '2026-08-08T10:00:00.000Z';
      const t1 = '2026-08-08T10:00:01.000Z';
      const state = stateWithTranscript([makeEntry('user', 'hello ', t0)]);

      const result = sessionReducer(state, {
        type: 'APPEND_TRANSCRIPT',
        payload: makeEntry('user', 'world', t1),
      });

      expect(result.transcript[0].text).toBe('hello world');
    });

    it('does not double-space when second text starts with space', () => {
      const t0 = '2026-08-08T10:00:00.000Z';
      const t1 = '2026-08-08T10:00:01.000Z';
      const state = stateWithTranscript([makeEntry('user', 'hello', t0)]);

      const result = sessionReducer(state, {
        type: 'APPEND_TRANSCRIPT',
        payload: makeEntry('user', ' world', t1),
      });

      expect(result.transcript[0].text).toBe('hello world');
    });
  });

  describe('livePartial cleared on merge', () => {
    it('clears livePartial when merging', () => {
      const t0 = '2026-08-08T10:00:00.000Z';
      const t1 = '2026-08-08T10:00:01.000Z';
      const state: SessionState = {
        ...stateWithTranscript([makeEntry('user', 'hello', t0)]),
        livePartial: { role: 'user', text: 'partial...' },
      };

      const result = sessionReducer(state, {
        type: 'APPEND_TRANSCRIPT',
        payload: makeEntry('user', 'world', t1),
      });

      expect(result.livePartial).toBeNull();
    });

    it('clears livePartial when NOT merging (new entry)', () => {
      const t0 = '2026-08-08T10:00:00.000Z';
      const t1 = '2026-08-08T10:00:01.000Z';
      const state: SessionState = {
        ...stateWithTranscript([makeEntry('interviewer', 'question', t0)]),
        livePartial: { role: 'user', text: 'partial...' },
      };

      const result = sessionReducer(state, {
        type: 'APPEND_TRANSCRIPT',
        payload: makeEntry('user', 'answer', t1),
      });

      expect(result.livePartial).toBeNull();
    });
  });

  describe('empty transcript (first entry)', () => {
    it('adds first entry normally when transcript is empty', () => {
      const t0 = '2026-08-08T10:00:00.000Z';
      const result = sessionReducer(initialState, {
        type: 'APPEND_TRANSCRIPT',
        payload: makeEntry('interviewer', 'Hello, let us begin.', t0),
      });

      expect(result.transcript).toHaveLength(1);
      expect(result.transcript[0].text).toBe('Hello, let us begin.');
    });
  });
});
