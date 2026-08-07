import { afterEach, describe, expect, it, vi } from 'vitest';
import { callAgent1 } from '@/services/agent1Client';

describe('callAgent1', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('runs all three Function URLs and retains the complete Analyst output', async () => {
    const analystOutput = {
      candidate_profile: { candidate_level: 'new_grad' },
      target_role: { title: 'Software Engineer' },
      interview_plan: [
        {
          topic: 'Ownership',
          priority: 1,
          question_type: 'behavioral',
          target_skill: 'Communication',
          source_experience_id: 'exp_1',
        },
      ],
    };
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({
        status: 'success',
        data: { resume_text: 'resume', job_posting_text: 'job' },
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        status: 'success',
        data: analystOutput,
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        success: true,
        runtime_context: 'runtime context',
      }), { status: 200 }));

    const abortController = new AbortController();
    const result = await callAgent1({
      pdf: new File(['resume'], 'resume.pdf', { type: 'application/pdf' }),
      jdText: 'job description',
    }, abortController.signal);

    expect(fetchMock).toHaveBeenCalledTimes(3);
    for (const [, options] of fetchMock.mock.calls) {
      expect(options?.signal).toBe(abortController.signal);
    }
    expect(result.analyst_output).toEqual(analystOutput);
    expect(result.nova_sonic_context).toBe('runtime context');
    expect(result.competency_guides[0]).toMatchObject({
      title: 'Communication',
      description: 'Ownership',
    });
  });

  it('reports the Interviewer Function URL error envelope', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({
        status: 'success',
        data: { resume_text: 'resume', job_posting_text: 'job' },
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        status: 'success',
        data: { interview_plan: [] },
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        success: false,
        error_message: 'Configuration unavailable',
      }), { status: 200 }));

    await expect(callAgent1({
      pdf: new File(['resume'], 'resume.pdf', { type: 'application/pdf' }),
      jdText: 'job description',
    })).rejects.toThrow('Configuration unavailable');
  });
});
