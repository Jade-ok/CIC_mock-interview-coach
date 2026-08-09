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

  describe('Sub-task 1: initialize AudioManager and capture on interview entry', () => {
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

  describe('Sub-task 2: audio_output reception → enqueueAudio + AI_SPEAKING', () => {
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

  describe('Sub-task 3: interrupted reception → stopPlayback + BARGE_IN', () => {
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

  describe('Sub-task 4: text_output reception → store only FINAL transcript', () => {
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

  describe('Sub-task 5: microphone permission remediation', () => {
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

    it('should still handle audio_output events after microphone denial', async () => {
      // Incoming interviewer audio remains playable while the permission error is visible.
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
      expect(mockWs.disconnect).toHaveBeenCalled();
    });
  });

  describe('interview WebSocket lifecycle ownership', () => {
    it('dispatches disconnect and reconnect lifecycle events after handoff', async () => {
      renderHook(() =>
        useInterviewStreaming({
          phase: 'interview',
          wsClient: mockWs,
          dispatch,
          audioManagerFactory: () => mockAm,
        })
      );
      await vi.waitFor(() => expect(mockAm.startCapture).toHaveBeenCalled());

      act(() => {
        mockWs.onDisconnect('network lost');
        mockWs.onReconnectSuccess();
        mockWs.onReconnectFailed();
      });

      expect(dispatch).toHaveBeenCalledWith({
        type: 'WS_DISCONNECTED',
        payload: { reason: 'network lost' },
      });
      expect(dispatch).toHaveBeenCalledWith({ type: 'WS_RECONNECT_SUCCESS' });
      expect(dispatch).toHaveBeenCalledWith({ type: 'WS_RECONNECT_FAILED' });
    });
  });

  describe('end_interview tool handling', () => {
    it('waits for playback, closes the socket, and starts evaluation', async () => {
      let releasePlayback!: () => void;
      mockAm.waitForPlaybackEnd = vi.fn().mockReturnValue(
        new Promise<void>((resolve) => {
          releasePlayback = resolve;
        })
      );
      const onAutoEnd = vi.fn();

      renderHook(() =>
        useInterviewStreaming({
          phase: 'interview',
          wsClient: mockWs,
          dispatch,
          audioManagerFactory: () => mockAm,
          onAutoEnd,
        })
      );

      await vi.waitFor(() => expect(mockAm.startCapture).toHaveBeenCalled());
      act(() => {
        (mockWs as unknown as { onMessage: (e: NovaSonicOutputEvent) => void }).onMessage({
          type: 'tool_use',
          payload: { toolName: 'end_interview', toolUseId: 'tool-1', content: '{}' },
        });
      });

      expect(mockAm.waitForPlaybackEnd).toHaveBeenCalled();
      expect(mockWs.send).not.toHaveBeenCalled();

      await act(async () => releasePlayback());

      expect(mockWs.send).toHaveBeenCalledWith({
        type: 'session_end',
        payload: { promptName: 'default' },
      });
      expect(mockWs.disconnect).toHaveBeenCalled();
      expect(dispatch).toHaveBeenCalledWith({
        type: 'END_INTERVIEW',
        payload: { reason: 'auto' },
      });
      expect(onAutoEnd).toHaveBeenCalledOnce();
    });

    it('handles duplicate end_interview tool events only once', async () => {
      let releasePlayback!: () => void;
      mockAm.waitForPlaybackEnd = vi.fn().mockReturnValue(
        new Promise<void>((resolve) => {
          releasePlayback = resolve;
        })
      );
      const onAutoEnd = vi.fn();

      renderHook(() =>
        useInterviewStreaming({
          phase: 'interview',
          wsClient: mockWs,
          dispatch,
          audioManagerFactory: () => mockAm,
          onAutoEnd,
        })
      );
      await vi.waitFor(() => expect(mockAm.startCapture).toHaveBeenCalled());

      const event: NovaSonicOutputEvent = {
        type: 'tool_use',
        payload: { toolName: 'end_interview', toolUseId: 'tool-1', content: '{}' },
      };
      act(() => {
        mockWs.onMessage(event);
        mockWs.onMessage({
          ...event,
          payload: { ...event.payload, toolUseId: 'tool-2' },
        });
      });

      expect(mockAm.waitForPlaybackEnd).toHaveBeenCalledOnce();
      await act(async () => releasePlayback());
      expect(mockWs.send).toHaveBeenCalledOnce();
      expect(mockWs.disconnect).toHaveBeenCalledOnce();
      expect(onAutoEnd).toHaveBeenCalledOnce();
      expect(dispatch).toHaveBeenCalledWith({
        type: 'END_INTERVIEW',
        payload: { reason: 'auto' },
      });
    });

    it('cancels automatic ending if the interview phase ends during playback', async () => {
      let releasePlayback!: () => void;
      mockAm.waitForPlaybackEnd = vi.fn().mockReturnValue(
        new Promise<void>((resolve) => {
          releasePlayback = resolve;
        })
      );
      const onAutoEnd = vi.fn();
      const { rerender } = renderHook(
        ({ phase }) =>
          useInterviewStreaming({
            phase,
            wsClient: mockWs,
            dispatch,
            audioManagerFactory: () => mockAm,
            onAutoEnd,
          }),
        { initialProps: { phase: 'interview' } }
      );
      await vi.waitFor(() => expect(mockAm.startCapture).toHaveBeenCalled());

      act(() => {
        mockWs.onMessage({
          type: 'tool_use',
          payload: { toolName: 'end_interview', toolUseId: 'tool-1', content: '{}' },
        });
      });
      rerender({ phase: 'feedback' });
      await act(async () => releasePlayback());

      expect(mockWs.send).not.toHaveBeenCalled();
      expect(mockWs.disconnect).not.toHaveBeenCalled();
      expect(onAutoEnd).not.toHaveBeenCalled();
      expect(dispatch).not.toHaveBeenCalledWith(
        expect.objectContaining({ type: 'END_INTERVIEW' })
      );
    });

    it('does not duplicate a manual end that disconnects during playback', async () => {
      let releasePlayback!: () => void;
      mockAm.waitForPlaybackEnd = vi.fn().mockReturnValue(
        new Promise<void>((resolve) => {
          releasePlayback = resolve;
        })
      );
      const onAutoEnd = vi.fn();
      renderHook(() =>
        useInterviewStreaming({
          phase: 'interview',
          wsClient: mockWs,
          dispatch,
          audioManagerFactory: () => mockAm,
          onAutoEnd,
        })
      );
      await vi.waitFor(() => expect(mockAm.startCapture).toHaveBeenCalled());

      act(() => {
        mockWs.onMessage({
          type: 'tool_use',
          payload: { toolName: 'end_interview', toolUseId: 'tool-1', content: '{}' },
        });
      });
      vi.mocked(mockWs.getState).mockReturnValue('disconnected');
      await act(async () => releasePlayback());

      expect(mockWs.send).not.toHaveBeenCalled();
      expect(onAutoEnd).not.toHaveBeenCalled();
      expect(dispatch).not.toHaveBeenCalledWith(
        expect.objectContaining({ type: 'END_INTERVIEW' })
      );
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
