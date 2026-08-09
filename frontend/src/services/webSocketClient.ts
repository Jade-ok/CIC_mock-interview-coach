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
  url?: string;
  urlProvider?: () => string | Promise<string>;
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
  maxReconnectAttempts: 2,
  reconnectDelayMs: [1000, 2000],
};

export class WebSocketClient {
  private ws: WebSocket | null = null;
  private config: WebSocketClientConfig = DEFAULT_CONFIG;
  private state: WebSocketConnectionState = 'disconnected';
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private connectionGeneration = 0;
  private connectResolve: (() => void) | null = null;
  private connectReject: ((reason: Error) => void) | null = null;
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
    const generation = ++this.connectionGeneration;
    this.clearReconnectTimer();
    this.rejectPendingConnect('Connection replaced');
    this.rejectPendingSessionStart('Connection replaced');
    this.closeCurrentSocket();
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.reconnectAttempts = 0;
    return this.createConnection(generation);
  }

  disconnect(): void {
    this.connectionGeneration += 1;
    this.clearReconnectTimer();
    this.state = 'disconnected';
    this.rejectPendingConnect('Connection closed');
    this.rejectPendingSessionStart('Connection closed');
    this.closeCurrentSocket();
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

  private async createConnection(generation: number): Promise<void> {
    this.state = 'connecting';
    let url: string;
    try {
      url = await this.resolveConnectionUrl();
    } catch (error) {
      if (generation === this.connectionGeneration) {
        this.state = 'disconnected';
      }
      throw error;
    }
    if (generation !== this.connectionGeneration) {
      throw new Error('Connection replaced');
    }

    return new Promise<void>((resolve, reject) => {
      this.connectResolve = resolve;
      this.connectReject = reject;
      let socket: WebSocket;
      try {
        socket = new WebSocket(url);
        this.ws = socket;
      } catch (err) {
        this.state = 'disconnected';
        this.rejectPendingConnect(
          err instanceof Error ? err.message : 'WebSocket connection failed'
        );
        return;
      }

      socket.onopen = () => {
        if (this.ws !== socket) return;
        this.state = 'connected';
        this.reconnectAttempts = 0;
        this.resolvePendingConnect();
      };

      socket.onclose = (event) => {
        if (this.ws !== socket) return;
        this.handleDisconnect(event.reason || 'Connection closed');
      };

      socket.onerror = () => {
        if (this.ws !== socket) return;
        if (this.state === 'connecting') {
          this.state = 'disconnected';
          this.rejectPendingConnect('WebSocket connection failed');
        }
      };

      socket.onmessage = (event) => {
        if (this.ws !== socket) return;
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
      this.rejectPendingConnect(reason);
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
      void this.doReconnect();
    }, delay);
  }

  private async doReconnect(): Promise<void> {
    const generation = this.connectionGeneration;
    this.state = 'connecting';

    try {
      const url = await this.resolveConnectionUrl();
      if (
        generation !== this.connectionGeneration
        || this.state !== 'connecting'
      ) return;

      const socket = new WebSocket(url);
      this.ws = socket;

      socket.onopen = () => {
        if (this.ws !== socket) return;
        this.state = 'connected';
        this.reconnectAttempts = 0;
        this.onReconnectSuccess();
      };

      socket.onclose = (event) => {
        if (this.ws !== socket) return;
        if (this.state === 'connecting') {
          this.handleReconnectFailure();
        } else {
          this.handleDisconnect(event.reason || 'Connection closed');
        }
      };

      socket.onerror = () => {
        // onclose will be called after onerror, handle there
      };

      socket.onmessage = (event) => {
        if (this.ws !== socket) return;
        this.handleMessage(event.data as string);
      };
    } catch {
      if (generation === this.connectionGeneration) {
        this.handleReconnectFailure();
      }
    }
  }

  private async resolveConnectionUrl(): Promise<string> {
    const url = this.config.urlProvider
      ? await this.config.urlProvider()
      : this.config.url;
    if (!url) throw new Error('WebSocket URL is unavailable');
    return url;
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

  private resolvePendingConnect(): void {
    this.connectResolve?.();
    this.connectResolve = null;
    this.connectReject = null;
  }

  private rejectPendingConnect(reason: string): void {
    this.connectReject?.(new Error(reason));
    this.connectResolve = null;
    this.connectReject = null;
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private closeCurrentSocket(): void {
    if (!this.ws) return;
    this.ws.onopen = null;
    this.ws.onclose = null;
    this.ws.onerror = null;
    this.ws.onmessage = null;
    this.ws.close();
    this.ws = null;
  }
}
