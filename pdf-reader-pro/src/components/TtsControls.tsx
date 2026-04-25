/**
 * src/components/TtsControls.tsx
 *
 * Bottom bar with TTS controls:
 *  - Voice selector
 *  - Rate / volume sliders
 *  - Play / Stop button
 *  - Save audio button
 *
 * Audio is streamed from the Python backend and played via a hidden <audio> element.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useAppStore } from "../store/appStore";
import { listVoices, getPageText, streamTts, saveTts } from "../store/apiClient";
import clsx from "clsx";

export function TtsControls() {
  const {
    document: pdf,
    currentPage,
    selectedVoice,
    ttsRate,
    ttsVolume,
    isSpeaking,
    ttsVoices,
    setTtsVoices,
    setSelectedVoice,
    setTtsRate,
    setTtsVolume,
    setIsSpeaking,
    pythonPort,
  } = useAppStore();

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [expanded, setExpanded] = useState(false);

  // ── Load voices on mount ──────────────────────────────────────────────
  useEffect(() => {
    if (!pythonPort || ttsVoices.length > 0) return;
    listVoices()
      .then(setTtsVoices)
      .catch((err) => console.error("Failed to load voices:", err));
  }, [pythonPort, ttsVoices.length, setTtsVoices]);

  // ── Cleanup audio on unmount ──────────────────────────────────────────
  useEffect(() => {
    return () => {
      audioRef.current?.pause();
    };
  }, []);

  // ── Speak current page ────────────────────────────────────────────────
  const handleSpeak = useCallback(async () => {
    if (!pdf || isSpeaking) return;

    try {
      const pageText = await getPageText(pdf.filePath, currentPage);
      if (!pageText.text) return;

      // Stop any previous audio
      if (audioRef.current) {
        audioRef.current.pause();
        URL.revokeObjectURL(audioRef.current.src);
      }

      setIsSpeaking(true);

      // Stream audio from backend
      const response = await streamTts(
        pageText.text,
        selectedVoice,
        ttsRate,
        ttsVolume
      );

      // Convert streaming response to Blob URL for <audio>
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);

      const audio = new Audio(url);
      audioRef.current = audio;

      audio.onended = () => {
        setIsSpeaking(false);
        URL.revokeObjectURL(url);
      };

      audio.onerror = () => {
        setIsSpeaking(false);
        URL.revokeObjectURL(url);
        console.error("Audio playback error");
      };

      await audio.play();
    } catch (err) {
      console.error("TTS error:", err);
      setIsSpeaking(false);
    }
  }, [pdf, currentPage, isSpeaking, selectedVoice, ttsRate, ttsVolume, setIsSpeaking]);

  // ── Stop speaking ─────────────────────────────────────────────────────
  const handleStop = useCallback(() => {
    audioRef.current?.pause();
    setIsSpeaking(false);
  }, [setIsSpeaking]);

  // ── Save audio to file ────────────────────────────────────────────────
  const handleSave = useCallback(async () => {
    if (!pdf) return;

    const outputDir = await window.electronAPI.openDirectoryPicker();
    if (!outputDir) return;

    const pageText = await getPageText(pdf.filePath, currentPage);
    if (!pageText.text) return;

    const outputPath = `${outputDir}/page-${currentPage}.mp3`;

    try {
      const result = await saveTts(
        pageText.text,
        selectedVoice,
        ttsRate,
        ttsVolume,
        outputPath
      );
      console.log(`Saved ${result.sizeBytes} bytes to ${result.saved}`);
      await window.electronAPI.openInExplorer(result.saved);
    } catch (err) {
      console.error("Save TTS error:", err);
    }
  }, [pdf, currentPage, selectedVoice, ttsRate, ttsVolume]);

  return (
    <div className="tts-bar">
      {/* ── Speak / Stop button ──────────────────────────────────────── */}
      {isSpeaking ? (
        <button
          id="tts-stop"
          onClick={handleStop}
          className="btn-primary bg-red-600 hover:bg-red-500 flex-shrink-0"
        >
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
            <rect x="6" y="6" width="12" height="12" rx="2" />
          </svg>
          Stop
        </button>
      ) : (
        <button
          id="tts-speak"
          onClick={handleSpeak}
          disabled={!pdf || !pythonPort}
          className="btn-primary flex-shrink-0"
        >
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
            <path d="M8 5v14l11-7L8 5z" />
          </svg>
          Read Page
        </button>
      )}

      {/* ── Voice selector ────────────────────────────────────────────── */}
      <select
        id="tts-voice-select"
        value={selectedVoice}
        onChange={(e) => setSelectedVoice(e.target.value)}
        className="input-base max-w-[200px] flex-shrink-0"
      >
        {ttsVoices.length === 0 ? (
          <option value={selectedVoice}>{selectedVoice}</option>
        ) : (
          ttsVoices.map((v) => (
            <option key={v.shortName} value={v.shortName}>
              {v.shortName}
            </option>
          ))
        )}
      </select>

      {/* ── Rate slider ───────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 flex-shrink-0">
        <span className="text-xs text-[--color-text-muted]">Speed</span>
        <input
          id="tts-rate-slider"
          type="range"
          min={-50}
          max={50}
          step={5}
          value={parseInt(ttsRate)}
          onChange={(e) =>
            setTtsRate(
              `${parseInt(e.target.value) >= 0 ? "+" : ""}${e.target.value}%`
            )
          }
          className="w-24 accent-indigo-500"
          title={`Rate: ${ttsRate}`}
        />
        <span className="text-xs text-[--color-text-muted] w-10">
          {ttsRate}
        </span>
      </div>

      {/* ── Save button ───────────────────────────────────────────────── */}
      <button
        id="tts-save"
        onClick={handleSave}
        disabled={!pdf || !pythonPort}
        className="btn-ghost flex-shrink-0 ml-auto"
        title="Save page audio as MP3"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
        </svg>
        Save MP3
      </button>
    </div>
  );
}
