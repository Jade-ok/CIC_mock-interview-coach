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

export const VOICE_WS_URL = RUNTIME_MODE === 'local'
  ? LOCAL_VOICE_WS_URL
  : cleanUrl(import.meta.env.VITE_VOICE_WS_URL) || (() => {
      throw new Error('Missing hosted voice WebSocket endpoint');
    })();
