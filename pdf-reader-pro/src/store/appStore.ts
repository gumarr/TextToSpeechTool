/**
 * src/store/appStore.ts — Zustand Global State
 *
 * Centralised state for:
 *  - Python backend connection (port, health status)
 *  - Open PDF document info
 *  - UI state (current page, zoom, theme)
 *  - TTS state (voice, rate, playing)
 */

import { create } from "zustand";
import { devtools } from "zustand/middleware";

// ── Types ─────────────────────────────────────────────────────────────────

export interface PdfDocument {
  filePath: string;
  pageCount: number;
  title: string | null;
  author: string | null;
}

export interface TocEntry {
  level: number;
  title: string;
  page: number;
}

export interface VoiceOption {
  shortName: string;
  name: string;
  gender: string;
  locale: string;
}

// ── Store interface ────────────────────────────────────────────────────────

interface AppState {
  // ── Python backend ──────────────────────────────────────────────────────
  pythonPort: number | null;
  pythonCrashed: boolean;
  setPythonPort: (port: number) => void;
  setPythonCrashed: (crashed: boolean) => void;

  // Convenience: base URL for all API calls
  apiBaseUrl: string | null;

  // ── Active document ─────────────────────────────────────────────────────
  document: PdfDocument | null;
  toc: TocEntry[];
  setDocument: (doc: PdfDocument | null) => void;
  setToc: (toc: TocEntry[]) => void;

  // ── Reader state ────────────────────────────────────────────────────────
  currentPage: number;
  zoom: number;           // percentage, e.g. 100 = 100%
  isDarkMode: boolean;
  setCurrentPage: (page: number) => void;
  setZoom: (zoom: number) => void;
  setDarkMode: (dark: boolean) => void;
  goToNextPage: () => void;
  goToPrevPage: () => void;

  // ── TTS ─────────────────────────────────────────────────────────────────
  ttsVoices: VoiceOption[];
  selectedVoice: string;
  ttsRate: string;    // e.g. "+0%"
  ttsVolume: string;  // e.g. "+0%"
  isSpeaking: boolean;
  setTtsVoices: (voices: VoiceOption[]) => void;
  setSelectedVoice: (voice: string) => void;
  setTtsRate: (rate: string) => void;
  setTtsVolume: (vol: string) => void;
  setIsSpeaking: (speaking: boolean) => void;
}

// ── Store implementation ──────────────────────────────────────────────────

export const useAppStore = create<AppState>()(
  // devtools middleware: inspect state in Redux DevTools Chrome extension
  devtools(
    (set, get) => ({
      // ── Python ────────────────────────────────────────────────────────
      pythonPort: null,
      pythonCrashed: false,
      apiBaseUrl: null,

      setPythonPort: (port) =>
        set(
          { pythonPort: port, apiBaseUrl: `http://127.0.0.1:${port}` },
          false,
          "setPythonPort"
        ),

      setPythonCrashed: (crashed) =>
        set({ pythonCrashed: crashed }, false, "setPythonCrashed"),

      // ── Document ──────────────────────────────────────────────────────
      document: null,
      toc: [],
      currentPage: 1,
      zoom: 100,
      isDarkMode: true,

      setDocument: (doc) =>
        set({ document: doc, currentPage: 1, toc: [] }, false, "setDocument"),

      setToc: (toc) => set({ toc }, false, "setToc"),

      setCurrentPage: (page) =>
        set({ currentPage: page }, false, "setCurrentPage"),

      setZoom: (zoom) => set({ zoom }, false, "setZoom"),

      setDarkMode: (dark) => set({ isDarkMode: dark }, false, "setDarkMode"),

      goToNextPage: () => {
        const { currentPage, document } = get();
        if (document && currentPage < document.pageCount) {
          set({ currentPage: currentPage + 1 }, false, "goToNextPage");
        }
      },

      goToPrevPage: () => {
        const { currentPage } = get();
        if (currentPage > 1) {
          set({ currentPage: currentPage - 1 }, false, "goToPrevPage");
        }
      },

      // ── TTS ───────────────────────────────────────────────────────────
      ttsVoices: [],
      selectedVoice: "en-US-AriaNeural",
      ttsRate: "+0%",
      ttsVolume: "+0%",
      isSpeaking: false,

      setTtsVoices: (voices) => set({ ttsVoices: voices }, false, "setTtsVoices"),
      setSelectedVoice: (voice) =>
        set({ selectedVoice: voice }, false, "setSelectedVoice"),
      setTtsRate: (rate) => set({ ttsRate: rate }, false, "setTtsRate"),
      setTtsVolume: (vol) => set({ ttsVolume: vol }, false, "setTtsVolume"),
      setIsSpeaking: (speaking) =>
        set({ isSpeaking: speaking }, false, "setIsSpeaking"),
    }),
    { name: "PDFReaderProStore" } // name shown in Redux DevTools
  )
);
