import { afterEach, describe, expect, it, vi } from 'vitest';
import { API_ENDPOINTS, getVoiceWebSocketUrl, RUNTIME_MODE } from '../apiConfig';

describe('local runtime configuration', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('uses the combined local backend during Vite development', () => {
    expect(RUNTIME_MODE).toBe('local');
    expect(API_ENDPOINTS).toEqual({
      session: 'http://localhost:8080/api/session',
      pdfParser: 'http://localhost:8080/api/pdf-parser',
      analyst: 'http://localhost:8080/api/analyst',
      interviewer: 'http://localhost:8080/api/interviewer',
      evaluator: 'http://localhost:8080/api/evaluator',
    });
  });

  it('uses the local voice relay during Vite development', async () => {
    await expect(getVoiceWebSocketUrl('local-development')).resolves.toBe('ws://localhost:8080/');
  });

  it('keeps local JSON requests unsigned and independent of hosted configuration', async () => {
    vi.stubEnv('VITE_API_BASE_URL', 'https://should-not-be-used.example');
    vi.resetModules();
    const localConfig = await import('../apiConfig');

    const init = await localConfig.jsonPostInit({ local: true });
    expect(init.headers).toEqual({ 'Content-Type': 'application/json' });
    expect(localConfig.API_ENDPOINTS.analyst).toBe(
      'http://localhost:8080/api/analyst'
    );
  });

  it('allows an explicit hosted backend during local frontend development', async () => {
    vi.stubEnv('VITE_RUNTIME_MODE', 'hosted');
    vi.stubEnv('VITE_API_BASE_URL', 'https://example.test/');
    vi.resetModules();

    const hostedConfig = await import('../apiConfig');

    expect(hostedConfig.RUNTIME_MODE).toBe('hosted');
    expect(hostedConfig.API_ENDPOINTS).toEqual({
      session: 'https://example.test/session',
      pdfParser: 'https://example.test/pdf-parser',
      analyst: 'https://example.test/analyst',
      interviewer: 'https://example.test/interviewer',
      evaluator: 'https://example.test/evaluator',
    });

    const init = await hostedConfig.jsonPostInit({ hello: 'world' });
    expect(init.headers).toMatchObject({
      'Content-Type': 'application/json',
      'x-amz-content-sha256': expect.stringMatching(/^[a-f0-9]{64}$/),
    });

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ url: 'wss://voice.example.test/session' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(hostedConfig.getVoiceWebSocketUrl('test-session-token')).resolves.toBe(
      'wss://voice.example.test/session'
    );
    expect(fetchMock).toHaveBeenCalledWith(
      'https://example.test/voice-session',
      expect.objectContaining({
        method: 'POST',
        body: '{"session_token":"test-session-token"}',
        headers: expect.objectContaining({
          'x-amz-content-sha256': expect.stringMatching(/^[a-f0-9]{64}$/),
        }),
      })
    );
  });

  it('preserves non-retryable hosted voice-session errors', async () => {
    vi.stubEnv('VITE_RUNTIME_MODE', 'hosted');
    vi.stubEnv('VITE_API_BASE_URL', 'https://example.test');
    vi.resetModules();
    const hostedConfig = await import('../apiConfig');

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      json: async () => ({ error: 'This interview session has reached its voice-session limit.' }),
    }));

    await expect(hostedConfig.getVoiceWebSocketUrl('exhausted-token')).rejects.toMatchObject({
      name: 'VoiceSessionError',
      message: 'This interview session has reached its voice-session limit.',
      retryable: false,
    });
  });
});
