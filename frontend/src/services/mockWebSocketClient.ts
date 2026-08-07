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

    // After a short delay, simulate the AI interviewer's opening question
    // framed as resume-analysis-based
    setTimeout(() => {
      this.onMessage({
        type: 'text_output',
        payload: {
          role: 'interviewer',
          content:
            "I noticed you led a microservices migration on your resume — can you walk me through a particularly challenging architectural decision you made during that project, and how you got buy-in from your team?",
          generationStage: 'FINAL',
        },
      });
      this.onMessage({ type: 'audio_output', payload: { content: '', contentId: 'mock-audio-001' } });
    }, 2500);
  }

  /** Pre-defined resume-framed follow-up questions for demo */
  private mockQuestions: string[] = [
    "I see you mentioned mentoring 3 junior engineers — can you tell me about a time when one of them struggled, and how you handled it?",
    "Your resume highlights algorithm competition awards — let's try a problem: how would you design an efficient caching strategy for a high-traffic API?",
    "I noticed cross-functional collaboration is listed as a key strength — describe a situation where you had to align conflicting priorities between teams.",
  ];
  private questionIndex = 0;

  /** Simulate AI follow-up when user sends text */

  sendAudioChunk(_pcmBase64: string, _promptName: string, _contentName: string): void {
    // No-op in mock
  }

  sendTextInput(_text: string, _promptName: string, _contentName: string): void {
    // Simulate AI processing and responding with the next resume-framed question
    setTimeout(() => {
      if (this.questionIndex < this.mockQuestions.length) {
        const question = this.mockQuestions[this.questionIndex];
        this.questionIndex++;
        this.onMessage({
          type: 'text_output',
          payload: {
            role: 'interviewer',
            content: question,
            generationStage: 'FINAL',
          },
        });
        this.onMessage({ type: 'audio_output', payload: { content: '', contentId: `mock-audio-${this.questionIndex}` } });
      }
    }, 1500);
  }
}
