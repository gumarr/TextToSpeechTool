/**
 * src/App.tsx — Root application component
 *
 * Responsibilities:
 *  - Listen for the Python port from the main process (once on mount)
 *  - Render the main layout (sidebar + PDF viewer + TTS controls)
 *  - Handle Python crash notifications
 */

import { useEffect } from "react";
import { useAppStore } from "./store/appStore";
import { Sidebar } from "./components/Sidebar";
import { PdfViewer } from "./components/PdfViewer";
import { TtsControls } from "./components/TtsControls";
import { Titlebar } from "./components/Titlebar";
import { CrashBanner } from "./components/CrashBanner";

export default function App() {
  const { setPythonPort, setPythonCrashed } = useAppStore();

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

  return (
    <div className="app-shell">
      {/* Custom frameless titlebar */}
      <Titlebar />

      {/* Crash notification banner */}
      <CrashBanner />

      <div className="app-body">
        {/* Left sidebar: file list + navigation */}
        <Sidebar />

        {/* Main area: PDF canvas + TTS controls */}
        <main className="app-main">
          <PdfViewer />
          <TtsControls />
        </main>
      </div>
    </div>
  );
}
