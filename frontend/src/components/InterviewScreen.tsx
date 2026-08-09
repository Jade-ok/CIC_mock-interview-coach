import { useEffect, useRef, useState, useCallback } from 'react';
import { useSession } from '@/contexts/SessionContext';
import { useInterviewStreaming } from '@/hooks/useInterviewStreaming';
import { EndConfirmModal } from '@/components/EndConfirmModal';
import { PracticeBubbles } from '@/components/PracticeBubbles';
import { GuidePanel } from '@/components/GuidePanel';
import { buildAgent3Request, callAgent3 } from '@/services/agent3Client';
import type { WebSocketClient } from '@/services/webSocketClient';

// --- Sub-components ---

function AITile({ isActive, text }: { isActive: boolean; text: string | null }) {
  return (
    <div
      className={`participant-tile participant-tile--ai ${isActive ? 'participant-tile--active' : ''}`}
      data-testid="ai-tile"
    >
      <div className="participant-tile__content participant-tile__content--captioned">
        {isActive && (
          <div className="waveform" data-testid="ai-waveform" aria-label="AI speaking waveform">
            <span className="waveform__bar" />
            <span className="waveform__bar" />
            <span className="waveform__bar" />
            <span className="waveform__bar" />
            <span className="waveform__bar" />
          </div>
        )}
        {!isActive && (
          <div className="participant-tile__icon" aria-hidden="true">🤖</div>
        )}
        {text && (
          <p
            className={`tile-subtitle ${isActive ? 'tile-subtitle--active' : ''}`}
            data-testid="ai-subtitle"
          >
            {text}
          </p>
        )}
      </div>
      <span className="participant-tile__label">AI Interviewer</span>
    </div>
  );
}

function UserTile({ isActive, text }: { isActive: boolean; text: string | null }) {
  return (
    <div
      className={`participant-tile participant-tile--user ${isActive ? 'participant-tile--active' : ''}`}
      data-testid="user-tile"
    >
      <div className="participant-tile__content participant-tile__content--captioned">
        {isActive && (
          <div className="waveform" data-testid="user-waveform" aria-label="User speaking waveform">
            <span className="waveform__bar" />
            <span className="waveform__bar" />
            <span className="waveform__bar" />
            <span className="waveform__bar" />
            <span className="waveform__bar" />
          </div>
        )}
        {!isActive && (
          <div className="participant-tile__icon" aria-hidden="true">👤</div>
        )}
        {text && (
          <p
            className={`tile-subtitle ${isActive ? 'tile-subtitle--active' : ''}`}
            data-testid="user-subtitle"
          >
            {text}
          </p>
        )}
      </div>
      <span className="participant-tile__label">You</span>
    </div>
  );
}

function ParticipantTiles({ turnState, latestInterviewerText, latestUserText }: { turnState: string; latestInterviewerText: string | null; latestUserText: string | null }) {
  return (
    <div className="participant-tiles" data-testid="participant-tiles">
      <AITile isActive={turnState === 'ai_speaking'} text={latestInterviewerText} />
      <UserTile isActive={turnState === 'user_turn'} text={latestUserText} />
    </div>
  );
}

function Timer({ elapsedSeconds }: { elapsedSeconds: number }) {
  const minutes = Math.floor(elapsedSeconds / 60);
  const seconds = elapsedSeconds % 60;
  const formatted = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

  return (
    <span className="control-bar__timer" data-testid="timer">
      {formatted}
    </span>
  );
}

function PracticeModeToggle({
  practiceMode,
  onToggle,
}: {
  practiceMode: boolean;
  onToggle: () => void;
}) {
  const label = practiceMode ? 'Practice Mode' : 'Live Mode';
  const subtitle = practiceMode ? 'with guide & captions' : 'clean, no assistance';
  const ariaLabel = practiceMode ? 'Switch to Live Mode' : 'Switch to Practice Mode';

  return (
    <button
      className={`control-bar__practice-toggle ${practiceMode ? 'control-bar__practice-toggle--on' : ''}`}
      onClick={onToggle}
      type="button"
      aria-label={ariaLabel}
      data-testid="practice-mode-toggle"
    >
      <span className="control-bar__toggle-label">{label}</span>
      <span className="control-bar__toggle-subtitle">{subtitle}</span>
    </button>
  );
}

function EndButton({ onEnd }: { onEnd: () => void }) {
  return (
    <button
      className="control-bar__end-btn"
      onClick={onEnd}
      type="button"
      disabled={false}
      aria-label="End"
      data-testid="end-button"
    >
      End
    </button>
  );
}

function ControlBar({
  elapsedSeconds,
  practiceMode,
  onTogglePracticeMode,
  onEnd,
}: {
  elapsedSeconds: number;
  practiceMode: boolean;
  onTogglePracticeMode: () => void;
  onEnd: () => void;
}) {
  return (
    <div className="control-bar" data-testid="control-bar">
      <Timer elapsedSeconds={elapsedSeconds} />
      <PracticeModeToggle practiceMode={practiceMode} onToggle={onTogglePracticeMode} />
      <EndButton onEnd={onEnd} />
    </div>
  );
}

/**
 * MicButton — click-toggle mic recording button.
 *
 * States:
 * - disabled (AI speaking): button is non-interactive
 * - idle (user turn, not recording): ready to start
 * - recording (user turn, actively sending audio): pulsing indicator
 */
function MicButton({
  disabled,
  recording,
  onClick,
}: {
  disabled: boolean;
  recording: boolean;
  onClick: () => void;
}) {
  const ariaLabel = disabled
    ? 'Waiting for AI'
    : recording
      ? 'Stop recording'
      : 'Start recording your answer';

  return (
    <div className="mic-button-wrapper" data-testid="mic-button-wrapper">
      <div className={`mic-button-container ${recording ? 'mic-button-container--recording' : ''}`}>
        {recording && (
          <>
            <span className="mic-pulse mic-pulse--1" />
            <span className="mic-pulse mic-pulse--2" />
          </>
        )}
        <button
          className={`mic-button ${recording ? 'mic-button--recording' : ''}`}
          type="button"
          disabled={disabled}
          onClick={onClick}
          aria-label={ariaLabel}
          aria-pressed={recording}
          data-testid="mic-button"
        >
          <svg
            width="32"
            height="32"
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
          >
            <path
              d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"
              fill="currentColor"
            />
            <path
              d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"
              fill="currentColor"
            />
          </svg>
        </button>
      </div>
      <span className="mic-button__status" data-testid="mic-status">
        {disabled ? '' : recording ? 'Recording...' : 'Click to speak'}
      </span>
    </div>
  );
}

// --- Main Component ---

export function InterviewScreen({ wsClient }: { wsClient?: WebSocketClient | null }) {
  const { state, dispatch } = useSession();
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [showEndModal, setShowEndModal] = useState(false);

  // --- Mic toggle recording state ---
  const [recording, setRecording] = useState(true);
  const isRecordingRef = useRef(false);

  // Keep ref in sync with state (ref is read inside audio callback for zero-lag gating)
  useEffect(() => {
    isRecordingRef.current = recording;
  }, [recording]);

  // Reset recording when a new user turn starts (turnState transitions to user_turn)
  const prevTurnStateRef = useRef(state.turnState);
  useEffect(() => {
    prevTurnStateRef.current = state.turnState;
  }, [state.turnState]);

  /** Trigger Agent 3 with current transcript */
  const triggerAgent3 = useCallback(async () => {
    dispatch({ type: 'AGENT3_LOADING' });
    try {
      const request = buildAgent3Request(state);
      if (request.conversation.length === 0) {
        dispatch({
          type: 'AGENT3_FAILED',
          payload: {
            message: 'Complete at least one interview answer before requesting feedback.',
            retryable: false,
          },
        });
        return;
      }
      const result = await callAgent3(request);
      dispatch({ type: 'AGENT3_SUCCESS', payload: result });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Agent 3 request failed.';
      const retryable = !message.includes('without Analyst output');
      dispatch({ type: 'AGENT3_FAILED', payload: { message, retryable } });
    }
  }, [dispatch, state]);

  // Audio streaming integration — pass isRecordingRef for gating
  const { audioManagerRef } = useInterviewStreaming({
    phase: state.phase,
    wsClient: wsClient ?? null,
    dispatch,
    onAutoEnd: triggerAgent3,
    isRecordingRef,
  });

  // beforeunload effect — only active during interview phase
  useEffect(() => {
    if (state.phase === 'interview') {
      const handler = (e: BeforeUnloadEvent) => {
        e.preventDefault();
        e.returnValue = '';
      };
      window.addEventListener('beforeunload', handler);
      return () => window.removeEventListener('beforeunload', handler);
    }
  }, [state.phase]);

  // Timer TICK effect — dispatches TICK every second during interview phase
  useEffect(() => {
    if (state.phase === 'interview') {
      timerRef.current = setInterval(() => {
        dispatch({ type: 'TICK' });
      }, 1000);
      return () => {
        if (timerRef.current) {
          clearInterval(timerRef.current);
          timerRef.current = null;
        }
      };
    }
  }, [state.phase, dispatch]);

  /** Manual end: user clicks End button → show modal */
  const handleEnd = useCallback(() => {
    setShowEndModal(true);
  }, []);

  /** Manual end confirmed: stop playback → session_end → disconnect → feedback */
  const handleEndConfirm = useCallback(() => {
    setShowEndModal(false);
    setRecording(false);

    // Stop playback immediately (user-intentional, no wait)
    if (audioManagerRef.current) {
      audioManagerRef.current.stopPlayback();
    }

    // Send session_end via WebSocket
    if (wsClient && wsClient.getState() === 'connected') {
      wsClient.send({ type: 'session_end', payload: { promptName: 'default' } });
      wsClient.disconnect();
    }

    // Transition to feedback
    dispatch({ type: 'END_INTERVIEW', payload: { reason: 'manual' } });

    // Trigger Agent 3
    triggerAgent3();
  }, [audioManagerRef, wsClient, dispatch, triggerAgent3]);

  /** Modal cancelled */
  const handleEndCancel = useCallback(() => {
    setShowEndModal(false);
  }, []);

  const handleTogglePracticeMode = useCallback(() => {
    dispatch({ type: 'TOGGLE_PRACTICE_MODE' });
  }, [dispatch]);

  /** Mic button click: toggle recording on/off */
  const handleMicClick = useCallback(() => {
    if (state.turnState === 'ai_speaking') return; // safety guard
    setRecording((prev) => !prev);
  }, [state.turnState]);

  const micDisabled = state.turnState === 'ai_speaking';

  return (
    <div className="interview-screen" data-testid="interview-screen">
      {/* Mic denied error message */}
      {state.error?.code === 'MIC_DENIED' && (
        <div className="interview-screen__mic-error" data-testid="mic-denied-error" role="alert">
          Microphone access is required. Please allow microphone permission in your browser settings and refresh the page.
        </div>
      )}

      <div className="interview-screen__main">
        <div className={`interview-screen__left ${!state.practiceMode ? 'interview-screen__left--full' : ''}`}>
          {/* Practice Mode OFF → Tile view, no text (real interview mode) */}
          {!state.practiceMode && (
            <ParticipantTiles turnState={state.turnState} latestInterviewerText={null} latestUserText={null} />
          )}
          {/* Practice Mode ON → Chat log view */}
          {state.practiceMode && (
            <PracticeBubbles transcript={state.transcript} livePartial={state.livePartial} turnState={state.turnState} />
          )}
          <MicButton
            disabled={micDisabled}
            recording={recording}
            onClick={handleMicClick}
          />
        </div>
        {state.practiceMode && (
          <div className="interview-screen__right">
            <GuidePanel analystOutput={state.analystOutput} />
          </div>
        )}
      </div>
      <ControlBar
        elapsedSeconds={state.elapsedSeconds}
        practiceMode={state.practiceMode}
        onTogglePracticeMode={handleTogglePracticeMode}
        onEnd={handleEnd}
      />

      <EndConfirmModal
        open={showEndModal}
        onConfirm={handleEndConfirm}
        onCancel={handleEndCancel}
      />

      <style>{`
        .interview-screen {
          height: 100vh;
          max-height: 100vh;
          overflow: hidden;
          background-color: var(--color-canvas, #0A0A0A);
          display: flex;
          flex-direction: column;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          color: var(--color-text-primary, #FFFFFF);
        }

        .interview-screen__main {
          flex: 1;
          min-height: 0;
          display: flex;
          gap: 12px;
          padding: 12px;
          overflow: hidden;
        }

        .interview-screen__mic-error {
          background-color: var(--color-error-bg, rgba(255, 92, 92, 0.15));
          border: 1px solid var(--color-error, #FF5C5C);
          border-radius: 8px;
          padding: 10px 16px;
          margin: 12px 12px 0;
          font-size: 13px;
          color: var(--color-error, #FF5C5C);
        }

        .interview-screen__left {
          flex: 2;
          min-height: 0;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .interview-screen__left--full {
          flex: 1;
        }

        .interview-screen__right {
          flex: 1;
          min-width: 200px;
          overflow-y: auto;
        }

        /* Participant Tiles */
        .participant-tiles {
          flex: 1;
          min-height: 0;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .participant-tile {
          flex: 1;
          min-height: 120px;
          background-color: var(--color-tile-bg, #1C1C1E);
          border-radius: 8px;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          position: relative;
          border: 2px solid transparent;
          transition: border-color 0.2s;
        }

        .participant-tile--active {
          border-color: var(--color-accent, #9AE05C);
        }

        .participant-tile__content {
          display: flex;
          align-items: center;
          justify-content: center;
          min-height: 80px;
        }

        .participant-tile__content--captioned {
          flex-direction: column;
          gap: 12px;
          padding: 16px 24px;
          transition: all 0.3s ease;
        }

        .participant-tile__icon {
          font-size: 48px;
        }

        .participant-tile__label {
          position: absolute;
          bottom: 8px;
          left: 12px;
          font-size: 14px;
          font-weight: 500;
          color: var(--color-text-primary, #FFFFFF);
          background-color: rgba(0, 0, 0, 0.6);
          padding: 2px 8px;
          border-radius: 4px;
        }

        /* Waveform */
        .waveform {
          display: flex;
          align-items: center;
          gap: 3px;
          height: 40px;
        }

        .waveform__bar {
          width: 4px;
          height: 20px;
          background-color: var(--color-accent, #9AE05C);
          border-radius: 2px;
          animation: waveform-pulse 0.6s ease-in-out infinite alternate;
        }

        .waveform__bar:nth-child(1) { animation-delay: 0s; }
        .waveform__bar:nth-child(2) { animation-delay: 0.1s; }
        .waveform__bar:nth-child(3) { animation-delay: 0.2s; }
        .waveform__bar:nth-child(4) { animation-delay: 0.3s; }
        .waveform__bar:nth-child(5) { animation-delay: 0.4s; }

        @keyframes waveform-pulse {
          from { height: 8px; }
          to { height: 32px; }
        }

        /* Tile Subtitle (shared by AI and User tiles) */
        .tile-subtitle {
          margin: 0;
          font-size: 14px;
          line-height: 1.4;
          color: var(--color-text-secondary, #A0A0A5);
          text-align: center;
          max-width: 80%;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
          background-color: rgba(0, 0, 0, 0.4);
          padding: 6px 12px;
          border-radius: 6px;
          transition: opacity 0.3s ease, color 0.3s ease;
        }

        .tile-subtitle--active {
          color: var(--color-text-primary, #FFFFFF);
        }

        /* Guide Panel */
        .guide-panel {
          background-color: var(--color-tile-bg, #1C1C1E);
          border-radius: 8px;
          height: 100%;
          padding: 16px;
        }

        .guide-panel__title {
          font-size: 14px;
          font-weight: 500;
          color: var(--color-text-secondary, #A0A0A5);
        }



        /* Mic Button */
        .mic-button-wrapper {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 10px;
          padding: 12px 0 24px;
          margin-top: auto;
        }

        .mic-button-container {
          position: relative;
          display: flex;
          align-items: center;
          justify-content: center;
          width: 88px;
          height: 88px;
        }

        .mic-pulse {
          position: absolute;
          inset: 0;
          border-radius: 50%;
          border: 2px solid var(--color-accent, #9AE05C);
          opacity: 0;
        }

        .mic-button-container--recording .mic-pulse--1 {
          animation: mic-pulse-anim 1.5s ease-out infinite;
        }

        .mic-button-container--recording .mic-pulse--2 {
          animation: mic-pulse-anim 1.5s ease-out infinite 0.75s;
        }

        @keyframes mic-pulse-anim {
          0% {
            transform: scale(1);
            opacity: 0.6;
          }
          100% {
            transform: scale(1.8);
            opacity: 0;
          }
        }

        .mic-button {
          width: 72px;
          height: 72px;
          border-radius: 50%;
          border: 2px solid var(--color-accent, #9AE05C);
          background-color: var(--color-tile-bg, #1C1C1E);
          color: var(--color-accent, #9AE05C);
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: background-color 0.2s, border-color 0.2s, opacity 0.2s;
          position: relative;
          z-index: 1;
        }

        .mic-button--recording {
          background-color: var(--color-accent, #9AE05C);
          color: var(--color-canvas, #0A0A0A);
        }

        .mic-button:disabled {
          opacity: 0.35;
          cursor: not-allowed;
          border-color: var(--color-text-secondary, #A0A0A5);
          color: var(--color-text-secondary, #A0A0A5);
        }

        .mic-button:not(:disabled):hover {
          background-color: rgba(154, 224, 92, 0.15);
        }

        .mic-button--recording:not(:disabled):hover {
          background-color: var(--color-accent, #9AE05C);
          opacity: 0.85;
        }

        .mic-button__status {
          font-size: 12px;
          color: var(--color-text-secondary, #A0A0A5);
          min-height: 16px;
        }

        /* Control Bar */
        .control-bar {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 24px;
          padding: 12px 24px;
          background-color: var(--color-control-bar, #2C2C2E);
        }

        .control-bar__timer {
          font-size: 13px;
          color: var(--color-text-secondary, #A0A0A5);
          font-variant-numeric: tabular-nums;
        }

        .control-bar__practice-toggle {
          background-color: transparent;
          border: 1px solid var(--color-text-secondary, #A0A0A5);
          border-radius: 8px;
          padding: 6px 14px;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 2px;
          cursor: pointer;
          transition: border-color 0.2s;
        }

        .control-bar__practice-toggle--on {
          border-color: var(--color-accent, #9AE05C);
        }

        .control-bar__toggle-label {
          font-size: 13px;
          font-weight: 600;
          color: var(--color-text-secondary, #A0A0A5);
          transition: color 0.2s;
        }

        .control-bar__practice-toggle--on .control-bar__toggle-label {
          color: var(--color-accent, #9AE05C);
        }

        .control-bar__toggle-subtitle {
          font-size: 11px;
          color: rgba(160, 160, 165, 0.7);
          transition: color 0.2s;
        }

        .control-bar__practice-toggle--on .control-bar__toggle-subtitle {
          color: rgba(154, 224, 92, 0.6);
        }

        .control-bar__end-btn {
          background-color: transparent;
          border: 1px solid var(--color-error, #FF5C5C);
          border-radius: 8px;
          padding: 8px 16px;
          font-size: 13px;
          color: var(--color-error, #FF5C5C);
          cursor: pointer;
          font-weight: 600;
          transition: background-color 0.2s;
        }

        .control-bar__end-btn:hover {
          background-color: var(--color-error, #FF5C5C);
          color: var(--color-text-primary, #FFFFFF);
        }
      `}</style>
    </div>
  );
}
