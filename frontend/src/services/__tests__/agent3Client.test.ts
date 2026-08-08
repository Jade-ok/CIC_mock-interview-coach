import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildAgent3Request, callAgent3 } from '@/services/agent3Client';
import { initialState } from '@/reducers/sessionReducer';
import type { SessionState, TranscriptEntry } from '@/types/session';

const analystOutput = {
  candidate_profile: { candidate_level: 'new_grad' },
  target_role: { title: 'Software Engineer' },
};

function transcript(pairCount: number): TranscriptEntry[] {
  return Array.from({ length: pairCount }, (_, index) => [
    {
      role: 'interviewer' as const,
      text: `Question ${index + 1}`,
      timestamp: `2026-01-01T00:00:${String(index * 2).padStart(2, '0')}Z`,
    },
    {
      role: 'user' as const,
      text: `Answer ${index + 1}`,
      timestamp: `2026-01-01T00:00:${String(index * 2 + 1).padStart(2, '0')}Z`,
    },
  ]).flat();
}

function stateWith(pairCount: number): SessionState {
  return {
    ...initialState,
    analystOutput,
    transcript: transcript(pairCount),
  };
}

describe('buildAgent3Request', () => {
  it('maps six transcript pairs to the canonical interviewer output', () => {
    const request = buildAgent3Request(stateWith(6));

    expect(request.conversation).toHaveLength(6);
    expect(request.conversation[0]).toEqual({
      point_id: 'point_1',
      turn_type: 'main_question',
      question: 'Question 1',
      answer: 'Answer 1',
    });
    expect(request.conversation[5]).toMatchObject({
      point_id: 'point_3',
      turn_type: 'follow_up',
    });
    expect(request.interview_metadata).toEqual({
      candidate_level: 'new_grad',
      target_role: 'Software Engineer',
      status: 'completed',
      completion_reason: 'all_questions_completed',
      main_questions_completed: 3,
      follow_ups_completed: 3,
      ended_early: false,
    });
    expect(request.analyst_output).toBe(analystOutput);
  });

  it('marks a partial interview as ended early and ignores an unanswered closing', () => {
    const state = stateWith(2);
    state.transcript.push({
      role: 'interviewer',
      text: 'Thanks for your time.',
      timestamp: '2026-01-01T00:01:00Z',
    });

    const request = buildAgent3Request(state);
    expect(request.conversation).toHaveLength(2);
    expect(request.interview_metadata).toMatchObject({
      status: 'ended_early',
      completion_reason: 'user_ended_early',
      main_questions_completed: 1,
      follow_ups_completed: 1,
      ended_early: true,
    });
  });

  it('rejects state that lost the Analyst output', () => {
    expect(() => buildAgent3Request(initialState)).toThrow(
      'without Analyst output'
    );
  });
});

describe('callAgent3', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('posts the canonical request and returns the evaluator response', async () => {
    const request = buildAgent3Request(stateWith(1));
    const feedback = {
      per_question_scores: [{
        question_text: 'Question 1',
        feedback: { strength: 'Good example.', improvement: 'Add metrics.' },
        scores: {
          concrete_example: 3,
          situation_action_result: 3,
          link_to_job: 3,
          quantifiable_outcome: 3,
        },
      }],
      overall_scores: {
        dimensions: {
          concrete_example: 3,
          situation_action_result: 3,
          link_to_job: 3,
          quantifiable_outcome: 3,
        },
        total: 3,
      },
      question_count: 1,
      readiness_label: 'Developing well',
      strengths: ['Clear example'],
      improvements: ['Add metrics'],
      keywords_covered: ['React'],
      keywords_not_covered: ['AWS'],
      contextual_advice: ['Connect to the role'],
      interview_metadata: request.interview_metadata,
    };
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(feedback), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    await expect(callAgent3(request)).resolves.toEqual(feedback);
    expect(fetchMock.mock.calls[0][0]).toBe('http://localhost:8080/api/evaluator');
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual(request);
  });

  it('rejects an empty conversation before invoking the Lambda', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    const request = buildAgent3Request(stateWith(0));

    await expect(callAgent3(request)).rejects.toThrow('At least one completed');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects an evaluator error body even when an intermediary returns 200', async () => {
    const request = buildAgent3Request(stateWith(1));
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ error: 'EvaluationError', message: 'Model failed' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    await expect(callAgent3(request)).rejects.toThrow('Evaluation failed: Model failed');
  });

  it('rejects a malformed successful evaluator response', async () => {
    const request = buildAgent3Request(stateWith(1));
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('{}', {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    await expect(callAgent3(request)).rejects.toThrow('invalid response');
  });

  it('reports the HTTP status when a failed response is not JSON', async () => {
    const request = buildAgent3Request(stateWith(1));
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('Bad gateway', { status: 502, statusText: 'Bad Gateway' })
    );

    await expect(callAgent3(request)).rejects.toThrow('Evaluation failed: Bad Gateway');
  });
});
