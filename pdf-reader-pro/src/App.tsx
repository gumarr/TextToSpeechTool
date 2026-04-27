/**
 * src/App.tsx — Root application component
 *
 * Responsibilities:
 *  - Listen for the Python port from the main process (once on mount)
 *  - Render the main layout (sidebar + PDF viewer + subtitle panel + TTS controls)
 *  - Handle Python crash notifications
 *  - Own the shared audioRef so TtsControls and SubtitleDisplay can both access it
 */

import { useEffect, useRef } from "react";
import { useAppStore } from "./store/appStore";
import { Sidebar } from "./components/Sidebar";
import { PdfViewer } from "./components/PdfViewer";
import { TtsControls } from "./components/TtsControls";
import { Titlebar } from "./components/Titlebar";
import { CrashBanner } from "./components/CrashBanner";
import { SubtitleDisplay } from "./components/SubtitleDisplay";

export default function App() {
  const { setPythonPort, setPythonCrashed, wordBoundaries, currentPageText, setCurrentTimeMs } =
    useAppStore();

  // Lifted-up audio ref: shared between TtsControls (plays audio) and the seek handler
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    // ── Receive Python port from main process ─────────────────────────────
    // main.ts sends this once via mainWindow.webContents.send("python:port", port)
    // right after the window is ready-to-show.
    const cleanupPort = window.electronAPI.onPythonPort((port) => {
      console.log(`[App] Python backend ready on port ${port}`);
      setPythonPort(port);
    });

    // ── Listen for unexpected Python crashes ──────────────────────────────
    const cleanupCrash = window.electronAPI.onPythonCrash((code) => {
      console.error(`[App] Python crashed with exit code ${code}`);
      setPythonCrashed(true);
    });

    // Also fetch the port in case we missed the push event (e.g. hot reload)
    window.electronAPI.getPythonPort().then((port) => {
      if (port !== null) setPythonPort(port);
    });

    return () => {
      cleanupPort();
      cleanupCrash();
    };
  }, [setPythonPort, setPythonCrashed]);

  // Seek handler: moves audio.currentTime and immediately syncs the store
  const handleSeek = (ms: number) => {
    if (audioRef.current) {
      audioRef.current.currentTime = ms / 1000;
      setCurrentTimeMs(ms);
    }
  };

  const showSubtitles = wordBoundaries.length > 0 || currentPageText.length > 0;

  return (
    <div className="app-shell">
      {/* Custom frameless titlebar */}
      <Titlebar />

      {/* Crash notification banner */}
      <CrashBanner />

      <div className="app-body">
        {/* Left sidebar: file list + navigation */}
        <Sidebar />

        {/* Main area: PDF canvas + subtitle panel + TTS controls */}
        <main className="app-main">
          {/* ── Split layout: PDF viewer (top) + Subtitle panel (bottom) ── */}
          <div className="content-split">
            {/* Top 60%: image-based PDF renderer — unchanged */}
            <div className="content-split__pdf">
              <PdfViewer />
            </div>

            {/* Bottom 40%: word-by-word subtitle display */}
            {showSubtitles && (
              <div className="content-split__subtitles">
                <SubtitleDisplay
                  text={currentPageText}
                  wordBoundaries={wordBoundaries}
                  onSeek={handleSeek}
                />
              </div>
            )}
          </div>

          {/* TTS control bar at the very bottom */}
          <TtsControls audioRef={audioRef} />
        </main>
      </div>
    </div>
  );
}
