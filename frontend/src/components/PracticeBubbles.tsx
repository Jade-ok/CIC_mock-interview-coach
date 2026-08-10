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
 * Shows interviewer transcript entries as chat bubbles. The in-progress
 * (not-yet-committed) live text from useSubtitleSync is appended to the
 * TAIL of the most recent bubble rather than rendered as a second,
 * separate bubble.
 *
 * Why: Nova Sonic often has the full text of a sentence ready well before
 * it finishes being spoken, so the throttled live reveal can look like a
 * complete sentence while the "official" (committed) bubble is still
 * catching up. Rendering that as its own bubble reads as a duplicate of
 * the same sentence. Appending it inline to the growing bubble instead
 * means there's only ever ONE bubble per turn, and committing a chunk
 * (FINAL) is a no-op visually — the text was already showing.
 *
 * The one case that needs a distinct bubble: the very start of a new AI
 * turn, before its first chunk has committed. At that point there's no
 * bubble yet to append to (the last bubble belongs to the previous
 * question), so the live text renders as its own (dashed) bubble until
 * the first chunk commits.
 *
 * Filters out control/metadata entries (e.g. raw JSON like {"interrupted":true})
 * that Nova Sonic may emit as text_output events.
 */

/** Detects entries that are raw JSON control messages rather than spoken text */
function isControlMessage(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return false;
  try {
    const parsed = JSON.parse(trimmed);
    return typeof parsed === 'object' && parsed !== null;
  } catch {
    return false;
  }
}

function joinWithSpace(a: string, b: string): string {
  if (!a) return b;
  if (!b) return a;
  const needsSpace = !a.endsWith(' ') && !b.startsWith(' ');
  return a + (needsSpace ? ' ' : '') + b;
}

export function PracticeBubbles({ transcript, livePartial, turnState }: PracticeBubblesProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Tracks whether the CURRENT AI turn has committed at least one chunk yet.
  // True whenever turnState isn't 'ai_speaking' (nothing to append to —
  // either idle or between turns), and flips false the moment a transcript
  // entry lands while genuinely mid-turn. While true, live text can't be
  // appended to any existing bubble, so it renders as its own bubble.
  //
  // IMPORTANT: this is keyed off turnState being NOT ai_speaking (not off
  // "just transitioned into ai_speaking"), because text_output events for
  // a new turn can arrive slightly BEFORE the audio_output event that
  // flips turnState to 'ai_speaking'. If freshness were only set at that
  // transition, the new turn's incoming text would briefly glue onto the
  // previous turn's bubble in that gap before snapping into its own
  // bubble once turnState catches up — a visible flash-then-detach.
  const freshTurnRef = useRef(turnState !== 'ai_speaking');
  const prevTranscriptLengthRef = useRef(transcript.length);

  if (turnState !== 'ai_speaking') {
    freshTurnRef.current = true;
  }

  if (transcript.length !== prevTranscriptLengthRef.current) {
    // A chunk committed (or transcript was reset) while genuinely
    // mid-turn — the next bubble to grow, if any, already exists now.
    freshTurnRef.current = false;
    prevTranscriptLengthRef.current = transcript.length;
  }

  // Auto-scroll to bottom when new entries arrive or live partial updates
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [transcript.length, livePartial]);

  // Filter out control/JSON messages and user entries from display (AI only)
  const displayEntries = transcript.filter(
    (entry) => entry.role === 'interviewer' && !isControlMessage(entry.text)
  );

  const hasLiveText =
    !!livePartial && livePartial.role === 'interviewer' && !isControlMessage(livePartial.text);

  // Append live text to the tail of the last bubble UNLESS this AI turn
  // hasn't committed anything yet (no bubble to append to).
  const appendLiveToLast = hasLiveText && displayEntries.length > 0 && !freshTurnRef.current;
  const showLiveAsOwnBubble = hasLiveText && !appendLiveToLast;

  return (
    <div className="practice-chat" data-testid="practice-bubbles">
      {/* Compact status indicator */}
      <div className="practice-chat__status" data-testid="practice-chat-status">
        <span className={`practice-chat__dot ${turnState === 'ai_speaking' ? 'practice-chat__dot--active' : ''}`} />
        <span className="practice-chat__status-label">
          {turnState === 'ended' ? 'Interview complete' : turnState === 'ai_speaking' ? 'AI speaking\u2026' : turnState === 'user_turn' ? 'Your turn' : 'Waiting\u2026'}
        </span>
      </div>

      {/* Chat log */}
      <div className="practice-chat__log" ref={scrollRef} data-testid="practice-chat-log">
        {displayEntries.map((entry, index) => {
          const isLast = index === displayEntries.length - 1;
          const displayText =
            isLast && appendLiveToLast ? joinWithSpace(entry.text, livePartial!.text) : entry.text;

          return (
            <div
              key={`${entry.timestamp}-${index}`}
              className="practice-chat__bubble practice-chat__bubble--interviewer"
              data-testid="practice-bubble-interviewer"
            >
              <span className="practice-chat__role">{'\ud83e\udd16'} AI</span>
              <p className="practice-chat__text">{displayText}</p>
            </div>
          );
        })}

        {/* Only rendered when the current AI turn hasn't committed a chunk
            yet — there's no existing bubble to append the live text to. */}
        {showLiveAsOwnBubble && (
          <div
            className="practice-chat__bubble practice-chat__bubble--interviewer practice-chat__bubble--live"
            data-testid="practice-bubble-live"
          >
            <span className="practice-chat__role">{'\ud83e\udd16'} AI</span>
            <p className="practice-chat__text">{livePartial!.text}</p>
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
          width: 100%;
          padding: 12px 16px;
          border-radius: 12px;
          font-size: 15px;
          line-height: 1.5;
          word-wrap: break-word;
        }

        .practice-chat__bubble--interviewer {
          align-self: flex-start;
          background-color: var(--color-control-bar, #2C2C2E);
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