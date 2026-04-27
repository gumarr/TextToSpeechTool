/**
 * src/components/SubtitleDisplay.tsx
 *
 * Real-time word-by-word subtitle panel.
 *
 * Performance architecture:
 *  - Segments (word spans) are rendered ONCE when wordBoundaries or text changes.
 *  - Highlighting is applied via direct DOM classList manipulation (no re-render on each tick).
 *  - Auto-scroll scrolls the CONTAINER div only, never the whole page.
 *  - Binary search finds the active word in O(log n).
 *  - Click on any word seeks playback to that word's start time.
 */

import { useEffect, useMemo, useRef } from "react";
import type { WordBoundary } from "../store/apiClient";
import { useAppStore } from "../store/appStore";

interface SubtitleDisplayProps {
  text: string;
  wordBoundaries: WordBoundary[];
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
      return mid;
    } else if (currentTimeMs < w.start_ms) {
      hi = mid - 1;
    } else {
      lo = mid + 1;
    }
  }

  return -1;
}

// ── Build a render plan ───────────────────────────────────────────────────────
interface TextSegment {
  type: "plain" | "word";
  content: string;
  wordIndex?: number;
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

    if (char_start > cursor) {
      segments.push({ type: "plain", content: text.slice(cursor, char_start) });
    }

    if (char_end > char_start) {
      segments.push({
        type: "word",
        content: text.slice(char_start, char_end),
        wordIndex: i,
      });
    }

    cursor = char_end;
  }

  if (cursor < text.length) {
    segments.push({ type: "plain", content: text.slice(cursor) });
  }

  return segments;
}

// ── Component ─────────────────────────────────────────────────────────────────
export function SubtitleDisplay({
  text,
  wordBoundaries,
  onSeek,
}: SubtitleDisplayProps) {
  // Refs to word span DOM nodes — populated during render
  const wordSpanRefs = useRef<(HTMLSpanElement | null)[]>([]);
  // Ref to the scrollable container — scroll THIS, not the window
  const containerRef = useRef<HTMLDivElement | null>(null);
  // Track previous active index to reset CSS without iterating all words
  const prevActiveIdxRef = useRef<number>(-1);

  // Segments are rebuilt only when text or boundaries change (NOT every frame)
  const segments = useMemo(
    () => buildSegments(text, wordBoundaries),
    [text, wordBoundaries]
  );

  // Reset refs when word count changes
  useEffect(() => {
    wordSpanRefs.current = new Array(wordBoundaries.length).fill(null);
    prevActiveIdxRef.current = -1;
  }, [wordBoundaries.length]);

  // ── Highlight & Scroll via direct DOM mutation & Zustand subscribe ─────────
  // This completely bypasses React's re-render cycle for 60fps playback.
  useEffect(() => {
    const unsub = useAppStore.subscribe((state) => {
      const currentTimeMs = state.currentTimeMs;
      const activeIdx = findActiveWordIndex(wordBoundaries, currentTimeMs);

      if (activeIdx !== prevActiveIdxRef.current) {
        const spans = wordSpanRefs.current;
        
        // Update classes across all spans to handle forward/backward seek reliably
        for (let i = 0; i < spans.length; i++) {
          const span = spans[i];
          if (!span) continue;
          if (i < activeIdx) {
            span.classList.add("word-past");
            span.classList.remove("word-active");
          } else if (i === activeIdx) {
            span.classList.add("word-active");
            span.classList.remove("word-past");
          } else {
            span.classList.remove("word-past", "word-active");
          }
        }
        
        // Auto-scroll
        const span = activeIdx >= 0 ? spans[activeIdx] : null;
        const container = containerRef.current;
        if (span && container) {
          const containerTop = container.getBoundingClientRect().top;
          const spanTop = span.getBoundingClientRect().top;
          const spanCenter = spanTop - containerTop + span.offsetHeight / 2;
          const containerCenter = container.clientHeight / 2;
          const targetScrollTop = container.scrollTop + spanCenter - containerCenter;

          container.scrollTo({ top: targetScrollTop, behavior: "smooth" });
        }

        prevActiveIdxRef.current = activeIdx;
      }
    });

    return unsub;
  }, [wordBoundaries]);

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

  // ── Main render — only re-renders when text/boundaries change ─────────────
  return (
    <div className="subtitle-container selectable" ref={containerRef}>
      <div
        className="subtitle-text"
        aria-live="polite"
        aria-label="Page text with word highlighting"
      >
        {segments.map((seg, segIdx) => {
          if (seg.type === "plain") {
            return (
              <span key={`plain-${segIdx}`} className="subtitle-plain-char">
                {seg.content}
              </span>
            );
          }

          const wIdx = seg.wordIndex!;
          const wb = wordBoundaries[wIdx];

          return (
            <span
              key={`word-${wIdx}`}
              ref={(el) => {
                wordSpanRefs.current[wIdx] = el;
              }}
              className="word-span"
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
