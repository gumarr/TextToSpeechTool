/**
 * src/components/Titlebar.tsx
 *
 * Custom frameless titlebar that replaces the OS chrome.
 * The outer <div> has -webkit-app-region: drag (set via .app-titlebar in CSS)
 * so users can drag the window from it.
 */

import { useEffect, useState } from "react";
import { useAppStore } from "../store/appStore";
import clsx from "clsx";

export function Titlebar() {
  const { document: pdf, isDarkMode, setDarkMode } = useAppStore();
  const [appVersion, setAppVersion] = useState<string>("");

  useEffect(() => {
    window.electronAPI.getAppVersion().then(setAppVersion);
    // Sync initial theme
    window.electronAPI.getTheme().then(setDarkMode);
  }, [setDarkMode]);

  const handleThemeToggle = async () => {
    const dark = await window.electronAPI.toggleTheme();
    setDarkMode(dark);
    // Apply/remove "dark" class on <html> for Tailwind dark mode
    document.documentElement.classList.toggle("dark", dark);
  };

  const title = pdf?.title
    ? `${pdf.title} — PDF Reader Pro`
    : "PDF Reader Pro";

  return (
    <div className="app-titlebar">
      {/* App icon + name */}
      <div className="flex items-center gap-2 flex-1">
        {/* Logo glyph */}
        <svg
          className="w-5 h-5 text-indigo-400 flex-shrink-0"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
          />
        </svg>

        <span className="text-sm font-semibold text-[--color-text-primary] truncate max-w-[400px]">
          {title}
        </span>

        {appVersion && (
          <span className="text-xs text-[--color-text-muted] ml-1">
            v{appVersion}
          </span>
        )}
      </div>

      {/* Theme toggle — must have -webkit-app-region: no-drag (set via .app-titlebar button) */}
      <button
        id="titlebar-theme-toggle"
        onClick={handleThemeToggle}
        className={clsx(
          "p-1.5 rounded-md transition-colors",
          "text-[--color-text-secondary] hover:text-[--color-text-primary]",
          "hover:bg-[--color-bg-hover]"
        )}
        title={isDarkMode ? "Switch to light mode" : "Switch to dark mode"}
      >
        {isDarkMode ? (
          // Sun icon
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1m0 16v1M4.22 4.22l.707.707M18.364 18.364l.707.707M3 12H4m16 0h1M4.22 19.778l.707-.707M18.364 5.636l.707-.707M12 8a4 4 0 100 8 4 4 0 000-8z" />
          </svg>
        ) : (
          // Moon icon
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
          </svg>
        )}
      </button>
    </div>
  );
}
