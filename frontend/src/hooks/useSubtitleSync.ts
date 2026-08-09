/**
 * useSubtitleSync — throttles subtitle display to match audio playback pace.
 *
 * Problem: Nova Sonic generates text much faster than audio. PARTIAL events
 * accumulate the full response before the first sentence finishes playing.
 * Showing all text immediately reveals future sentences, and any later
 * correction (clearing, splitting) causes text to disappear or rearrange.
 *
 * Solution: Buffer the full accumulated text internally, but only reveal
 * characters at a rate synchronized with audio playback progress.
 *
 * Key invariant: visible text ONLY GROWS. Characters never disappear,
 * merge, or reorder once shown.
 */

import { useRef, useEffect, useState } from 'react';
import type { AudioManager } from '@/services/audioManager';

export interface UseSubtitleSyncOptions {
  /** The raw accumulated livePartial from state (may jump ahead of audio) */
  livePartial: { role: 'interviewer' | 'user'; text: string } | null;
  /** AudioManager ref for reading playback progress */
  audioManagerRef: React.RefObject<AudioManager | null>;
  /** Current turn state — controls reveal behavior */
  turnState: string;
}

export interface SubtitleSyncResult {
  /** Throttled text safe to display — only grows, never shrinks */
  syncedPartial: { role: 'interviewer' | 'user'; text: string } | null;
}

/**
 * Fallback reveal rate when no audio data is available (text-only mode).
 * ~150 WPM = 2.5 words/sec ≈ 15 chars/sec. Slightly generous.
 */
const FALLBACK_CHARS_PER_SECOND = 16;

export function useSubtitleSync({
  livePartial,
  audioManagerRef,
  turnState,
}: UseSubtitleSyncOptions): SubtitleSyncResult {
  // The revealed character count — monotonically increases within a turn
  const revealedCountRef = useRef(0);
  const revealRoleRef = useRef<string | null>(null);
  const revealStartTimeRef = useRef(0);

  // State that drives re-renders
  const [syncedPartial, setSyncedPartial] = useState<SubtitleSyncResult['syncedPartial']>(null);

  const rafRef = useRef<number>(0);

  // Track the previous livePartial to detect transitions
  const prevLivePartialRef = useRef(livePartial);

  useEffect(() => {
    const prev = prevLivePartialRef.current;
    prevLivePartialRef.current = livePartial;

    if (!livePartial && prev) {
      // FINAL was committed — the full text is now in transcript.
      // Before resetting, ensure no text is lost: if there was unrevealed
      // buffered text, it doesn't matter because FINAL contains the
      // authoritative text and it's already in the transcript array.
      // Just cleanly reset for the next segment.
      revealedCountRef.current = 0;
      revealRoleRef.current = null;
      revealStartTimeRef.current = 0;
      setSyncedPartial(null);
      return;
    }

    if (!livePartial) {
      return;
    }

    if (livePartial.role !== revealRoleRef.current) {
      // New role — reset
      revealedCountRef.current = 0;
      revealRoleRef.current = livePartial.role;
      revealStartTimeRef.current = performance.now();
    }
  }, [livePartial?.role, !livePartial]);

  // Animation loop: reveal characters at audio pace.
  // Runs whenever there's text to reveal. When AI is no longer speaking,
  // immediately reveals all remaining text (flush) to prevent truncation.
  useEffect(() => {
    if (!livePartial) {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = 0;
      }
      return;
    }

    // If AI is no longer speaking but we still have unrevealed text, flush it all
    if (turnState !== 'ai_speaking') {
      const buffer = livePartial.text;
      if (buffer.length > revealedCountRef.current) {
        revealedCountRef.current = buffer.length;
        setSyncedPartial({ role: livePartial.role, text: buffer });
      }
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = 0;
      }
      return;
    }

    if (revealStartTimeRef.current === 0) {
      revealStartTimeRef.current = performance.now();
    }

    const tick = () => {
      const buffer = livePartial?.text ?? '';
      const totalChars = buffer.length;

      if (totalChars === 0) {
        rafRef.current = requestAnimationFrame(tick);
        return;
      }

      let targetCount: number;

      const am = audioManagerRef.current;
      if (am) {
        const played = am.getPlayedDuration();
        const total = am.getTotalEnqueuedDuration();

        if (total > 0 && played > 0) {
          // Audio-proportional reveal with a small lead (~0.5s of text)
          // so subtitles appear slightly before the word is spoken
          const ratio = Math.min(1, (played + 0.5) / total);
          targetCount = Math.ceil(ratio * totalChars);
        } else {
          // Audio scheduled but not playing yet, or no audio — time-based
          const elapsed = (performance.now() - revealStartTimeRef.current) / 1000;
          targetCount = Math.ceil(elapsed * FALLBACK_CHARS_PER_SECOND);
        }
      } else {
        const elapsed = (performance.now() - revealStartTimeRef.current) / 1000;
        targetCount = Math.ceil(elapsed * FALLBACK_CHARS_PER_SECOND);
      }

      // Never go backwards — only grow
      const newCount = Math.max(revealedCountRef.current, Math.min(targetCount, totalChars));

      if (newCount > revealedCountRef.current) {
        revealedCountRef.current = newCount;
        setSyncedPartial({
          role: livePartial!.role,
          text: buffer.slice(0, newCount),
        });
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = 0;
      }
    };
  }, [turnState, livePartial, audioManagerRef]);

  return { syncedPartial };
}
