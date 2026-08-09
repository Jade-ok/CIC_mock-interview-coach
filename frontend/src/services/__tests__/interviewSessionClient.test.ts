import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createInterviewSession,
  InterviewAdmissionError,
} from '@/services/interviewSessionClient';

describe('createInterviewSession', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns the opaque token from the local session route', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ session_token: 'local-development' }), { status: 200 })
    );

    await expect(createInterviewSession()).resolves.toBe('local-development');
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:8080/api/session',
      expect.objectContaining({ method: 'POST', body: '{}' })
    );
  });

  it('makes daily-limit responses non-retryable', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({
        error: 'The demo has reached its interview limit for today.',
        code: 'DAILY_INTERVIEW_LIMIT_REACHED',
      }), { status: 429 })
    );

    const promise = createInterviewSession();
    await expect(promise).rejects.toThrow('reached its interview limit');
    await promise.catch((error: unknown) => {
      expect(error).toBeInstanceOf(InterviewAdmissionError);
      expect((error as InterviewAdmissionError).retryable).toBe(false);
    });
  });

  it('allows retrying temporary server errors', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ error: 'Temporarily unavailable.' }), { status: 503 })
    );

    await createInterviewSession().catch((error: unknown) => {
      expect(error).toBeInstanceOf(InterviewAdmissionError);
      expect((error as InterviewAdmissionError).retryable).toBe(true);
    });
  });
});
