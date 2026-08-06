/**
 * Integration tests for useInterviewStreaming hook
 * Tests the audio streaming integration with mock WebSocket server.
 *
 * Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.9, 3.10
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useInterviewStreaming } from '../useInterviewStreaming';
import type { AudioManager } from '@/services/audioManager';
import type { WebSocketClient, NovaSonicOutputEvent } from '@/services/webSocketClient';

// --- Mock AudioManager factory ---
function createMockAudioManager(options?: { granted?: boolean }): AudioManager {
  const granted = options?.granted ?? true;

  return {
    initialize: vi.fn().mockResolvedValue({ granted }),
    destroy: vi.fn(),
    startCapture: vi.fn(),
    pauseCapture: vi.fn(),
    resumeCapture: vi.fn(),
    enqueueAudio: vi.fn(),
    stopPlayback: vi.fn(),
    isPlaying: vi.fn().mockReturnValue(false),
    waitForPlaybackEnd: vi.fn().mockResolvedValue(undefined),
    onAudioChunk: vi.fn(),
    onPlaybackEnd: vi.fn(),
  };
}

// --- Mock WebSocketClient ---
function createMockWsClient(): WebSocketClient {
  return {
    connect: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn(),
    getState: vi.fn().mockReturnValue('connected'),
    send: vi.fn(),
    sendSessionStart: vi.fn().mockResolvedValue(undefined),
    sendAudioChunk: vi.fn(),
    sendTextInput: vi.fn(),
    onMessage: vi.fn(),
    onDisconnect: vi.fn(),
    onReconnectAttempt: vi.fn(),
    onReconnectSuccess: vi.fn(),
    onReconnectFailed: vi.fn(),
    onSessionInvalid: vi.fn(),
  } as unknown as WebSocketClient;
}

describe('useInterviewStreaming', () => {
  let dispatch: ReturnType<typeof vi.fn>;
  let mockAm: AudioManager;
  let mockWs: WebSocketClient;

  beforeEach(() => {
    dispatch = vi.fn();
    mockAm = createMockAudioManager();
    mockWs = createMockWsClient();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Sub-task 1: 인터뷰 진입 시 AudioManager 초기화 + 캡처 시작', () => {
    it('should initialize AudioManager and start capture when phase is interview', async () => {
      const factory = vi.fn().mockReturnValue(mockAm);

      renderHook(() =>
        useInterviewStreaming({
          phase: 'interview',
          wsClient: mockWs,
          dispatch,
          audioManagerFactory: factory,
        })
      );

      // Wait for initialize promise to resolve
      await vi.waitFor(() => {
        expect(mockAm.initialize).toHaveBeenCalled();
      });

      await vi.waitFor(() => {
        expect(mockAm.startCapture).toHaveBeenCalled();
      });
    });

    it('should not initialize AudioManager when phase is not interview', () => {
      const factory = vi.fn().mockReturnValue(mockAm);

      renderHook(() =>
        useInterviewStreaming({
          phase: 'upload',
          wsClient: mockWs,
          dispatch,
          audioManagerFactory: factory,
        })
      );

      expect(factory).not.toHaveBeenCalled();
    });

    it('should send audio chunks via WebSocket when onAudioChunk fires', async () => {
      const factory = vi.fn().mockReturnValue(mockAm);

      renderHook(() =>
        useInterviewStreaming({
          phase: 'interview',
          wsClient: mockWs,
          dispatch,
          audioManagerFactory: factory,
        })
      );

      await vi.waitFor(() => {
        expect(mockAm.startCapture).toHaveBeenCalled();
      });

      // Simulate an audio chunk from the worklet
      const chunk = new Uint8Array([1, 2, 3, 4]).buffer;
      act(() => {
        mockAm.onAudioChunk(chunk);
      });

      expect(mockWs.sendAudioChunk).toHaveBeenCalledWith(
        expect.any(String), // base64 encoded
        'default',
        'audio-input'
      );
    });

    it('should destroy AudioManager on unmount', async () => {
      const factory = vi.fn().mockReturnValue(mockAm);

      const { unmount } = renderHook(() =>
        useInterviewStreaming({
          phase: 'interview',
          wsClient: mockWs,
          dispatch,
          audioManagerFactory: factory,
        })
      );

      await vi.waitFor(() => {
        expect(mockAm.startCapture).toHaveBeenCalled();
      });

      unmount();

      expect(mockAm.destroy).toHaveBeenCalled();
    });
  });

  describe('Sub-task 2: audio_output 수신 → enqueueAudio + AI_SPEAKING', () => {
    it('should enqueue audio and dispatch AI_SPEAKING on audio_output event', async () => {
      const factory = vi.fn().mockReturnValue(mockAm);

      renderHook(() =>
        useInterviewStreaming({
          phase: 'interview',
          wsClient: mockWs,
          dispatch,
          audioManagerFactory: factory,
        })
      );

      await vi.waitFor(() => {
        expect(mockAm.startCapture).toHaveBeenCalled();
      });

      // Simulate WS message
      const event: NovaSonicOutputEvent = {
        type: 'audio_output',
        payload: { content: 'dGVzdA==', contentId: 'content-1' },
      };

      act(() => {
        (mockWs as unknown as { onMessage: (e: NovaSonicOutputEvent) => void }).onMessage(event);
      });

      expect(mockAm.enqueueAudio).toHaveBeenCalledWith('dGVzdA==');
      expect(dispatch).toHaveBeenCalledWith({ type: 'AI_SPEAKING' });
    });
  });

  describe('Sub-task 3: interrupted 수신 → stopPlayback + BARGE_IN', () => {
    it('should stop playback and dispatch BARGE_IN on interrupted event', async () => {
      const factory = vi.fn().mockReturnValue(mockAm);

      renderHook(() =>
        useInterviewStreaming({
          phase: 'interview',
          wsClient: mockWs,
          dispatch,
          audioManagerFactory: factory,
        })
      );

      await vi.waitFor(() => {
        expect(mockAm.startCapture).toHaveBeenCalled();
      });

      const event: NovaSonicOutputEvent = {
        type: 'interrupted',
        payload: { contentId: 'content-1' },
      };

      act(() => {
        (mockWs as unknown as { onMessage: (e: NovaSonicOutputEvent) => void }).onMessage(event);
      });

      expect(mockAm.stopPlayback).toHaveBeenCalled();
      expect(dispatch).toHaveBeenCalledWith({ type: 'BARGE_IN' });
    });
  });

  describe('Sub-task 4: text_output 수신 → FINAL만 transcript 누적', () => {
    it('should dispatch APPEND_TRANSCRIPT for FINAL text_output events', async () => {
      const factory = vi.fn().mockReturnValue(mockAm);

      renderHook(() =>
        useInterviewStreaming({
          phase: 'interview',
          wsClient: mockWs,
          dispatch,
          audioManagerFactory: factory,
        })
      );

      await vi.waitFor(() => {
        expect(mockAm.startCapture).toHaveBeenCalled();
      });

      const event: NovaSonicOutputEvent = {
        type: 'text_output',
        payload: {
          content: 'Tell me about yourself.',
          role: 'interviewer',
          generationStage: 'FINAL',
        },
      };

      act(() => {
        (mockWs as unknown as { onMessage: (e: NovaSonicOutputEvent) => void }).onMessage(event);
      });

      expect(dispatch).toHaveBeenCalledWith({
        type: 'APPEND_TRANSCRIPT',
        payload: expect.objectContaining({
          role: 'interviewer',
          text: 'Tell me about yourself.',
          timestamp: expect.any(String),
        }),
      });
    });

    it('should NOT dispatch APPEND_TRANSCRIPT for PARTIAL text_output events', async () => {
      const factory = vi.fn().mockReturnValue(mockAm);

      renderHook(() =>
        useInterviewStreaming({
          phase: 'interview',
          wsClient: mockWs,
          dispatch,
          audioManagerFactory: factory,
        })
      );

      await vi.waitFor(() => {
        expect(mockAm.startCapture).toHaveBeenCalled();
      });

      const event: NovaSonicOutputEvent = {
        type: 'text_output',
        payload: {
          content: 'Tell me about...',
          role: 'interviewer',
          generationStage: 'PARTIAL',
        },
      };

      act(() => {
        (mockWs as unknown as { onMessage: (e: NovaSonicOutputEvent) => void }).onMessage(event);
      });

      expect(dispatch).not.toHaveBeenCalledWith(
        expect.objectContaining({ type: 'APPEND_TRANSCRIPT' })
      );
    });
  });

  describe('Sub-task 5: 마이크 권한 거부 → 텍스트 전용 모드', () => {
    it('should dispatch MIC_DENIED when AudioManager.initialize returns granted=false', async () => {
      const deniedAm = createMockAudioManager({ granted: false });
      const factory = vi.fn().mockReturnValue(deniedAm);

      renderHook(() =>
        useInterviewStreaming({
          phase: 'interview',
          wsClient: mockWs,
          dispatch,
          audioManagerFactory: factory,
        })
      );

      await vi.waitFor(() => {
        expect(deniedAm.initialize).toHaveBeenCalled();
      });

      await vi.waitFor(() => {
        expect(dispatch).toHaveBeenCalledWith({ type: 'MIC_DENIED' });
      });
    });

    it('should NOT call startCapture when mic is denied', async () => {
      const deniedAm = createMockAudioManager({ granted: false });
      const factory = vi.fn().mockReturnValue(deniedAm);

      renderHook(() =>
        useInterviewStreaming({
          phase: 'interview',
          wsClient: mockWs,
          dispatch,
          audioManagerFactory: factory,
        })
      );

      await vi.waitFor(() => {
        expect(dispatch).toHaveBeenCalledWith({ type: 'MIC_DENIED' });
      });

      expect(deniedAm.startCapture).not.toHaveBeenCalled();
    });

    it('should still handle audio_output events in text-only mode (Req 3.10)', async () => {
      // Even when mic denied, audio playback should work
      const deniedAm = createMockAudioManager({ granted: false });
      const factory = vi.fn().mockReturnValue(deniedAm);

      renderHook(() =>
        useInterviewStreaming({
          phase: 'interview',
          wsClient: mockWs,
          dispatch,
          audioManagerFactory: factory,
        })
      );

      await vi.waitFor(() => {
        expect(dispatch).toHaveBeenCalledWith({ type: 'MIC_DENIED' });
      });

      // Audio output should still be enqueued for playback
      const event: NovaSonicOutputEvent = {
        type: 'audio_output',
        payload: { content: 'dGVzdA==', contentId: 'content-1' },
      };

      act(() => {
        (mockWs as unknown as { onMessage: (e: NovaSonicOutputEvent) => void }).onMessage(event);
      });

      expect(deniedAm.enqueueAudio).toHaveBeenCalledWith('dGVzdA==');
    });
  });

  describe('session_invalid handling', () => {
    it('should dispatch WS_SESSION_INVALID on session_invalid event', async () => {
      const factory = vi.fn().mockReturnValue(mockAm);

      renderHook(() =>
        useInterviewStreaming({
          phase: 'interview',
          wsClient: mockWs,
          dispatch,
          audioManagerFactory: factory,
        })
      );

      await vi.waitFor(() => {
        expect(mockAm.startCapture).toHaveBeenCalled();
      });

      const event: NovaSonicOutputEvent = {
        type: 'session_invalid',
        payload: { reason: 'Session expired' },
      };

      act(() => {
        (mockWs as unknown as { onMessage: (e: NovaSonicOutputEvent) => void }).onMessage(event);
      });

      expect(dispatch).toHaveBeenCalledWith({ type: 'WS_SESSION_INVALID' });
    });
  });

  describe('USER_TURN dispatch on playback end', () => {
    it('should dispatch USER_TURN when onPlaybackEnd fires', async () => {
      const factory = vi.fn().mockReturnValue(mockAm);

      renderHook(() =>
        useInterviewStreaming({
          phase: 'interview',
          wsClient: mockWs,
          dispatch,
          audioManagerFactory: factory,
        })
      );

      await vi.waitFor(() => {
        expect(mockAm.startCapture).toHaveBeenCalled();
      });

      act(() => {
        mockAm.onPlaybackEnd();
      });

      expect(dispatch).toHaveBeenCalledWith({ type: 'USER_TURN' });
    });
  });
});
