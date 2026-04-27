/**
 * src/components/CrashBanner.tsx
 *
 * Shows a persistent error banner when the Python sidecar crashes unexpectedly.
 * Displayed above all content (below the titlebar).
 */

import { useAppStore } from "../store/appStore";

export function CrashBanner() {
  const { pythonCrashed, setPythonCrashed } = useAppStore();

  if (!pythonCrashed) return null;

  return (
    <div
      role="alert"
      className="flex items-center gap-3 px-4 py-2.5 bg-red-900/60 border-b border-red-700 text-red-200 text-sm"
    >
      {/* Error icon */}
      <svg
        className="w-4 h-4 text-red-400 flex-shrink-0"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
        />
      </svg>

      <span className="flex-1">
        The PDF processing backend crashed unexpectedly. PDF and TTS features
        are unavailable. Please restart the application.
      </span>

      <button
        id="crash-banner-dismiss"
        onClick={() => setPythonCrashed(false)}
        className="text-red-400 hover:text-red-200 transition-colors ml-2"
        aria-label="Dismiss"
      >
        ✕
      </button>
    </div>
  );
}
