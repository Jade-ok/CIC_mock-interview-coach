import { useEffect, useRef, useState, useCallback } from 'react';
import { useSession } from '@/contexts/SessionContext';
import { useInterviewStreaming } from '@/hooks/useInterviewStreaming';
import { EndConfirmModal } from '@/components/EndConfirmModal';
import { callAgent3 } from '@/services/agent3Client';
import type { WebSocketClient } from '@/services/webSocketClient';

// --- Sub-components ---

function AITile({ isActive }: { isActive: boolean }) {
  return (
    <div
      className={`participant-tile participant-tile--ai ${isActive ? 'participant-tile--active' : ''}`}
      data-testid="ai-tile"
    >
      <div className="participant-tile__content">
        <div className="participant-tile__icon-wrapper">
          {isActive && (
            <>
              <span className="pulse-ring pulse-ring--1" />
              <span className="pulse-ring pulse-ring--2" />
            </>
          )}
          <div className="participant-tile__icon" aria-hidden="true">🤖</div>
        </div>
        {isActive && (
          <div className="waveform" data-testid="ai-waveform" aria-label="AI speaking waveform">
            <span className="waveform__bar" />
            <span className="waveform__bar" />
            <span className="waveform__bar" />
            <span className="waveform__bar" />
            <span className="waveform__bar" />
          </div>
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
        <div className="participant-tile__icon-wrapper">
          {isActive && !textOnly && (
            <>
              <span className="pulse-ring pulse-ring--1 pulse-ring--user" />
              <span className="pulse-ring pulse-ring--2 pulse-ring--user" />
            </>
          )}
          <div className="participant-tile__icon" aria-hidden="true" data-testid={textOnly ? 'text-mode-icon' : undefined}>
            {textOnly ? '⌨️' : '👤'}
          </div>
        </div>
        {isActive && !textOnly && (
          <div className="waveform" data-testid="user-waveform" aria-label="User speaking waveform">
            <span className="waveform__bar" />
            <span className="waveform__bar" />
            <span className="waveform__bar" />
            <span className="waveform__bar" />
            <span className="waveform__bar" />
          </div>
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

function MicButton({
  disabled,
  onPressStart,
  onPressEnd,
  statusText,
}: {
  disabled: boolean;
  onPressStart: () => void;
  onPressEnd: () => void;
  statusText: string | null;
}) {
  const [pressing, setPressing] = useState(false);

  const handleDown = useCallback(() => {
    if (disabled) return;
    setPressing(true);
    onPressStart();
  }, [disabled, onPressStart]);

  const handleUp = useCallback(() => {
    if (!pressing) return;
    setPressing(false);
    onPressEnd();
  }, [pressing, onPressEnd]);

  // Handle mouse leaving button while pressed
  const handleLeave = useCallback(() => {
    if (pressing) {
      setPressing(false);
      onPressEnd();
    }
  }, [pressing, onPressEnd]);

  return (
    <div className="mic-button-wrapper" data-testid="mic-button-wrapper">
      {statusText && (
        <span className="mic-button__status">{statusText}</span>
      )}
      <div className={`mic-button-container ${pressing ? 'mic-button-container--active' : ''}`}>
        {pressing && (
          <>
            <span className="mic-pulse mic-pulse--1" />
            <span className="mic-pulse mic-pulse--2" />
          </>
        )}
        <button
          className={`mic-button ${pressing ? 'mic-button--pressing' : ''} ${disabled ? 'mic-button--disabled' : ''}`}
          onMouseDown={handleDown}
          onMouseUp={handleUp}
          onMouseLeave={handleLeave}
          onTouchStart={handleDown}
          onTouchEnd={handleUp}
          disabled={disabled}
          type="button"
          aria-label="Hold to speak"
          data-testid="mic-button"
        >
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="9" y="1" width="6" height="11" rx="3" />
            <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
            <line x1="12" y1="19" x2="12" y2="23" />
            <line x1="8" y1="23" x2="16" y2="23" />
          </svg>
        </button>
      </div>
    </div>
  );
}

// --- Main Component ---

export function InterviewScreen({ wsClient }: { wsClient?: WebSocketClient | null }) {
  const { state, dispatch } = useSession();
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [showEndModal, setShowEndModal] = useState(false);
  const [guideLoading, setGuideLoading] = useState(true);
  const [visibleGuideCount, setVisibleGuideCount] = useState(0);
  const [micStatus, setMicStatus] = useState<string | null>(null);

  /** Trigger Agent 3 with current transcript */
  const triggerAgent3 = useCallback(async () => {
    dispatch({ type: 'AGENT3_LOADING' });
    try {
      const result = await callAgent3({
        transcript: state.transcript,
        competency_guides: state.competencyGuides,
      });
      dispatch({ type: 'AGENT3_SUCCESS', payload: result });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Agent 3 request failed.';
      dispatch({ type: 'AGENT3_FAILED', payload: { message } });
    }
  }, [dispatch, state.transcript, state.competencyGuides]);

  // "Analyzing your resume..." loading effect → then reveal guides one by one
  useEffect(() => {
    if (state.phase !== 'interview') return;

    // Show loading for 1.5s
    const loadingTimer = setTimeout(() => {
      setGuideLoading(false);

      // Reveal guide items one by one (300ms stagger)
      const guides = state.competencyGuides;
      guides.forEach((_, idx) => {
        setTimeout(() => {
          setVisibleGuideCount((prev) => Math.max(prev, idx + 1));
        }, idx * 300);
      });
    }, 1500);

    return () => clearTimeout(loadingTimer);
  }, [state.phase, state.competencyGuides]);

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

  // --- Mic button demo handlers ---
  const handleMicPressStart = useCallback(() => {
    setMicStatus('Listening...');
    dispatch({ type: 'USER_TURN' });
  }, [dispatch]);

  const handleMicPressEnd = useCallback(() => {
    setMicStatus('Got it, thinking...');
    dispatch({ type: 'AI_SPEAKING' });

    // After 1s, clear status and trigger next mock question via WS
    setTimeout(() => {
      setMicStatus(null);
      // Send a dummy text input to trigger the mock WS follow-up question
      if (wsClient && wsClient.getState() === 'connected') {
        wsClient.sendTextInput('[voice input]', 'default', 'mic-input');
      }
    }, 1000);
  }, [dispatch, wsClient]);

  return (
    <div className="interview-screen" data-testid="interview-screen">
      {/* Mic denied error message */}
      {state.inputMode === 'text_only' && state.error?.code === 'MIC_DENIED' && (
        <div className="interview-screen__mic-error" data-testid="mic-denied-error" role="alert">
          {state.error.message}
        </div>
      )}

      <div className="interview-screen__main">
        <div className={`interview-screen__left ${!state.practiceMode ? 'interview-screen__left--full' : ''}`}>
          <ParticipantTiles turnState={state.turnState} textOnly={state.inputMode === 'text_only'} />
          {/* Practice Bubbles placeholder */}
          <div className="practice-bubbles" data-testid="practice-bubbles" />
          {/* Mic button for demo voice interaction */}
          <MicButton
            disabled={state.turnState === 'ai_speaking'}
            onPressStart={handleMicPressStart}
            onPressEnd={handleMicPressEnd}
            statusText={micStatus}
          />
          {/* Text input hidden for demo (voice-only mode) — component preserved for future use */}
          <div className="text-input--hidden">
            <TextInput onSubmit={handleTextSubmit} onInputChange={handleTextInputChange} />
          </div>
        </div>
        {state.practiceMode && (
        <div className="interview-screen__right">
          {/* Guide Panel with loading + fade-in */}
          <div className="guide-panel" data-testid="guide-panel">
            <span className="guide-panel__title">Interview Guide</span>
            {guideLoading ? (
              <div className="guide-panel__loading" data-testid="guide-loading">
                <div className="guide-panel__loading-spinner" />
                <span className="guide-panel__loading-text">Analyzing your resume...</span>
              </div>
            ) : (
              <div className="guide-panel__items">
                {state.competencyGuides.slice(0, visibleGuideCount).map((guide, idx) => (
                  <div
                    key={guide.id}
                    className={`guide-panel__item ${guide.highlighted ? 'guide-panel__item--highlighted' : ''}`}
                    style={{ animationDelay: `${idx * 100}ms` }}
                    data-testid={`guide-item-${guide.id}`}
                  >
                    <div className="guide-panel__item-header">
                      <span className="guide-panel__item-title">{guide.title}</span>
                      {guide.highlighted && <span className="guide-panel__item-badge">Key Match</span>}
                    </div>
                    <p className="guide-panel__item-desc">{guide.description}</p>
                    <div className="guide-panel__item-tags">
                      {guide.keywords.slice(0, 3).map((kw) => (
                        <span key={kw} className="guide-panel__tag">{kw}</span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
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
          transition: flex 0.3s ease;
        }

        .interview-screen__left--full {
          flex: 1;
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
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 12px;
          min-height: 80px;
        }

        .participant-tile__icon-wrapper {
          position: relative;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .participant-tile__icon {
          font-size: 48px;
          position: relative;
          z-index: 1;
        }

        /* Pulse ring animation for active speakers */
        .pulse-ring {
          position: absolute;
          top: 50%;
          left: 50%;
          width: 72px;
          height: 72px;
          margin-top: -36px;
          margin-left: -36px;
          border-radius: 50%;
          border: 2px solid var(--color-accent, #9AE05C);
          opacity: 0;
          animation: pulse-expand 1.8s ease-out infinite;
        }

        .pulse-ring--2 {
          animation-delay: 0.6s;
        }

        .pulse-ring--user {
          border-color: var(--color-highlight, #4A9EFF);
        }

        @keyframes pulse-expand {
          0% {
            transform: scale(0.6);
            opacity: 0.6;
          }
          100% {
            transform: scale(1.5);
            opacity: 0;
          }
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
          overflow-y: auto;
        }

        .guide-panel__title {
          font-size: 14px;
          font-weight: 600;
          color: var(--color-text-primary, #FFFFFF);
          display: block;
          margin-bottom: 16px;
        }

        /* Loading state */
        .guide-panel__loading {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 12px;
          padding: 32px 0;
        }

        .guide-panel__loading-spinner {
          width: 24px;
          height: 24px;
          border: 2px solid var(--color-tile-bg, #2C2C2E);
          border-top-color: var(--color-accent, #9AE05C);
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }

        .guide-panel__loading-text {
          font-size: 13px;
          color: var(--color-accent, #9AE05C);
          animation: pulse-text 1.2s ease-in-out infinite;
        }

        @keyframes pulse-text {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }

        /* Guide Items */
        .guide-panel__items {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .guide-panel__item {
          background-color: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 8px;
          padding: 12px;
          animation: guide-fade-in 0.4s ease-out forwards;
          opacity: 0;
          transform: translateY(8px);
        }

        .guide-panel__item--highlighted {
          border-color: var(--color-accent, #9AE05C);
          background-color: rgba(154, 224, 92, 0.06);
        }

        @keyframes guide-fade-in {
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .guide-panel__item-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 6px;
        }

        .guide-panel__item-title {
          font-size: 13px;
          font-weight: 600;
          color: var(--color-text-primary, #FFFFFF);
        }

        .guide-panel__item-badge {
          font-size: 10px;
          font-weight: 600;
          color: var(--color-accent, #9AE05C);
          background-color: rgba(154, 224, 92, 0.15);
          padding: 2px 6px;
          border-radius: 4px;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .guide-panel__item-desc {
          font-size: 12px;
          color: var(--color-text-secondary, #A0A0A5);
          line-height: 1.5;
          margin: 0 0 8px;
        }

        .guide-panel__item-tags {
          display: flex;
          flex-wrap: wrap;
          gap: 4px;
        }

        .guide-panel__tag {
          font-size: 10px;
          color: var(--color-text-secondary, #A0A0A5);
          background-color: rgba(255, 255, 255, 0.06);
          padding: 2px 6px;
          border-radius: 3px;
        }

        /* Practice Bubbles */
        .practice-bubbles {
          min-height: 20px;
        }

        /* Mic Button */
        .mic-button-wrapper {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 10px;
          padding: 16px 0;
        }

        .mic-button__status {
          font-size: 13px;
          font-weight: 500;
          color: var(--color-accent, #9AE05C);
          animation: pulse-text 1.2s ease-in-out infinite;
        }

        .mic-button-container {
          position: relative;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .mic-pulse {
          position: absolute;
          width: 72px;
          height: 72px;
          border-radius: 50%;
          border: 2px solid var(--color-error, #FF5C5C);
          opacity: 0;
          animation: mic-pulse-expand 1.4s ease-out infinite;
        }

        .mic-pulse--2 {
          animation-delay: 0.5s;
        }

        @keyframes mic-pulse-expand {
          0% {
            transform: scale(0.8);
            opacity: 0.5;
          }
          100% {
            transform: scale(1.6);
            opacity: 0;
          }
        }

        .mic-button {
          width: 64px;
          height: 64px;
          border-radius: 50%;
          border: none;
          background-color: var(--color-tile-bg, #1C1C1E);
          border: 2px solid var(--color-accent, #9AE05C);
          color: var(--color-accent, #9AE05C);
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: transform 0.15s ease, background-color 0.15s ease, border-color 0.15s ease, color 0.15s ease;
          position: relative;
          z-index: 1;
        }

        .mic-button:hover:not(:disabled) {
          background-color: rgba(154, 224, 92, 0.1);
        }

        .mic-button--pressing {
          transform: scale(1.15);
          background-color: var(--color-error, #FF5C5C);
          border-color: var(--color-error, #FF5C5C);
          color: #FFFFFF;
        }

        .mic-button--disabled {
          opacity: 0.35;
          cursor: not-allowed;
          border-color: var(--color-text-secondary, #A0A0A5);
          color: var(--color-text-secondary, #A0A0A5);
        }

        /* Text Input — hidden for demo (voice-only) */
        .text-input--hidden {
          display: none;
        }

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
