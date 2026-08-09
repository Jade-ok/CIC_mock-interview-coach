const LOCAL_API_BASE_URL = 'http://localhost:8080/api';
const LOCAL_VOICE_WS_URL = 'ws://localhost:8080/';

function cleanUrl(value: string | undefined): string | undefined {
  const cleaned = value?.trim();
  return cleaned || undefined;
}

// The Vite development server always uses the complete local backend. Hosted
// endpoints are selected only for a production build configured as hosted.
export const RUNTIME_MODE = !import.meta.env.DEV && import.meta.env.VITE_RUNTIME_MODE === 'hosted'
  ? 'hosted'
  : 'local';

function endpoint(override: string | undefined, path: string): string {
  if (RUNTIME_MODE === 'local') return `${LOCAL_API_BASE_URL}/${path}`;

  const hostedUrl = cleanUrl(override);
  if (!hostedUrl) {
    throw new Error(`Missing hosted API endpoint for ${path}`);
  }
  return hostedUrl;
}

export const API_ENDPOINTS = {
  pdfParser: endpoint(import.meta.env.VITE_PDF_PARSER_URL, 'pdf-parser'),
  analyst: endpoint(import.meta.env.VITE_ANALYST_URL, 'analyst'),
  interviewer: endpoint(import.meta.env.VITE_INTERVIEWER_URL, 'interviewer'),
  evaluator: endpoint(import.meta.env.VITE_EVALUATOR_URL, 'evaluator'),
} as const;

export async function getVoiceWebSocketUrl(): Promise<string> {
  if (RUNTIME_MODE === 'local') return LOCAL_VOICE_WS_URL;

  const sessionEndpoint = cleanUrl(import.meta.env.VITE_VOICE_SESSION_URL);
  if (!sessionEndpoint) {
    throw new Error('Missing hosted voice session endpoint');
  }

  const response = await fetch(sessionEndpoint, { method: 'POST' });
  const payload: unknown = await response.json().catch(() => null);
  const url = (
    payload
    && typeof payload === 'object'
    && 'url' in payload
    && typeof payload.url === 'string'
  ) ? payload.url : undefined;

  if (!response.ok || !url?.startsWith('wss://')) {
    throw new Error('Unable to create a secure voice session');
  }
  return url;
}
