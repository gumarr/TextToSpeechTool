/**
 * src/components/SubtitleDisplay.tsx
 *
 * Real-time word-by-word subtitle panel.
 *
 * - Renders the full page text split into character-level spans.
 * - Words covered by a WordBoundary are wrapped in a clickable, highlightable span.
 * - Uses binary search (useMemo) to find the active word from currentTimeMs.
 * - Auto-scrolls the active word into view.
 * - Click on any word to seek playback to that position.
 */

import { useEffect, useMemo, useRef } from "react";
import type { WordBoundary } from "../store/apiClient";

interface SubtitleDisplayProps {
  text: string;
  wordBoundaries: WordBoundary[];
  currentTimeMs: number;
  onSeek: (ms: number) => void;
}

// ── Binary search helper ──────────────────────────────────────────────────────
/**
 * Returns the index of the word where start_ms <= currentTimeMs < end_ms.
 * Returns -1 if no word is active.
 */
function findActiveWordIndex(
  boundaries: WordBoundary[],
  currentTimeMs: number
): number {
  if (boundaries.length === 0) return -1;

  let lo = 0;
  let hi = boundaries.length - 1;

  while (lo <= hi) {
    const mid = (lo + hi) >>> 1;
    const w = boundaries[mid];

    if (currentTimeMs >= w.start_ms && currentTimeMs < w.end_ms) {
      return mid; // playhead is inside this word's window
    } else if (currentTimeMs < w.start_ms) {
      hi = mid - 1;
    } else {
      lo = mid + 1;
    }
  }

  // -1 when playhead is before the first word or between two words
  return -1;
}

// ── Build a render plan ───────────────────────────────────────────────────────
interface TextSegment {
  type: "plain" | "word";
  content: string;
  wordIndex?: number; // index into wordBoundaries (only when type === "word")
}

function buildSegments(
  text: string,
  wordBoundaries: WordBoundary[]
): TextSegment[] {
  if (wordBoundaries.length === 0) {
    return [{ type: "plain", content: text }];
  }

  const segments: TextSegment[] = [];
  let cursor = 0;

  for (let i = 0; i < wordBoundaries.length; i++) {
    const wb = wordBoundaries[i];
    const { char_start, char_end } = wb;

    // Gap before this word
    if (char_start > cursor) {
      segments.push({ type: "plain", content: text.slice(cursor, char_start) });
    }

    // The word itself
    if (char_end > char_start) {
      segments.push({
        type: "word",
        content: text.slice(char_start, char_end),
        wordIndex: i,
      });
    }

    cursor = char_end;
  }

  // Trailing plain text after the last word
  if (cursor < text.length) {
    segments.push({ type: "plain", content: text.slice(cursor) });
  }

  return segments;
}

// ── Component ─────────────────────────────────────────────────────────────────
export function SubtitleDisplay({
  text,
  wordBoundaries,
  currentTimeMs,
  onSeek,
}: SubtitleDisplayProps) {
  const wordSpanRefs = useRef<(HTMLSpanElement | null)[]>([]);

  // Active word via binary search — O(log n), safe to run every rAF tick
  const activeIdx = useMemo(
    () => findActiveWordIndex(wordBoundaries, currentTimeMs),
    [wordBoundaries, currentTimeMs]
  );

  // Build render plan whenever text or boundaries change
  const segments = useMemo(
    () => buildSegments(text, wordBoundaries),
    [text, wordBoundaries]
  );

  // Reset refs array length whenever word boundaries change
  useEffect(() => {
    wordSpanRefs.current = new Array(wordBoundaries.length).fill(null);
  }, [wordBoundaries.length]);

  // Auto-scroll active word into view
  useEffect(() => {
    if (activeIdx >= 0 && wordSpanRefs.current[activeIdx]) {
      wordSpanRefs.current[activeIdx]?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }
  }, [activeIdx]);

  // ── Fallback: no boundaries yet ─────────────────────────────────────────
  if (wordBoundaries.length === 0) {
    return (
      <div className="subtitle-container selectable">
        {text ? (
          <p className="subtitle-plain-text">{text}</p>
        ) : (
          <p className="subtitle-empty">
            Press <strong>Read Page</strong> to start playback with subtitle highlighting.
          </p>
        )}
      </div>
    );
  }

  // ── Main render ──────────────────────────────────────────────────────────
  return (
    <div className="subtitle-container selectable">
      <div className="subtitle-text" aria-live="polite" aria-label="Page text with word highlighting">
        {segments.map((seg, segIdx) => {
          if (seg.type === "plain") {
            return (
              <span key={`plain-${segIdx}`} className="subtitle-plain-char">
                {seg.content}
              </span>
            );
          }

          // Word segment
          const wIdx = seg.wordIndex!;
          const wb = wordBoundaries[wIdx];
          const isActive = wIdx === activeIdx;
          // A word is "past" if the audio has moved beyond its end
          const isPast = wb.end_ms < currentTimeMs && !isActive;

          let cls = "word-span";
          if (isActive) cls += " word-active";
          else if (isPast) cls += " word-past";

          return (
            <span
              key={`word-${wIdx}`}
              ref={(el) => {
                wordSpanRefs.current[wIdx] = el;
              }}
              className={cls}
              data-word-index={wIdx}
              title={`Seek to ${(wb.start_ms / 1000).toFixed(2)}s`}
              onClick={() => onSeek(wb.start_ms)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") onSeek(wb.start_ms);
              }}
            >
              {seg.content}
            </span>
          );
        })}
      </div>
    </div>
  );
}
