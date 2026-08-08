import { describe, expect, it } from 'vitest';
import { API_ENDPOINTS, RUNTIME_MODE, VOICE_WS_URL } from '../apiConfig';

describe('local runtime configuration', () => {
  it('uses the combined local backend during Vite development', () => {
    expect(RUNTIME_MODE).toBe('local');
    expect(API_ENDPOINTS).toEqual({
      pdfParser: 'http://localhost:8080/api/pdf-parser',
      analyst: 'http://localhost:8080/api/analyst',
      interviewer: 'http://localhost:8080/api/interviewer',
      evaluator: 'http://localhost:8080/api/evaluator',
    });
    expect(VOICE_WS_URL).toBe('ws://localhost:8080/');
  });
});
