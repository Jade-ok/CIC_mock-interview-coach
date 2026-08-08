import { useEffect, useRef } from 'react';
import type { TranscriptEntry } from '@/types/session';

interface PracticeBubblesProps {
  transcript: TranscriptEntry[];
  livePartial: { role: 'interviewer' | 'user'; text: string } | null;
  turnState: string;
}

/**
 * PracticeBubbles — full chat-log view used as the main content area
 * when Practice Mode is ON.
 *
 * Shows both interviewer and user transcript entries as chat bubbles,
 * plus a live partial indicator for text currently being spoken/transcribed.
 *
 * Filters out control/metadata entries (e.g. raw JSON like {"interrupted":true})
 * that Nova Sonic may emit as text_output events.
 *
 * This component should only be rendered when practiceMode is true.
 */

/** Detects entries that are raw JSON control messages rather than spoken text */
function isControlMessage(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return false;
  try {
    const parsed = JSON.parse(trimmed);
    // If it parses as an object/array, it's a control message, not speech
    return typeof parsed === 'object' && parsed !== null;
  } catch {
    return false;
  }
}

export function PracticeBubbles({ transcript, livePartial, turnState }: PracticeBubblesProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new entries arrive or live partial updates
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [transcript.length, livePartial]);

  // Filter out control/JSON messages from display
  const displayEntries = transcript.filter((entry) => !isControlMessage(entry.text));

  return (
    <div className="practice-chat" data-testid="practice-bubbles">
      {/* Compact status indicator */}
      <div className="practice-chat__status" data-testid="practice-chat-status">
        <span className={`practice-chat__dot ${turnState === 'ai_speaking' ? 'practice-chat__dot--active' : ''}`} />
        <span className="practice-chat__status-label">
          {turnState === 'ai_speaking' ? 'AI speaking…' : turnState === 'user_turn' ? 'Your turn' : 'Waiting…'}
        </span>
      </div>

      {/* Chat log */}
      <div className="practice-chat__log" ref={scrollRef} data-testid="practice-chat-log">
        {displayEntries.map((entry, index) => (
          <div
            key={`${entry.timestamp}-${index}`}
            className={`practice-chat__bubble practice-chat__bubble--${entry.role}`}
            data-testid={`practice-bubble-${entry.role}`}
          >
            <span className="practice-chat__role">
              {entry.role === 'interviewer' ? '🤖 AI' : '👤 You'}
            </span>
            <p className="practice-chat__text">{entry.text}</p>
          </div>
        ))}

        {/* Live partial — shows text currently being spoken/transcribed */}
        {livePartial && !isControlMessage(livePartial.text) && (
          <div
            className={`practice-chat__bubble practice-chat__bubble--${livePartial.role} practice-chat__bubble--live`}
            data-testid="practice-bubble-live"
          >
            <span className="practice-chat__role">
              {livePartial.role === 'interviewer' ? '🤖 AI' : '👤 You'}
            </span>
            <p className="practice-chat__text">{livePartial.text}</p>
          </div>
        )}
      </div>

      <style>{`
        .practice-chat {
          flex: 1;
          min-height: 0;
          display: flex;
          flex-direction: column;
          gap: 0;
          background-color: var(--color-tile-bg, #1C1C1E);
          border-radius: 8px;
          overflow: hidden;
        }

        .practice-chat__status {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 10px 16px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.06);
        }

        .practice-chat__dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background-color: var(--color-text-secondary, #A0A0A5);
          transition: background-color 0.2s;
        }

        .practice-chat__dot--active {
          background-color: var(--color-accent, #9AE05C);
          animation: dot-pulse 1s ease-in-out infinite;
        }

        @keyframes dot-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }

        .practice-chat__status-label {
          font-size: 12px;
          color: var(--color-text-secondary, #A0A0A5);
        }

        .practice-chat__log {
          flex: 1;
          min-height: 0;
          overflow-y: auto;
          padding: 12px 16px;
          display: flex;
          flex-direction: column;
          gap: 10px;
        }

        .practice-chat__bubble {
          display: flex;
          flex-direction: column;
          gap: 4px;
          max-width: 85%;
          padding: 10px 14px;
          border-radius: 12px;
          font-size: 13px;
          line-height: 1.5;
          word-wrap: break-word;
        }

        .practice-chat__bubble--interviewer {
          align-self: flex-start;
          background-color: var(--color-control-bar, #2C2C2E);
        }

        .practice-chat__bubble--user {
          align-self: flex-end;
          background-color: rgba(154, 224, 92, 0.12);
        }

        .practice-chat__bubble--live {
          opacity: 0.7;
          border: 1px dashed var(--color-text-secondary, #A0A0A5);
        }

        .practice-chat__role {
          font-size: 11px;
          color: var(--color-text-secondary, #A0A0A5);
          font-weight: 500;
        }

        .practice-chat__text {
          margin: 0;
          color: var(--color-text-primary, #FFFFFF);
        }
      `}</style>
    </div>
  );
}
