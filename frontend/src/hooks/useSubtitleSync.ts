/**
 * useSubtitleSync — throttles subtitle display to match audio playback pace.
 *
 * Problem: Nova Sonic generates text much faster than audio, AND frequently
 * splits a single AI turn into several FINAL-bounded chunks. This hook only
 * needs to throttle the reveal of the CURRENTLY OPEN (not-yet-committed)
 * chunk — it must NOT re-display text that has already been committed.
 *
 * Why: `APPEND_TRANSCRIPT` (fired on every chunk FINAL) updates the
 * transcript array AND clears `livePartial` in the same reducer call, i.e.
 * the same React render. The permanent chat bubble for that chunk appears
 * in the exact same frame `livePartial` goes null — so there is no visible
 * gap to patch by accumulating old chunk text here. An earlier version of
 * this hook accumulated committed-chunk text into the live caption to avoid
 * a (different, single-tile-caption) blanking bug, but in this multi-bubble
 * chat-log context that just duplicates text: once in the permanent bubble,
 * once in the live/dashed bubble.
 *
 * So: on every `livePartial -> null` transition, just clear the caption.
 * Only the in-flight chunk's own text is throttled/revealed here.
 *
 * Key invariant: within a single chunk's reveal, visible text only grows —
 * it never disappears, merges, or reorders mid-reveal.
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
  /** Throttled text safe to display — only grows, never shrinks within a turn */
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
  // Reveal progress within the CURRENT (still-open, not-yet-committed) chunk.
  const revealedCountRef = useRef(0);
  const revealStartTimeRef = useRef(0);

  const [syncedPartial, setSyncedPartial] = useState<SubtitleSyncResult['syncedPartial']>(null);

  const rafRef = useRef<number>(0);
  const prevLivePartialRef = useRef(livePartial);

  // --- livePartial transitions: chunk start / chunk commit / role change ---
  // IMPORTANT: livePartial is a NEW OBJECT on every incremental PARTIAL
  // update (reducer creates `{ role, text: prev + incoming }` each time),
  // so this effect must NOT depend on the object itself — only on the
  // signals that actually mean "a new chunk started": role changing, or
  // going from null -> non-null. Depending on `livePartial` directly would
  // reset revealedCountRef/revealStartTimeRef on every single character
  // update, which visibly shrinks the caption and restarts the typing
  // animation from scratch mid-sentence.
  useEffect(() => {
    const prev = prevLivePartialRef.current;
    prevLivePartialRef.current = livePartial;

    if (!livePartial && prev) {
      // Chunk committed (FINAL). The permanent chat bubble for this text
      // appeared in the SAME render (see reducer's APPEND_TRANSCRIPT), so
      // simply clearing here does not create a visible gap — it hands off
      // to the bubble that's already on screen.
      setSyncedPartial(null);
      revealedCountRef.current = 0;
      revealStartTimeRef.current = 0;
      return;
    }

    if (!livePartial) {
      return;
    }

    if (!prev || prev.role !== livePartial.role) {
      // Genuinely new chunk (first PARTIAL after a commit) or a role
      // change — reveal begins from empty for this chunk's own text.
      revealedCountRef.current = 0;
      revealStartTimeRef.current = performance.now();
    }
    // Otherwise: same ongoing chunk, just more text accumulated — leave
    // revealedCountRef/revealStartTimeRef alone so the reveal continues
    // smoothly instead of restarting.
  }, [livePartial?.role, !livePartial]);

  // --- Reveal loop: types out the CURRENT chunk's own text, paced to audio ---
  useEffect(() => {
    if (!livePartial) {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = 0;
      }
      return;
    }

    if (turnState !== 'ai_speaking') {
      // Not actively speaking — flush the rest of this chunk immediately so
      // nothing is truncated, then stop animating.
      const buffer = livePartial.text;
      if (buffer.length > revealedCountRef.current) {
        revealedCountRef.current = buffer.length;
        setSyncedPartial({
          role: livePartial.role,
          text: buffer,
        });
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
          const elapsed = (performance.now() - revealStartTimeRef.current) / 1000;
          targetCount = Math.ceil(elapsed * FALLBACK_CHARS_PER_SECOND);
        }
      } else {
        const elapsed = (performance.now() - revealStartTimeRef.current) / 1000;
        targetCount = Math.ceil(elapsed * FALLBACK_CHARS_PER_SECOND);
      }

      // Never go backwards within this chunk — only grow
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