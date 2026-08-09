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
      pdfParser: 'http://localhost:8080/api/pdf-parser',
      analyst: 'http://localhost:8080/api/analyst',
      interviewer: 'http://localhost:8080/api/interviewer',
      evaluator: 'http://localhost:8080/api/evaluator',
    });
  });

  it('uses the local voice relay during Vite development', async () => {
    await expect(getVoiceWebSocketUrl()).resolves.toBe('ws://localhost:8080/');
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

    await expect(hostedConfig.getVoiceWebSocketUrl()).resolves.toBe(
      'wss://voice.example.test/session'
    );
    expect(fetchMock).toHaveBeenCalledWith(
      'https://example.test/voice-session',
      expect.objectContaining({
        method: 'POST',
        body: '{}',
        headers: expect.objectContaining({
          'x-amz-content-sha256':
            '44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a',
        }),
      })
    );
  });
});
