/**
 * Tests for UPDATE_LIVE_PARTIAL accumulation fix.
 *
 * Bug: Nova 2 Sonic sends incremental PARTIAL text_output events (each containing
 * only the new token). The reducer previously replaced livePartial with each new
 * chunk instead of appending, causing subtitles to show only the latest fragment.
 *
 * Fix: Append text when role matches existing livePartial; reset when role differs.
 * FINAL always clears livePartial to null (clean boundary between questions).
 */

import { describe, it, expect } from 'vitest';
import { sessionReducer, initialState } from '../sessionReducer';
import type { SessionState, SessionAction } from '@/types/session';

function dispatch(state: SessionState, action: SessionAction): SessionState {
  return sessionReducer(state, action);
}

function dispatchSequence(state: SessionState, actions: SessionAction[]): SessionState {
  return actions.reduce((s, a) => sessionReducer(s, a), state);
}

describe('UPDATE_LIVE_PARTIAL accumulation (bug condition)', () => {
  it('appends text for consecutive same-role partials', () => {
    let state = dispatch(initialState, {
      type: 'UPDATE_LIVE_PARTIAL',
      payload: { role: 'interviewer', text: 'Tell ' },
    });
    state = dispatch(state, {
      type: 'UPDATE_LIVE_PARTIAL',
      payload: { role: 'interviewer', text: 'me about yourself.' },
    });

    expect(state.livePartial).toEqual({
      role: 'interviewer',
      text: 'Tell me about yourself.',
    });
  });

  it('accumulates three consecutive user partials', () => {
    const state = dispatchSequence(initialState, [
      { type: 'UPDATE_LIVE_PARTIAL', payload: { role: 'user', text: 'I ' } },
      { type: 'UPDATE_LIVE_PARTIAL', payload: { role: 'user', text: 'worked ' } },
      { type: 'UPDATE_LIVE_PARTIAL', payload: { role: 'user', text: 'on React.' } },
    ]);

    expect(state.livePartial).toEqual({
      role: 'user',
      text: 'I worked on React.',
    });
  });

  it('accumulates many small token partials', () => {
    const tokens = ['What ', 'was ', 'your ', 'biggest ', 'challenge?'];
    const actions: SessionAction[] = tokens.map((text) => ({
      type: 'UPDATE_LIVE_PARTIAL',
      payload: { role: 'interviewer', text },
    }));

    const state = dispatchSequence(initialState, actions);

    expect(state.livePartial).toEqual({
      role: 'interviewer',
      text: 'What was your biggest challenge?',
    });
  });

  it('handles empty string partials without breaking accumulation', () => {
    const state = dispatchSequence(initialState, [
      { type: 'UPDATE_LIVE_PARTIAL', payload: { role: 'interviewer', text: 'Hello' } },
      { type: 'UPDATE_LIVE_PARTIAL', payload: { role: 'interviewer', text: '' } },
      { type: 'UPDATE_LIVE_PARTIAL', payload: { role: 'interviewer', text: ' world' } },
    ]);

    expect(state.livePartial).toEqual({
      role: 'interviewer',
      text: 'Hello world',
    });
  });
});

describe('APPEND_TRANSCRIPT always clears livePartial (clean question boundary)', () => {
  it('clears livePartial even when partial has more accumulated text', () => {
    // Simulate: partial accumulated "Sentence A. Sentence B." but FINAL only commits "Sentence A."
    // Residual is intentionally dropped — clean break between questions.
    let state = dispatchSequence(initialState, [
      { type: 'UPDATE_LIVE_PARTIAL', payload: { role: 'interviewer', text: 'Sentence A. ' } },
      { type: 'UPDATE_LIVE_PARTIAL', payload: { role: 'interviewer', text: 'Sentence B.' } },
    ]);
    expect(state.livePartial!.text).toBe('Sentence A. Sentence B.');

    state = dispatch(state, {
      type: 'APPEND_TRANSCRIPT',
      payload: { role: 'interviewer', text: 'Sentence A.', timestamp: new Date().toISOString() },
    });

    expect(state.transcript).toHaveLength(1);
    expect(state.transcript[0].text).toBe('Sentence A.');
    // livePartial is always cleared — no residual kept
    expect(state.livePartial).toBeNull();
  });

  it('clears livePartial when FINAL text matches accumulated exactly', () => {
    let state = dispatchSequence(initialState, [
      { type: 'UPDATE_LIVE_PARTIAL', payload: { role: 'interviewer', text: 'Hello ' } },
      { type: 'UPDATE_LIVE_PARTIAL', payload: { role: 'interviewer', text: 'there' } },
    ]);
    state = dispatch(state, {
      type: 'APPEND_TRANSCRIPT',
      payload: { role: 'interviewer', text: 'Hello there', timestamp: new Date().toISOString() },
    });

    expect(state.livePartial).toBeNull();
  });

  it('clears livePartial when roles differ', () => {
    let state = dispatch(initialState, {
      type: 'UPDATE_LIVE_PARTIAL',
      payload: { role: 'user', text: 'Some text' },
    });
    state = dispatch(state, {
      type: 'APPEND_TRANSCRIPT',
      payload: { role: 'interviewer', text: 'Response', timestamp: new Date().toISOString() },
    });

    expect(state.livePartial).toBeNull();
  });
});

describe('UPDATE_LIVE_PARTIAL preservation (non-bug conditions)', () => {
  it('creates fresh livePartial when current is null', () => {
    const state = dispatch(initialState, {
      type: 'UPDATE_LIVE_PARTIAL',
      payload: { role: 'interviewer', text: 'Hello' },
    });

    expect(state.livePartial).toEqual({ role: 'interviewer', text: 'Hello' });
  });

  it('resets livePartial when role changes', () => {
    let state = dispatch(initialState, {
      type: 'UPDATE_LIVE_PARTIAL',
      payload: { role: 'interviewer', text: 'Tell me about' },
    });
    state = dispatch(state, {
      type: 'UPDATE_LIVE_PARTIAL',
      payload: { role: 'user', text: 'Well ' },
    });

    expect(state.livePartial).toEqual({ role: 'user', text: 'Well ' });
  });

  it('CLEAR_LIVE_PARTIAL resets accumulated partial to null', () => {
    let state = dispatchSequence(initialState, [
      { type: 'UPDATE_LIVE_PARTIAL', payload: { role: 'interviewer', text: 'Tell ' } },
      { type: 'UPDATE_LIVE_PARTIAL', payload: { role: 'interviewer', text: 'me' } },
    ]);
    state = dispatch(state, { type: 'CLEAR_LIVE_PARTIAL' });

    expect(state.livePartial).toBeNull();
  });

  it('INTERVIEW_ENDING flushes accumulated interviewer partial to transcript', () => {
    let state: SessionState = {
      ...initialState,
      phase: 'interview',
      turnState: 'ai_speaking',
    };
    state = dispatchSequence(state, [
      { type: 'UPDATE_LIVE_PARTIAL', payload: { role: 'interviewer', text: 'Thank you ' } },
      { type: 'UPDATE_LIVE_PARTIAL', payload: { role: 'interviewer', text: 'for your time.' } },
    ]);
    state = dispatch(state, { type: 'INTERVIEW_ENDING' });

    expect(state.livePartial).toBeNull();
    expect(state.transcript).toHaveLength(1);
    expect(state.transcript[0].text).toBe('Thank you for your time.');
    expect(state.transcript[0].role).toBe('interviewer');
  });
});
