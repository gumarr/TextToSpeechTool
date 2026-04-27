/**
 * src/components/PdfViewer.tsx
 *
 * Renders the current PDF page as an image (fetched from the Python backend).
 * Supports zoom controls and keyboard navigation.
 */

import { useEffect, useRef, useState } from "react";
import { useAppStore } from "../store/appStore";
import { getPageImage } from "../store/apiClient";
import clsx from "clsx";

export function PdfViewer() {
  const { document: pdf, currentPage, zoom, setZoom, goToNextPage, goToPrevPage } =
    useAppStore();

  const [imageB64, setImageB64] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // ── Fetch page image whenever document/page changes ───────────────────
  useEffect(() => {
    if (!pdf) {
      setImageB64(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    // DPI scales with zoom: 150 dpi base * (zoom/100)
    const dpi = Math.round(150 * (zoom / 100));

    getPageImage(pdf.filePath, currentPage, Math.min(dpi, 300))
      .then((img) => {
        if (!cancelled) {
          setImageB64(img.imageB64);
          setLoading(false);
        }
      })
      .catch((err: Error) => {
        if (!cancelled) {
          setError(err.message);
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [pdf, currentPage, zoom]);

  // ── Keyboard navigation ────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === "ArrowDown") goToNextPage();
      if (e.key === "ArrowLeft" || e.key === "ArrowUp") goToPrevPage();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [goToNextPage, goToPrevPage]);

  // ── Empty state ────────────────────────────────────────────────────────
  if (!pdf) {
    return (
      <div className="pdf-viewport items-center justify-center">
        <div className="flex flex-col items-center gap-4 text-center">
          {/* Large PDF icon */}
          <div className="w-24 h-24 rounded-2xl bg-[--color-bg-elevated] flex items-center justify-center">
            <svg
              className="w-12 h-12 text-[--color-text-muted]"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <p className="text-[--color-text-secondary] text-base">
            No PDF open
          </p>
          <p className="text-[--color-text-muted] text-sm max-w-xs">
            Click{" "}
            <kbd className="px-1.5 py-0.5 rounded bg-[--color-bg-elevated] text-xs font-mono">
              Open PDF
            </kbd>{" "}
            in the sidebar to get started.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="pdf-viewport flex-col" ref={containerRef}>
      {/* ── Toolbar ───────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 mb-4 w-full max-w-4xl">
        {/* Page navigation */}
        <button
          id="viewer-prev-page"
          className="btn-ghost"
          onClick={goToPrevPage}
          disabled={currentPage <= 1}
        >
          ← Prev
        </button>

        <span className="text-sm text-[--color-text-secondary] flex-1 text-center">
          Page {currentPage} / {pdf.pageCount}
        </span>

        <button
          id="viewer-next-page"
          className="btn-ghost"
          onClick={goToNextPage}
          disabled={currentPage >= pdf.pageCount}
        >
          Next →
        </button>

        {/* Zoom controls */}
        <div className="flex items-center gap-1 ml-4">
          <button
            id="viewer-zoom-out"
            className="btn-ghost px-2"
            onClick={() => setZoom(Math.max(50, zoom - 25))}
          >
            −
          </button>
          <span className="text-xs text-[--color-text-muted] w-12 text-center">
            {zoom}%
          </span>
          <button
            id="viewer-zoom-in"
            className="btn-ghost px-2"
            onClick={() => setZoom(Math.min(300, zoom + 25))}
          >
            +
          </button>
          <button
            id="viewer-zoom-fit"
            className="btn-ghost text-xs"
            onClick={() => setZoom(100)}
          >
            Fit
          </button>
        </div>
      </div>

      {/* ── Page image ────────────────────────────────────────────────── */}
      <div
        className={clsx(
          "rounded-xl shadow-2xl overflow-hidden bg-white",
          "transition-opacity duration-200",
          loading && "opacity-40"
        )}
        style={{ maxWidth: `${zoom}%` }}
      >
        {error ? (
          <div className="p-8 text-error text-sm">Error: {error}</div>
        ) : imageB64 ? (
          <img
            src={`data:image/png;base64,${imageB64}`}
            alt={`Page ${currentPage}`}
            className="block w-full h-auto selectable"
            draggable={false}
          />
        ) : (
          <div className="w-full h-[800px] flex items-center justify-center bg-[--color-bg-elevated]">
            <span className="text-[--color-text-muted] text-sm animate-pulse">
              Rendering page…
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
