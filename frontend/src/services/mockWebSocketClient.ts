/**
 * MockWebSocketClient — Dev-mode stub that simulates instant WebSocket
 * handshake and session_start acknowledgment.
 * Used when import.meta.env.DEV is true so the WaitingRoom can
 * transition to the Interview screen without a real backend.
 */

import type { WebSocketConnectionState, NovaSonicOutputEvent, WebSocketMessage } from './webSocketClient';

export class MockWebSocketClient {
  private state: WebSocketConnectionState = 'disconnected';

  // Event callbacks (same interface as real client)
  onMessage: (event: NovaSonicOutputEvent) => void = () => {};
  onDisconnect: (_reason: string) => void = () => {};
  onReconnectAttempt: (_attempt: number) => void = () => {};
  onReconnectSuccess: () => void = () => {};
  onReconnectFailed: () => void = () => {};
  onSessionInvalid: () => void = () => {};

  async connect(_config: { url: string; maxReconnectAttempts: number; reconnectDelayMs: number[] }): Promise<void> {
    // Simulate instant successful connection
    await new Promise((resolve) => setTimeout(resolve, 200));
    this.state = 'connected';
  }

  disconnect(): void {
    this.state = 'disconnected';
  }

  getState(): WebSocketConnectionState {
    return this.state;
  }

  send(_message: WebSocketMessage): void {
    // No-op in mock
  }

  async sendSessionStart(_novaSonicContext: string, _inferenceConfig: object): Promise<void> {
    // Simulate instant session_start acknowledgment
    await new Promise((resolve) => setTimeout(resolve, 100));
    // Fire session_start_ack via onMessage callback
    this.onMessage({
      type: 'session_start_ack',
      payload: { sessionId: 'mock-session-001' },
    });
  }

  sendAudioChunk(_pcmBase64: string, _promptName: string, _contentName: string): void {
    // No-op in mock
  }

  sendTextInput(_text: string, _promptName: string, _contentName: string): void {
    // No-op in mock
  }
}
