/**
 * src/components/Sidebar.tsx
 *
 * Left sidebar containing:
 *  - Open file button
 *  - List of recently opened PDFs (document info)
 *  - Table of contents (if available)
 *  - Page navigation
 */

import { useCallback } from "react";
import { useAppStore } from "../store/appStore";
import { openPdf, getToc } from "../store/apiClient";
import clsx from "clsx";

export function Sidebar() {
  const {
    document: pdf,
    toc,
    currentPage,
    setDocument,
    setToc,
    setCurrentPage,
    pythonPort,
  } = useAppStore();

  const handleOpenFile = useCallback(async () => {
    const paths = await window.electronAPI.openFilePicker();
    if (!paths.length) return;

    const filePath = paths[0]; // open first selected file
    try {
      const doc = await openPdf(filePath);
      setDocument(doc);

      // Fetch TOC in parallel
      const entries = await getToc(filePath);
      setToc(entries);
    } catch (err) {
      console.error("Failed to open PDF:", err);
      // TODO: Show toast notification
    }
  }, [setDocument, setToc]);

  return (
    <aside className="app-sidebar">
      {/* Open file button */}
      <div className="p-3 border-b border-[--color-border]">
        <button
          id="sidebar-open-file"
          onClick={handleOpenFile}
          disabled={pythonPort === null}
          className="btn-primary w-full justify-center"
        >
          {/* Upload icon */}
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 16V4m0 0L8 8m4-4l4 4M20 20H4" />
          </svg>
          Open PDF
        </button>
      </div>

      {/* Document info */}
      {pdf && (
        <div className="px-4 py-3 border-b border-[--color-border]">
          <p className="text-sm font-medium text-[--color-text-primary] truncate">
            {pdf.title ?? pdf.filePath.split(/[\\/]/).pop()}
          </p>
          {pdf.author && (
            <p className="text-xs text-[--color-text-secondary] mt-0.5 truncate">
              {pdf.author}
            </p>
          )}
          <p className="text-xs text-[--color-text-muted] mt-1">
            {pdf.pageCount} {pdf.pageCount === 1 ? "page" : "pages"}
          </p>
        </div>
      )}

      {/* Table of contents */}
      {toc.length > 0 && (
        <div className="flex-1 overflow-y-auto">
          <p className="panel-label">Contents</p>
          <ul className="pb-2">
            {toc.map((entry, idx) => (
              <li key={idx}>
                <button
                  id={`toc-entry-${idx}`}
                  onClick={() => setCurrentPage(entry.page)}
                  className={clsx(
                    "w-full text-left px-4 py-1.5 text-sm truncate",
                    "transition-colors duration-150 hover:bg-[--color-bg-hover]",
                    currentPage === entry.page
                      ? "text-indigo-400 font-medium"
                      : "text-[--color-text-secondary]",
                    // Indent based on TOC level
                    entry.level === 2 && "pl-7",
                    entry.level >= 3 && "pl-10"
                  )}
                >
                  {entry.title}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Empty state */}
      {!pdf && (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 p-6 text-center">
          <svg
            className="w-12 h-12 text-[--color-text-muted]"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <p className="text-sm text-[--color-text-muted]">
            Open a PDF to get started
          </p>
        </div>
      )}

      {/* Page number indicator (bottom of sidebar) */}
      {pdf && (
        <div className="p-3 border-t border-[--color-border] flex items-center justify-between">
          <span className="text-xs text-[--color-text-muted]">
            Page {currentPage} of {pdf.pageCount}
          </span>
          <div className="flex gap-1">
            <button
              id="sidebar-prev-page"
              className="btn-ghost p-1"
              onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
              disabled={currentPage <= 1}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <button
              id="sidebar-next-page"
              className="btn-ghost p-1"
              onClick={() => setCurrentPage(Math.min(pdf.pageCount, currentPage + 1))}
              disabled={currentPage >= pdf.pageCount}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        </div>
      )}
    </aside>
  );
}
