import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Server, WebSocket as MockWebSocket } from 'mock-socket';
import fc from 'fast-check';
import {
  WebSocketClient,
  type WebSocketClientConfig,
  type NovaSonicOutputEvent,
} from '@/services/webSocketClient';

// Replace global WebSocket with mock-socket's implementation
vi.stubGlobal('WebSocket', MockWebSocket);

/** Small delay helper — mock-socket dispatches events via setTimeout(fn, 0) */
const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const flush = () => delay(50);

describe('WebSocketClient', () => {
  const TEST_URL = 'ws://localhost:8080';

  const testConfig: WebSocketClientConfig = {
    url: TEST_URL,
    maxReconnectAttempts: 2,
    reconnectDelayMs: [10, 20],
  };

  describe('connect/disconnect lifecycle', () => {
    let mockServer: Server;
    let client: WebSocketClient;

    beforeEach(() => {
      mockServer = new Server(TEST_URL);
      client = new WebSocketClient();
    });

    afterEach(() => {
      client.disconnect();
      mockServer.close();
    });

    it('should connect successfully and set state to connected', async () => {
      await client.connect(testConfig);
      expect(client.getState()).toBe('connected');
    });

    it('should start in disconnected state', () => {
      expect(client.getState()).toBe('disconnected');
    });

    it('should set state to disconnected after disconnect()', async () => {
      await client.connect(testConfig);
      client.disconnect();
      expect(client.getState()).toBe('disconnected');
    });
  });

  describe('sendSessionStart', () => {
    let mockServer: Server;
    let client: WebSocketClient;

    beforeEach(() => {
      client = new WebSocketClient();
    });

    afterEach(() => {
      client.disconnect();
      mockServer?.close();
    });

    it('should resolve when session_start_ack is received', async () => {
      mockServer = new Server(TEST_URL);
      mockServer.on('connection', (socket) => {
        socket.on('message', (data) => {
          const msg = JSON.parse(data as string);
          if (msg.type === 'session_start') {
            socket.send(
              JSON.stringify({
                type: 'session_start_ack',
                payload: { sessionId: 'test-session-123' },
              })
            );
          }
        });
      });

      await client.connect(testConfig);
      await expect(
        client.sendSessionStart('test-context', { maxTokens: 1024 })
      ).resolves.toBeUndefined();
    });

    it('should reject if connection is lost before ack', async () => {
      mockServer = new Server(TEST_URL);
      mockServer.on('connection', (socket) => {
        socket.on('message', () => {
          socket.close();
        });
      });

      await client.connect(testConfig);
      await expect(
        client.sendSessionStart('test-context', {})
      ).rejects.toThrow('Connection lost');
    });

    it('should reject if not connected', async () => {
      mockServer = new Server(TEST_URL);
      await expect(
        client.sendSessionStart('context', {})
      ).rejects.toThrow('WebSocket is not connected');
    });

    it('should send correct message format', async () => {
      const receivedMessages: unknown[] = [];
      mockServer = new Server(TEST_URL);
      mockServer.on('connection', (socket) => {
        socket.on('message', (data) => {
          receivedMessages.push(JSON.parse(data as string));
          socket.send(
            JSON.stringify({
              type: 'session_start_ack',
              payload: { sessionId: 'sid' },
            })
          );
        });
      });

      await client.connect(testConfig);
      await client.sendSessionStart('my-context', { maxTokens: 512 });

      expect(receivedMessages[0]).toEqual({
        type: 'session_start',
        payload: {
          novaSonicContext: 'my-context',
          inferenceConfig: { maxTokens: 512 },
        },
      });
    });
  });

  describe('sendAudioChunk', () => {
    let mockServer: Server;
    let client: WebSocketClient;

    beforeEach(() => {
      mockServer = new Server(TEST_URL);
      client = new WebSocketClient();
    });

    afterEach(() => {
      client.disconnect();
      mockServer.close();
    });

    it('should send audio_chunk with correct format', async () => {
      const receivedMessages: unknown[] = [];
      mockServer.on('connection', (socket) => {
        socket.on('message', (data) => {
          receivedMessages.push(JSON.parse(data as string));
        });
      });

      await client.connect(testConfig);
      client.sendAudioChunk('base64data', 'prompt1', 'content1');
      await flush();

      expect(receivedMessages[0]).toEqual({
        type: 'audio_chunk',
        payload: {
          content: 'base64data',
          promptName: 'prompt1',
          contentName: 'content1',
        },
      });
    });
  });

  describe('sendTextInput', () => {
    let mockServer: Server;
    let client: WebSocketClient;

    beforeEach(() => {
      mockServer = new Server(TEST_URL);
      client = new WebSocketClient();
    });

    afterEach(() => {
      client.disconnect();
      mockServer.close();
    });

    it('should send text_input with correct format', async () => {
      const receivedMessages: unknown[] = [];
      mockServer.on('connection', (socket) => {
        socket.on('message', (data) => {
          receivedMessages.push(JSON.parse(data as string));
        });
      });

      await client.connect(testConfig);
      client.sendTextInput('Hello world', 'prompt1', 'content1');
      await flush();

      expect(receivedMessages[0]).toEqual({
        type: 'text_input',
        payload: {
          content: 'Hello world',
          promptName: 'prompt1',
          contentName: 'content1',
        },
      });
    });
  });

  describe('session_invalid handling', () => {
    let mockServer: Server;
    let client: WebSocketClient;

    beforeEach(() => {
      client = new WebSocketClient();
    });

    afterEach(() => {
      client.disconnect();
      mockServer?.close();
    });

    it('should call onSessionInvalid when session_invalid is received', async () => {
      const onSessionInvalid = vi.fn();

      mockServer = new Server(TEST_URL);
      mockServer.on('connection', (socket) => {
        setTimeout(() => {
          socket.send(
            JSON.stringify({
              type: 'session_invalid',
              payload: { reason: 'Session expired' },
            })
          );
        }, 20);
      });

      client.onSessionInvalid = onSessionInvalid;
      await client.connect(testConfig);
      await delay(80);

      expect(onSessionInvalid).toHaveBeenCalledTimes(1);
    });

    it('should also forward session_invalid to onMessage', async () => {
      const onMessage = vi.fn();

      mockServer = new Server(TEST_URL);
      mockServer.on('connection', (socket) => {
        setTimeout(() => {
          socket.send(
            JSON.stringify({
              type: 'session_invalid',
              payload: { reason: 'expired' },
            })
          );
        }, 20);
      });

      client.onMessage = onMessage;
      await client.connect(testConfig);
      await delay(80);

      expect(onMessage).toHaveBeenCalledWith({
        type: 'session_invalid',
        payload: { reason: 'expired' },
      });
    });
  });

  describe('message forwarding', () => {
    let mockServer: Server;
    let client: WebSocketClient;

    beforeEach(() => {
      mockServer = new Server(TEST_URL);
      client = new WebSocketClient();
    });

    afterEach(() => {
      client.disconnect();
      mockServer.close();
    });

    it('should forward all output events to onMessage', async () => {
      const messages: NovaSonicOutputEvent[] = [];
      client.onMessage = (event) => messages.push(event);

      const testEvents: NovaSonicOutputEvent[] = [
        { type: 'audio_output', payload: { content: 'abc', contentId: 'c1' } },
        {
          type: 'text_output',
          payload: {
            content: 'Hello',
            role: 'interviewer',
            generationStage: 'FINAL',
          },
        },
        {
          type: 'tool_use',
          payload: {
            toolName: 'end_interview',
            toolUseId: 'tu1',
            content: '{}',
          },
        },
        {
          type: 'content_end',
          payload: { contentId: 'c1', stopReason: 'done' },
        },
        {
          type: 'completion_end',
          payload: { completionId: 'comp1', stopReason: 'done' },
        },
        { type: 'interrupted', payload: { contentId: 'c1' } },
      ];

      mockServer.on('connection', (socket) => {
        testEvents.forEach((event, i) => {
          setTimeout(() => {
            socket.send(JSON.stringify(event));
          }, (i + 1) * 10);
        });
      });

      await client.connect(testConfig);
      // Wait enough time for all events to be sent (6 events * 10ms + buffer)
      await delay(150);

      expect(messages).toHaveLength(testEvents.length);
      expect(messages).toEqual(testEvents);
    });
  });

  describe('reconnection logic', () => {
    let mockServer: Server;
    let client: WebSocketClient;

    // Use longer delays so we can observe intermediate states
    const reconnectConfig: WebSocketClientConfig = {
      url: TEST_URL,
      maxReconnectAttempts: 2,
      reconnectDelayMs: [200, 400],
    };

    beforeEach(() => {
      mockServer = new Server(TEST_URL);
      client = new WebSocketClient();
    });

    afterEach(() => {
      client.disconnect();
      mockServer.close();
    });

    it('should attempt reconnection with exponential backoff delays', async () => {
      const onReconnectAttempt = vi.fn();
      const onReconnectFailed = vi.fn();
      client.onReconnectAttempt = onReconnectAttempt;
      client.onReconnectFailed = onReconnectFailed;

      await client.connect(reconnectConfig);
      expect(client.getState()).toBe('connected');

      // Close the server to simulate disconnect
      mockServer.close();
      // Wait just enough for mock-socket to fire the close event
      await flush();

      // State should be reconnecting and first attempt scheduled
      expect(client.getState()).toBe('reconnecting');
      expect(onReconnectAttempt).toHaveBeenCalledWith(1);

      // Wait for all reconnect delays to complete (200ms + 400ms + buffer)
      await delay(800);

      // Both attempts failed, max reached
      expect(onReconnectAttempt).toHaveBeenCalledWith(2);
      expect(onReconnectFailed).toHaveBeenCalledTimes(1);
      expect(client.getState()).toBe('disconnected');
    });

    it('should succeed on reconnection when server becomes available', async () => {
      const onReconnectSuccess = vi.fn();
      const onReconnectAttempt = vi.fn();
      client.onReconnectSuccess = onReconnectSuccess;
      client.onReconnectAttempt = onReconnectAttempt;

      await client.connect(reconnectConfig);

      // Close the server
      mockServer.close();
      await flush();

      expect(client.getState()).toBe('reconnecting');

      // Start a new server before the reconnection timer fires
      const newServer = new Server(TEST_URL);

      // Wait for reconnection to succeed (200ms delay + some buffer)
      await delay(300);

      expect(onReconnectSuccess).toHaveBeenCalledTimes(1);
      expect(client.getState()).toBe('connected');

      client.disconnect();
      newServer.close();
    });

    it('should call onDisconnect when connection drops', async () => {
      const onDisconnect = vi.fn();
      client.onDisconnect = onDisconnect;

      await client.connect(reconnectConfig);
      mockServer.close();
      await flush();

      expect(onDisconnect).toHaveBeenCalled();
    });

    it('should not attempt reconnection after intentional disconnect', async () => {
      const onReconnectAttempt = vi.fn();
      client.onReconnectAttempt = onReconnectAttempt;

      await client.connect(reconnectConfig);
      client.disconnect();

      await delay(500);
      expect(onReconnectAttempt).not.toHaveBeenCalled();
    });

    it('should reset reconnect counter on successful reconnection', async () => {
      const onReconnectAttempt = vi.fn();
      client.onReconnectAttempt = onReconnectAttempt;

      await client.connect(reconnectConfig);

      // First disconnect
      mockServer.close();
      await flush();

      // Start new server for reconnection
      const newServer = new Server(TEST_URL);
      // Wait for reconnection to succeed (200ms delay + buffer)
      await delay(300);

      expect(client.getState()).toBe('connected');
      expect(onReconnectAttempt).toHaveBeenCalledTimes(1);

      // Second disconnect — counter should be reset
      newServer.close();
      await flush();

      // Should start fresh sequence (attempt 1 again)
      expect(onReconnectAttempt).toHaveBeenCalledTimes(2);
      expect(onReconnectAttempt).toHaveBeenLastCalledWith(1);

      client.disconnect();
    });
  });

  describe('Property 7: WebSocket 재연결 제한 (PBT)', () => {
    /**
     * **Validates: Requirements 3.14**
     * Feature: frontend-interview, Property 7: WebSocket 재연결 제한
     *
     * For any WebSocket disconnect scenario, automatic reconnection attempts
     * must never exceed 2.
     */
    let portCounter = 9000;

    it('should never exceed maxReconnectAttempts for any number of disconnect cycles', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Number of independent disconnect→reconnect-fail cycles to simulate
          fc.integer({ min: 1, max: 5 }),
          async (cycles) => {
            const port = portCounter++;
            const url = `ws://localhost:${port}`;
            let server = new Server(url);
            const localClient = new WebSocketClient();
            let maxSequenceAttempts = 0;
            let currentSequenceAttempts = 0;

            localClient.onReconnectAttempt = () => {
              currentSequenceAttempts++;
              if (currentSequenceAttempts > maxSequenceAttempts) {
                maxSequenceAttempts = currentSequenceAttempts;
              }
            };

            localClient.onReconnectFailed = () => {
              currentSequenceAttempts = 0;
            };

            localClient.onReconnectSuccess = () => {
              currentSequenceAttempts = 0;
            };

            const localConfig: WebSocketClientConfig = {
              url,
              maxReconnectAttempts: 2,
              reconnectDelayMs: [5, 10],
            };

            try {
              for (let i = 0; i < cycles; i++) {
                await localClient.connect(localConfig);

                // Close server to trigger disconnect
                server.close();
                await delay(100); // Wait for reconnection attempts to complete

                // After failure, disconnect and set up for next cycle
                localClient.disconnect();
                server = new Server(url);
                await delay(10);
              }

              // PROPERTY: reconnection attempts per sequence never exceeds 2
              expect(maxSequenceAttempts).toBeLessThanOrEqual(2);
            } finally {
              localClient.disconnect();
              server.close();
            }
          }
        ),
        { numRuns: 100 }
      );
    }, 60000);

    it('should cap reconnection attempts at configured max regardless of timing', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Random maxReconnectAttempts configuration
          fc.integer({ min: 1, max: 5 }),
          async (maxAttempts) => {
            const port = portCounter++;
            const url = `ws://localhost:${port}`;
            const server = new Server(url);
            const localClient = new WebSocketClient();
            let reconnectAttemptCount = 0;

            localClient.onReconnectAttempt = () => {
              reconnectAttemptCount++;
            };

            const delays = Array.from(
              { length: maxAttempts },
              () => 5
            );

            const localConfig: WebSocketClientConfig = {
              url,
              maxReconnectAttempts: maxAttempts,
              reconnectDelayMs: delays,
            };

            try {
              await localClient.connect(localConfig);

              // Trigger disconnect
              server.close();

              // Wait for all reconnection attempts to play out
              await delay(maxAttempts * 50 + 100);

              // PROPERTY: attempts should never exceed configured max
              expect(reconnectAttemptCount).toBeLessThanOrEqual(maxAttempts);
            } finally {
              localClient.disconnect();
              server.close();
            }
          }
        ),
        { numRuns: 100 }
      );
    }, 60000);
  });
});
