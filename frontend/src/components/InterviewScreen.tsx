import { useEffect, useRef, useState, useCallback } from 'react';
import { useSession } from '@/contexts/SessionContext';
import { useInterviewStreaming } from '@/hooks/useInterviewStreaming';
import { EndConfirmModal } from '@/components/EndConfirmModal';
import { buildAgent3Request, callAgent3 } from '@/services/agent3Client';
import type { WebSocketClient } from '@/services/webSocketClient';
import type { MockWebSocketClient } from '@/services/mockWebSocketClient';

// --- Sub-components ---

function AITile({ isActive }: { isActive: boolean }) {
  return (
    <div
      className={`participant-tile participant-tile--ai ${isActive ? 'participant-tile--active' : ''}`}
      data-testid="ai-tile"
    >
      <div className="participant-tile__content">
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
      </div>
      <span className="participant-tile__label">AI Interviewer</span>
    </div>
  );
}

function UserTile({ isActive, textOnly }: { isActive: boolean; textOnly: boolean }) {
  return (
    <div
      className={`participant-tile participant-tile--user ${isActive ? 'participant-tile--active' : ''}`}
      data-testid="user-tile"
    >
      <div className="participant-tile__content">
        {isActive && !textOnly && (
          <div className="waveform" data-testid="user-waveform" aria-label="User speaking waveform">
            <span className="waveform__bar" />
            <span className="waveform__bar" />
            <span className="waveform__bar" />
            <span className="waveform__bar" />
            <span className="waveform__bar" />
          </div>
        )}
        {textOnly && (
          <div className="participant-tile__icon" aria-hidden="true" data-testid="text-mode-icon">⌨️</div>
        )}
        {!isActive && !textOnly && (
          <div className="participant-tile__icon" aria-hidden="true">👤</div>
        )}
      </div>
      <span className="participant-tile__label">You{textOnly ? ' (Text Mode)' : ''}</span>
    </div>
  );
}

function ParticipantTiles({ turnState, textOnly }: { turnState: string; textOnly: boolean }) {
  return (
    <div className="participant-tiles" data-testid="participant-tiles">
      <AITile isActive={turnState === 'ai_speaking'} />
      <UserTile isActive={turnState === 'user_turn'} textOnly={textOnly} />
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
  return (
    <button
      className={`control-bar__practice-toggle ${practiceMode ? 'control-bar__practice-toggle--on' : ''}`}
      onClick={onToggle}
      type="button"
      aria-label="Practice Mode toggle"
      data-testid="practice-mode-toggle"
    >
      Practice Mode {practiceMode ? '●' : '○'}
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
      End 🔴
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

function TextInput({ onSubmit, onInputChange }: { onSubmit: (text: string) => void; onInputChange?: (hasText: boolean) => void }) {
  const [value, setValue] = useState('');
  const hadTextRef = useRef(false);

  const handleSubmit = useCallback(() => {
    const trimmed = value.trim();
    if (trimmed) {
      onSubmit(trimmed);
      setValue('');
      hadTextRef.current = false;
    }
  }, [value, onSubmit]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit]
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const newValue = e.target.value;
      setValue(newValue);

      const hasText = newValue.length > 0;
      if (hasText !== hadTextRef.current) {
        hadTextRef.current = hasText;
        onInputChange?.(hasText);
      }
    },
    [onInputChange]
  );

  return (
    <div className="text-input" data-testid="text-input">
      <input
        className="text-input__field"
        type="text"
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder="Type your answer..."
        aria-label="Text input fallback"
      />
      <button
        className="text-input__send-btn"
        onClick={handleSubmit}
        type="button"
        disabled={!value.trim()}
        aria-label="Send"
        data-testid="text-send-button"
      >
        Send
      </button>
    </div>
  );
}

// --- Main Component ---

export function InterviewScreen({ wsClient }: { wsClient?: WebSocketClient | MockWebSocketClient | null }) {
  const { state, dispatch } = useSession();
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [showEndModal, setShowEndModal] = useState(false);

  /** Trigger Agent 3 with current transcript */
  const triggerAgent3 = useCallback(async () => {
    dispatch({ type: 'AGENT3_LOADING' });
    try {
      const result = await callAgent3(buildAgent3Request(state));
      dispatch({ type: 'AGENT3_SUCCESS', payload: result });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Agent 3 request failed.';
      dispatch({ type: 'AGENT3_FAILED', payload: { message } });
    }
  }, [dispatch, state]);

  // Audio streaming integration
  const { audioManagerRef } = useInterviewStreaming({
    phase: state.phase,
    wsClient: wsClient ?? null,
    dispatch,
    onAutoEnd: triggerAgent3,
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

  const handleTextSubmit = useCallback(
    (text: string) => {
      dispatch({ type: 'TEXT_INPUT_CLEAR' });
      // Send text via WebSocket
      if (wsClient && wsClient.getState() === 'connected') {
        wsClient.sendTextInput(text, 'default', 'text-input');
        dispatch({
          type: 'APPEND_TRANSCRIPT',
          payload: {
            role: 'user',
            text,
            timestamp: new Date().toISOString(),
          },
        });
      }
      // Resume capture after text submit (if audio manager available)
      if (audioManagerRef.current && state.inputMode === 'voice') {
        audioManagerRef.current.resumeCapture();
      }
    },
    [dispatch, wsClient, audioManagerRef, state.inputMode]
  );

  const handleTextInputChange = useCallback(
    (hasText: boolean) => {
      if (hasText) {
        dispatch({ type: 'TEXT_INPUT_START' });
        // Pause capture while composing text
        if (audioManagerRef.current && state.inputMode === 'voice') {
          audioManagerRef.current.pauseCapture();
        }
      } else {
        dispatch({ type: 'TEXT_INPUT_CLEAR' });
        // Resume capture when text cleared
        if (audioManagerRef.current && state.inputMode === 'voice') {
          audioManagerRef.current.resumeCapture();
        }
      }
    },
    [dispatch, audioManagerRef, state.inputMode]
  );

  return (
    <div className="interview-screen" data-testid="interview-screen">
      {/* Mic denied error message */}
      {state.inputMode === 'text_only' && state.error?.code === 'MIC_DENIED' && (
        <div className="interview-screen__mic-error" data-testid="mic-denied-error" role="alert">
          {state.error.message}
        </div>
      )}

      <div className="interview-screen__main">
        <div className="interview-screen__left">
          <ParticipantTiles turnState={state.turnState} textOnly={state.inputMode === 'text_only'} />
          {/* Practice Bubbles placeholder */}
          <div className="practice-bubbles" data-testid="practice-bubbles" />
          <TextInput onSubmit={handleTextSubmit} onInputChange={handleTextInputChange} />
        </div>
        <div className="interview-screen__right">
          {/* Guide Panel placeholder */}
          <div className="guide-panel" data-testid="guide-panel">
            <span className="guide-panel__title">Guide Panel</span>
          </div>
        </div>
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
          min-height: 100vh;
          background-color: var(--color-canvas, #0A0A0A);
          display: flex;
          flex-direction: column;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          color: var(--color-text-primary, #FFFFFF);
        }

        .interview-screen__main {
          flex: 1;
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
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .interview-screen__right {
          flex: 1;
          min-width: 200px;
        }

        /* Participant Tiles */
        .participant-tiles {
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .participant-tile {
          flex: 1;
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

        /* Practice Bubbles */
        .practice-bubbles {
          min-height: 40px;
        }

        /* Text Input */
        .text-input {
          display: flex;
          gap: 8px;
          padding: 8px 0;
        }

        .text-input__field {
          flex: 1;
          background-color: var(--color-tile-bg, #1C1C1E);
          border: 1px solid var(--color-control-bar, #2C2C2E);
          border-radius: 8px;
          padding: 10px 14px;
          color: var(--color-text-primary, #FFFFFF);
          font-size: 14px;
          outline: none;
          transition: border-color 0.2s;
        }

        .text-input__field:focus {
          border-color: var(--color-accent, #9AE05C);
        }

        .text-input__field::placeholder {
          color: var(--color-text-secondary, #A0A0A5);
        }

        .text-input__send-btn {
          background-color: var(--color-accent, #9AE05C);
          color: var(--color-canvas, #0A0A0A);
          border: none;
          border-radius: 8px;
          padding: 10px 16px;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          transition: opacity 0.2s;
        }

        .text-input__send-btn:disabled {
          opacity: 0.4;
          cursor: not-allowed;
        }

        .text-input__send-btn:not(:disabled):hover {
          opacity: 0.9;
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
          padding: 8px 14px;
          font-size: 13px;
          color: var(--color-text-secondary, #A0A0A5);
          cursor: pointer;
          transition: border-color 0.2s, color 0.2s;
        }

        .control-bar__practice-toggle--on {
          border-color: var(--color-accent, #9AE05C);
          color: var(--color-accent, #9AE05C);
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
