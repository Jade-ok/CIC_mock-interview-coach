/**
 * useInterviewStreaming hook
 *
 * Orchestrates audio streaming integration for the Interview Screen:
 * - Initializes AudioManager and starts mic capture on interview entry
 * - Wires audio chunks to WebSocket (audio_chunk events)
 * - Handles incoming WS events: audio_output, text_output, interrupted, session_invalid
 * - Handles mic permission denial with an accessible remediation state
 * - Cleans up on unmount
 *
 * Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.9, 3.10
 */

import { useEffect, useRef, useCallback, type MutableRefObject } from 'react';
import { createAudioManager, type AudioManager } from '@/services/audioManager';
import type { WebSocketClient, NovaSonicOutputEvent } from '@/services/webSocketClient';
import type { SessionAction, TranscriptEntry } from '@/types/session';

/** Returns true if text is a raw JSON control message (e.g. {"interrupted":true}) */
function isControlJson(text: string): boolean {
  const t = text.trim();
  if ((!t.startsWith('{') && !t.startsWith('[')) || t.length > 200) return false;
  try {
    const parsed = JSON.parse(t);
    return typeof parsed === 'object' && parsed !== null;
  } catch {
    return false;
  }
}

export interface UseInterviewStreamingOptions {
  phase: string;
  wsClient: InterviewWebSocketClient | null;
  dispatch: React.Dispatch<SessionAction>;
  /** Allows injection of a custom AudioManager factory (for testing) */
  audioManagerFactory?: () => AudioManager;
  /** Callback triggered when auto-end (end_interview tool_use) completes */
  onAutoEnd?: () => void;
  /** When provided, audio chunks are only sent to WS when this ref is true (mic toggle gate) */
  isRecordingRef?: MutableRefObject<boolean>;
}

/** Public socket surface shared by the real and development clients. */
export type InterviewWebSocketClient = Pick<
  WebSocketClient,
  | 'onMessage'
  | 'onDisconnect'
  | 'onReconnectSuccess'
  | 'onReconnectFailed'
  | 'getState'
  | 'send'
  | 'sendAudioChunk'
  | 'sendTextInput'
  | 'disconnect'
>;

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
  const endingRef = useRef(false);
  const lifecycleIdRef = useRef(0);
  const phaseRef = useRef(phase);
  phaseRef.current = phase;

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
    endingRef.current = false;
    const lifecycleId = ++lifecycleIdRef.current;

    const factory = audioManagerFactory ?? createAudioManager;
    const am = factory();
    audioManagerRef.current = am;

    // Wire onAudioChunk: PCM chunk → base64 → sendAudioChunk (gated by isRecordingRef)
    am.onAudioChunk = (chunk: ArrayBuffer) => {
      if (cleanedUpRef.current || endingRef.current) return;
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
      if (cleanedUpRef.current || endingRef.current) return;
      dispatchRef.current({ type: 'USER_TURN' });
    };

    // Initialize and start capture
    am.initialize().then(({ granted }) => {
      if (cleanedUpRef.current || endingRef.current) return;

      if (!granted) {
        // Sub-task 5: Mic denied → show permission remediation
        dispatchRef.current({ type: 'MIC_DENIED' });
        return;
      }

      am.startCapture();
    });

    return () => {
      cleanedUpRef.current = true;
      if (lifecycleIdRef.current === lifecycleId) {
        lifecycleIdRef.current += 1;
      }
      am.destroy();
      audioManagerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, audioManagerFactory]);

  // --- Sub-tasks 2, 3, 4: Handle WS messages ---
  const handleWsMessage = useCallback((event: NovaSonicOutputEvent) => {
    if (event.type !== 'audio_output') {
      console.log('[DIAG] WS event:', event.type, event.type === 'tool_use' ? event.payload : '');
    }
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
        const text = event.payload.content;
        // Filter out control/JSON messages (e.g. {"interrupted":true}) that Nova
        // may emit as text_output events — these should not appear in transcript.
        if (isControlJson(text)) break;

        if (event.payload.generationStage === 'FINAL') {
          const entry: TranscriptEntry = {
            role: event.payload.role,
            text,
            timestamp: new Date().toISOString(),
          };
          dispatchRef.current({ type: 'APPEND_TRANSCRIPT', payload: entry });
        } else {
          // PARTIAL — update live caption
          dispatchRef.current({
            type: 'UPDATE_LIVE_PARTIAL',
            payload: { role: event.payload.role, text },
          });
        }
        break;
      }

      // session_invalid → error + route to upload
      case 'session_invalid': {
        // Once Nova has completed the interview, the evaluator handoff owns the
        // lifecycle. A late relay error must not replace feedback with a voice
        // session error.
        if (endingRef.current) break;
        wsClientRef.current?.disconnect();
        dispatchRef.current({
          type: 'WS_SESSION_INVALID',
          payload: { message: event.payload.reason },
        });
        break;
      }

      // Sub-task 6: tool_use → handle end_interview
      case 'tool_use': {
        console.log('[DIAG] tool_use received:', event.payload.toolName);
        if (event.payload.toolName === 'end_interview' && !endingRef.current) {
          console.log('[DIAG] end_interview detected, dispatching INTERVIEW_ENDING');
          endingRef.current = true;
          am?.pauseCapture();
          dispatchRef.current({ type: 'INTERVIEW_ENDING' });
          const lifecycleId = lifecycleIdRef.current;

          // Auto end sequence: wait for playback to finish → session_end → disconnect → feedback
          const autoEndSequence = async () => {
            try {
              const am = audioManagerRef.current;
              if (am) {
                await am.waitForPlaybackEnd();
              }

              // The user may have manually ended, navigated away, or unmounted
              // while the closing audio was still playing.
              if (
                cleanedUpRef.current
                || lifecycleId !== lifecycleIdRef.current
                || phaseRef.current !== 'interview'
              ) {
                return;
              }

              const ws = wsClientRef.current;
              // Manual ending disconnects first. Treat a no-longer-connected
              // socket as cancellation so evaluation cannot be triggered twice.
              if (!ws || ws.getState() !== 'connected') return;
              ws.send({ type: 'session_end', payload: { promptName: 'default' } });
              ws.disconnect();

              dispatchRef.current({ type: 'END_INTERVIEW', payload: { reason: 'auto' } });
              onAutoEndRef.current?.();
            } catch {
              // Permit a later end_interview signal to retry if playback waiting fails.
              if (lifecycleId === lifecycleIdRef.current && !cleanedUpRef.current) {
                endingRef.current = false;
              }
            }
          };
          void autoEndSequence();
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

    // WaitingRoom owns these callbacks while connecting. Take ownership when
    // the connected client is handed to the interview screen.
    const previousHandler = wsClient.onMessage;
    const previousDisconnect = wsClient.onDisconnect;
    const previousReconnectSuccess = wsClient.onReconnectSuccess;
    const previousReconnectFailed = wsClient.onReconnectFailed;
    wsClient.onMessage = handleWsMessage;
    wsClient.onDisconnect = (reason) => {
      dispatchRef.current({ type: 'WS_DISCONNECTED', payload: { reason } });
    };
    wsClient.onReconnectSuccess = () => {
      dispatchRef.current({ type: 'WS_RECONNECT_SUCCESS' });
    };
    wsClient.onReconnectFailed = () => {
      dispatchRef.current({ type: 'WS_RECONNECT_FAILED' });
    };

    return () => {
      wsClient.onMessage = previousHandler;
      wsClient.onDisconnect = previousDisconnect;
      wsClient.onReconnectSuccess = previousReconnectSuccess;
      wsClient.onReconnectFailed = previousReconnectFailed;
    };
  }, [phase, wsClient, handleWsMessage]);

  // Expose AudioManager ref for external control (e.g. pause/resume from TextInput)
  return {
    audioManagerRef,
  };
}
