/**
 * useInterviewStreaming hook
 *
 * Orchestrates audio streaming integration for the Interview Screen:
 * - Initializes AudioManager and starts mic capture on interview entry
 * - Wires audio chunks to WebSocket (audio_chunk events)
 * - Handles incoming WS events: audio_output, text_output, interrupted, session_invalid
 * - Handles mic permission denial → text-only mode (audio playback remains)
 * - Cleans up on unmount
 *
 * Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.9, 3.10
 */

import { useEffect, useRef, useCallback, type MutableRefObject } from 'react';
import { createAudioManager, type AudioManager } from '@/services/audioManager';
import type { WebSocketClient, NovaSonicOutputEvent } from '@/services/webSocketClient';
import type { SessionAction, TranscriptEntry } from '@/types/session';

export interface UseInterviewStreamingOptions {
  phase: string;
  wsClient: WebSocketClient | null;
  dispatch: React.Dispatch<SessionAction>;
  /** Allows injection of a custom AudioManager factory (for testing) */
  audioManagerFactory?: () => AudioManager;
  /** Callback triggered when auto-end (end_interview tool_use) completes */
  onAutoEnd?: () => void;
  /** When provided, audio chunks are only sent to WS when this ref is true (mic toggle gate) */
  isRecordingRef?: MutableRefObject<boolean>;
}

export function useInterviewStreaming({
  phase,
  wsClient,
  dispatch,
  audioManagerFactory,
  onAutoEnd,
  isRecordingRef,
}: UseInterviewStreamingOptions) {
  const audioManagerRef = useRef<AudioManager | null>(null);
  const cleanedUpRef = useRef(false);

  // Store dispatch in a ref to avoid effect re-runs
  const dispatchRef = useRef(dispatch);
  dispatchRef.current = dispatch;

  const wsClientRef = useRef(wsClient);
  wsClientRef.current = wsClient;

  const onAutoEndRef = useRef(onAutoEnd);
  onAutoEndRef.current = onAutoEnd;

  // --- Sub-task 1: Initialize AudioManager + start capture + wire audio → WS ---
  useEffect(() => {
    if (phase !== 'interview') return;

    cleanedUpRef.current = false;

    const factory = audioManagerFactory ?? createAudioManager;
    const am = factory();
    audioManagerRef.current = am;

    // Wire onAudioChunk: PCM chunk → base64 → sendAudioChunk (gated by isRecordingRef)
    am.onAudioChunk = (chunk: ArrayBuffer) => {
      if (cleanedUpRef.current) return;
      // Audio gate: only forward chunks when recording is active
      if (isRecordingRef && !isRecordingRef.current) return;
      const ws = wsClientRef.current;
      if (!ws || ws.getState() !== 'connected') return;

      // Convert ArrayBuffer to base64
      const bytes = new Uint8Array(chunk);
      let binary = '';
      for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      const base64 = btoa(binary);
      ws.sendAudioChunk(base64, 'default', 'audio-input');
    };

    // Wire onPlaybackEnd: when AI finishes speaking, transition to user_turn
    am.onPlaybackEnd = () => {
      if (cleanedUpRef.current) return;
      dispatchRef.current({ type: 'USER_TURN' });
    };

    // Initialize and start capture
    am.initialize().then(({ granted }) => {
      if (cleanedUpRef.current) return;

      if (!granted) {
        // Sub-task 5: Mic denied → text-only mode (audio playback still works)
        dispatchRef.current({ type: 'MIC_DENIED' });
        return;
      }

      am.startCapture();
    });

    return () => {
      cleanedUpRef.current = true;
      am.destroy();
      audioManagerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, audioManagerFactory]);

  // --- Sub-tasks 2, 3, 4: Handle WS messages ---
  const handleWsMessage = useCallback((event: NovaSonicOutputEvent) => {
    const am = audioManagerRef.current;

    switch (event.type) {
      // Sub-task 2: audio_output → enqueue playback + AI_SPEAKING
      case 'audio_output': {
        if (am) {
          am.enqueueAudio(event.payload.content);
        }
        dispatchRef.current({ type: 'AI_SPEAKING' });
        break;
      }

      // Sub-task 3: interrupted → stopPlayback + BARGE_IN (user_turn)
      case 'interrupted': {
        if (am) {
          am.stopPlayback();
        }
        dispatchRef.current({ type: 'BARGE_IN' });
        break;
      }

      // Sub-task 4: text_output → PARTIAL updates livePartial, FINAL commits to transcript
      case 'text_output': {
        if (event.payload.generationStage === 'FINAL') {
          const entry: TranscriptEntry = {
            role: event.payload.role,
            text: event.payload.content,
            timestamp: new Date().toISOString(),
          };
          dispatchRef.current({ type: 'APPEND_TRANSCRIPT', payload: entry });
        } else {
          // PARTIAL — update live caption
          dispatchRef.current({
            type: 'UPDATE_LIVE_PARTIAL',
            payload: { role: event.payload.role, text: event.payload.content },
          });
        }
        break;
      }

      // session_invalid → error + route to upload
      case 'session_invalid': {
        dispatchRef.current({ type: 'WS_SESSION_INVALID' });
        break;
      }

      // Sub-task 6: tool_use → handle end_interview
      case 'tool_use': {
        if (event.payload.toolName === 'end_interview') {
          // Auto end sequence: wait for playback to finish → session_end → disconnect → feedback
          const autoEndSequence = async () => {
            const am = audioManagerRef.current;
            if (am) {
              await am.waitForPlaybackEnd();
            }

            const ws = wsClientRef.current;
            if (ws && ws.getState() === 'connected') {
              ws.send({ type: 'session_end', payload: { promptName: 'default' } });
              ws.disconnect();
            }

            dispatchRef.current({ type: 'END_INTERVIEW', payload: { reason: 'auto' } });

            // Trigger Agent 3 callback
            if (onAutoEndRef.current) {
              onAutoEndRef.current();
            }
          };
          autoEndSequence();
        }
        break;
      }

      default:
        break;
    }
  }, []);

  // Register WS message handler when in interview phase
  useEffect(() => {
    if (phase !== 'interview' || !wsClient) return;

    // Store the previous handler to restore on cleanup
    const previousHandler = wsClient.onMessage;
    wsClient.onMessage = handleWsMessage;

    return () => {
      wsClient.onMessage = previousHandler;
    };
  }, [phase, wsClient, handleWsMessage]);

  // Expose AudioManager ref for external control (e.g. pause/resume from TextInput)
  return {
    audioManagerRef,
  };
}
