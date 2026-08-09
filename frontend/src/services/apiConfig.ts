const LOCAL_API_BASE_URL = 'http://localhost:8080/api';
const LOCAL_VOICE_WS_URL = 'ws://localhost:8080/';

function cleanUrl(value: string | undefined): string | undefined {
  const cleaned = value?.trim();
  return cleaned || undefined;
}

function hostedEndpoint(path: string): string {
  const baseUrl = cleanUrl(import.meta.env.VITE_API_BASE_URL)?.replace(/\/$/, '');
  if (!baseUrl) throw new Error('Missing hosted API base URL');
  return `${baseUrl}/${path}`;
}

// Local is the default for development. Developers without AWS credentials can
// explicitly select hosted endpoints in an ignored .env.local file.
export const RUNTIME_MODE = import.meta.env.VITE_RUNTIME_MODE === 'hosted'
  ? 'hosted'
  : 'local';

function endpoint(path: string): string {
  if (RUNTIME_MODE === 'local') return `${LOCAL_API_BASE_URL}/${path}`;
  return hostedEndpoint(path);
}

export const API_ENDPOINTS = {
  session: endpoint('session'),
  pdfParser: endpoint('pdf-parser'),
  analyst: endpoint('analyst'),
  interviewer: endpoint('interviewer'),
  evaluator: endpoint('evaluator'),
} as const;

export class VoiceSessionError extends Error {
  retryable: boolean;

  constructor(message: string, retryable: boolean) {
    super(message);
    this.name = 'VoiceSessionError';
    this.retryable = retryable;
  }
}

/** Build a JSON POST request. Hosted CloudFront OAC POSTs require a SHA-256
 * payload hash so CloudFront can sign the private Function URL request. */
export async function jsonPostInit(
  payload: unknown,
  signal?: AbortSignal
): Promise<RequestInit> {
  const body = JSON.stringify(payload);
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };

  if (RUNTIME_MODE === 'hosted') {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(body));
    headers['x-amz-content-sha256'] = Array.from(new Uint8Array(digest))
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join('');
  }

  return { method: 'POST', headers, body, signal };
}

export async function getVoiceWebSocketUrl(sessionToken: string): Promise<string> {
  if (RUNTIME_MODE === 'local') return LOCAL_VOICE_WS_URL;

  const response = await fetch(
    hostedEndpoint('voice-session'),
    await jsonPostInit({ session_token: sessionToken })
  );
  const payload: unknown = await response.json().catch(() => null);
  const record = payload && typeof payload === 'object'
    ? payload as Record<string, unknown>
    : null;
  const url = (
    record
    && typeof record.url === 'string'
  ) ? record.url : undefined;

  if (!response.ok || !url?.startsWith('wss://')) {
    const message = typeof record?.error === 'string'
      ? record.error
      : 'Unable to create a secure voice session';
    throw new VoiceSessionError(message, response.status >= 500);
  }
  return url;
}
