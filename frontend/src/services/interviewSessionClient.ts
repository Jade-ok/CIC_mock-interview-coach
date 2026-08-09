import { API_ENDPOINTS, jsonPostInit } from '@/services/apiConfig';

export class InterviewAdmissionError extends Error {
  retryable: boolean;

  constructor(message: string, retryable: boolean) {
    super(message);
    this.name = 'InterviewAdmissionError';
    this.retryable = retryable;
  }
}

export async function createInterviewSession(signal?: AbortSignal): Promise<string> {
  const response = await fetch(API_ENDPOINTS.session, await jsonPostInit({}, signal));
  const payload: unknown = await response.json().catch(() => null);
  const record = payload && typeof payload === 'object'
    ? payload as Record<string, unknown>
    : null;
  const token = typeof record?.session_token === 'string'
    ? record.session_token
    : undefined;

  if (!response.ok || !token) {
    const message = typeof record?.error === 'string'
      ? record.error
      : 'Unable to start an interview right now. Please try again.';
    throw new InterviewAdmissionError(message, response.status >= 500);
  }
  return token;
}
