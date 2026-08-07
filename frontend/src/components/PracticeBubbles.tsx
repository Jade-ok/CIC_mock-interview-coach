import type { TranscriptEntry } from '@/types/session';

interface PracticeBubblesProps {
  practiceMode: boolean;
  transcript: TranscriptEntry[];
}

/**
 * PracticeBubbles displays interviewer text as speech bubbles when Practice Mode is ON.
 *
 * Rules:
 * - ON: show interviewer transcript entries as bubbles
 * - OFF: hide all bubbles (render nothing)
 * - ON→OFF: existing bubbles immediately removed (React conditional render handles this)
 * - User answers are NEVER shown as bubbles (regardless of Practice Mode)
 */
export function PracticeBubbles({ practiceMode, transcript }: PracticeBubblesProps) {
  if (!practiceMode) {
    return <div className="practice-bubbles practice-bubbles--hidden" data-testid="practice-bubbles" />;
  }

  const interviewerEntries = transcript.filter((entry) => entry.role === 'interviewer');

  return (
    <div className="practice-bubbles" data-testid="practice-bubbles">
      {interviewerEntries.map((entry, index) => (
        <div
          key={`${entry.timestamp}-${index}`}
          className="practice-bubbles__bubble"
          data-testid="practice-bubble"
        >
          {entry.text}
        </div>
      ))}
      <style>{`
        .practice-bubbles {
          min-height: 40px;
          display: flex;
          flex-direction: column;
          gap: 8px;
          padding: 4px 0;
          overflow-y: auto;
          max-height: 120px;
        }

        .practice-bubbles--hidden {
          min-height: 40px;
        }

        .practice-bubbles__bubble {
          background-color: var(--color-control-bar, #2C2C2E);
          color: var(--color-text-primary, #FFFFFF);
          border-radius: 12px;
          padding: 8px 14px;
          font-size: 13px;
          line-height: 1.4;
          max-width: 80%;
          word-wrap: break-word;
        }
      `}</style>
    </div>
  );
}
