/**
 * WebSocketClient service for communicating with the WebSocket Server.
 * Handles connection lifecycle, reconnection with exponential backoff,
 * and Nova Sonic protocol messaging.
 */

export type WebSocketConnectionState =
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'disconnected';

export interface WebSocketClientConfig {
  url: string;
  maxReconnectAttempts: number;
  reconnectDelayMs: number[];
}

/** Input events: Frontend → WebSocket Server */
export type WebSocketInputEvent =
  | {
      type: 'session_start';
      payload: { novaSonicContext: string; inferenceConfig: object };
    }
  | {
      type: 'audio_chunk';
      payload: { content: string; promptName: string; contentName: string };
    }
  | {
      type: 'text_input';
      payload: { content: string; promptName: string; contentName: string };
    }
  | { type: 'session_end'; payload: { promptName: string } };

/** Output events: WebSocket Server → Frontend */
export type NovaSonicOutputEvent =
  | { type: 'session_start_ack'; payload: { sessionId: string } }
  | { type: 'audio_output'; payload: { content: string; contentId: string } }
  | {
      type: 'text_output';
      payload: {
        content: string;
        role: 'interviewer' | 'user';
        generationStage: 'PARTIAL' | 'FINAL';
      };
    }
  | {
      type: 'tool_use';
      payload: { toolName: string; toolUseId: string; content: string };
    }
  | {
      type: 'content_end';
      payload: { contentId: string; stopReason: string };
    }
  | {
      type: 'completion_end';
      payload: { completionId: string; stopReason: string };
    }
  | { type: 'interrupted'; payload: { contentId: string } }
  | { type: 'session_invalid'; payload: { reason: string } };

export type WebSocketMessage = WebSocketInputEvent;

const DEFAULT_CONFIG: WebSocketClientConfig = {
  url: '',
  maxReconnectAttempts: 2,
  reconnectDelayMs: [1000, 2000],
};

export class WebSocketClient {
  private ws: WebSocket | null = null;
  private config: WebSocketClientConfig = DEFAULT_CONFIG;
  private state: WebSocketConnectionState = 'disconnected';
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private sessionStartResolve: (() => void) | null = null;
  private sessionStartReject: ((reason: Error) => void) | null = null;

  // Event callbacks
  onMessage: (event: NovaSonicOutputEvent) => void = () => {};
  onDisconnect: (reason: string) => void = () => {};
  onReconnectAttempt: (attempt: number) => void = () => {};
  onReconnectSuccess: () => void = () => {};
  onReconnectFailed: () => void = () => {};
  onSessionInvalid: () => void = () => {};

  connect(config: WebSocketClientConfig): Promise<void> {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.reconnectAttempts = 0;
    return this.createConnection();
  }

  disconnect(): void {
    this.clearReconnectTimer();
    this.state = 'disconnected';
    this.rejectPendingSessionStart('Connection closed');
    if (this.ws) {
      this.ws.onclose = null; // Prevent reconnection on intentional disconnect
      this.ws.onerror = null;
      this.ws.onmessage = null;
      this.ws.onopen = null;
      this.ws.close();
      this.ws = null;
    }
  }

  getState(): WebSocketConnectionState {
    return this.state;
  }

  send(message: WebSocketMessage): void {
    if (this.ws && this.state === 'connected') {
      this.ws.send(JSON.stringify(message));
    }
  }

  sendSessionStart(
    novaSonicContext: string,
    inferenceConfig: object
  ): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      if (this.state !== 'connected' || !this.ws) {
        reject(new Error('WebSocket is not connected'));
        return;
      }

      this.sessionStartResolve = resolve;
      this.sessionStartReject = reject;

      const message: WebSocketInputEvent = {
        type: 'session_start',
        payload: { novaSonicContext, inferenceConfig },
      };

      this.ws.send(JSON.stringify(message));
    });
  }

  sendAudioChunk(
    pcmBase64: string,
    promptName: string,
    contentName: string
  ): void {
    const message: WebSocketInputEvent = {
      type: 'audio_chunk',
      payload: { content: pcmBase64, promptName, contentName },
    };
    this.send(message);
  }

  sendTextInput(text: string, promptName: string, contentName: string): void {
    const message: WebSocketInputEvent = {
      type: 'text_input',
      payload: { content: text, promptName, contentName },
    };
    this.send(message);
  }

  private createConnection(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      this.state = 'connecting';

      try {
        this.ws = new WebSocket(this.config.url);
      } catch (err) {
        this.state = 'disconnected';
        reject(err);
        return;
      }

      this.ws.onopen = () => {
        this.state = 'connected';
        this.reconnectAttempts = 0;
        resolve();
      };

      this.ws.onclose = (event) => {
        this.handleDisconnect(event.reason || 'Connection closed');
      };

      this.ws.onerror = () => {
        if (this.state === 'connecting') {
          this.state = 'disconnected';
          reject(new Error('WebSocket connection failed'));
        }
      };

      this.ws.onmessage = (event) => {
        this.handleMessage(event.data as string);
      };
    });
  }

  private handleMessage(data: string): void {
    let parsed: NovaSonicOutputEvent;
    try {
      parsed = JSON.parse(data) as NovaSonicOutputEvent;
    } catch {
      return; // Ignore malformed messages
    }

    // Handle session_start_ack — resolve pending sendSessionStart promise
    if (parsed.type === 'session_start_ack') {
      if (this.sessionStartResolve) {
        this.sessionStartResolve();
        this.sessionStartResolve = null;
        this.sessionStartReject = null;
      }
    }

    // Handle session_invalid
    if (parsed.type === 'session_invalid') {
      this.onSessionInvalid();
    }

    // Forward to general message handler
    this.onMessage(parsed);
  }

  private handleDisconnect(reason: string): void {
    const wasConnected = this.state === 'connected';
    this.rejectPendingSessionStart('Connection lost');

    if (wasConnected || this.state === 'reconnecting') {
      this.onDisconnect(reason);
      this.attemptReconnect();
    } else if (this.state === 'connecting') {
      this.state = 'disconnected';
    }
  }

  private attemptReconnect(): void {
    if (this.reconnectAttempts >= this.config.maxReconnectAttempts) {
      this.state = 'disconnected';
      this.onReconnectFailed();
      return;
    }

    this.state = 'reconnecting';
    const delay = this.config.reconnectDelayMs[this.reconnectAttempts] ?? 2000;
    this.reconnectAttempts++;

    this.onReconnectAttempt(this.reconnectAttempts);

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.doReconnect();
    }, delay);
  }

  private doReconnect(): void {
    this.state = 'connecting';

    try {
      this.ws = new WebSocket(this.config.url);
    } catch {
      this.handleReconnectFailure();
      return;
    }

    this.ws.onopen = () => {
      this.state = 'connected';
      this.reconnectAttempts = 0;
      this.onReconnectSuccess();
    };

    this.ws.onclose = (event) => {
      if (this.state === 'connecting') {
        // Reconnection attempt failed
        this.handleReconnectFailure();
      } else {
        this.handleDisconnect(event.reason || 'Connection closed');
      }
    };

    this.ws.onerror = () => {
      // onclose will be called after onerror, handle there
    };

    this.ws.onmessage = (event) => {
      this.handleMessage(event.data as string);
    };
  }

  private handleReconnectFailure(): void {
    if (this.reconnectAttempts >= this.config.maxReconnectAttempts) {
      this.state = 'disconnected';
      this.onReconnectFailed();
    } else {
      this.attemptReconnect();
    }
  }

  private rejectPendingSessionStart(reason: string): void {
    if (this.sessionStartReject) {
      this.sessionStartReject(new Error(reason));
      this.sessionStartResolve = null;
      this.sessionStartReject = null;
    }
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }
}
