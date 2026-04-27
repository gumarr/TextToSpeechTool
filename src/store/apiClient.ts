/**
 * src/store/apiClient.ts — Typed API client for the Python FastAPI backend
 *
 * All fetch calls go through these helpers so the base URL (from Zustand)
 * is always injected correctly and errors are handled uniformly.
 */

import { useAppStore } from "./appStore";
import type { PdfDocument, TocEntry, VoiceOption } from "./appStore";

// ── Generic fetch helper ──────────────────────────────────────────────────

async function apiFetch<T>(
  path: string,
  options?: RequestInit
): Promise<T> {
  const baseUrl = useAppStore.getState().apiBaseUrl;
  if (!baseUrl) throw new Error("Python backend is not ready yet");

  const res = await fetch(`${baseUrl}${path}`, options);

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`API error ${res.status}: ${text}`);
  }

  return res.json() as Promise<T>;
}

// ── PDF API ───────────────────────────────────────────────────────────────

export async function openPdf(filePath: string): Promise<PdfDocument> {
  const raw = await apiFetch<{
    file_path: string;
    page_count: number;
    title: string | null;
    author: string | null;
  }>("/pdf/open", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ file_path: filePath }),
  });

  return {
    filePath: raw.file_path,
    pageCount: raw.page_count,
    title: raw.title,
    author: raw.author,
  };
}

export async function getToc(filePath: string): Promise<TocEntry[]> {
  const params = new URLSearchParams({ file_path: filePath });
  return apiFetch<TocEntry[]>(`/pdf/toc?${params}`);
}

export interface PageText {
  page: number;
  text: string;
  wordCount: number;
}

export async function getPageText(
  filePath: string,
  page: number
): Promise<PageText> {
  const params = new URLSearchParams({
    file_path: filePath,
    page: String(page),
  });
  const raw = await apiFetch<{ page: number; text: string; word_count: number }>(
    `/pdf/page/text?${params}`
  );
  return { page: raw.page, text: raw.text, wordCount: raw.word_count };
}

export interface PageImage {
  page: number;
  width: number;
  height: number;
  imageB64: string;
  dpi: number;
}

export async function getPageImage(
  filePath: string,
  page: number,
  dpi = 150
): Promise<PageImage> {
  const params = new URLSearchParams({
    file_path: filePath,
    page: String(page),
    dpi: String(dpi),
  });
  const raw = await apiFetch<{
    page: number;
    width: number;
    height: number;
    image_b64: string;
    dpi: number;
  }>(`/pdf/page/image?${params}`);

  return {
    page: raw.page,
    width: raw.width,
    height: raw.height,
    imageB64: raw.image_b64,
    dpi: raw.dpi,
  };
}

export async function closePdf(filePath: string): Promise<void> {
  const params = new URLSearchParams({ file_path: filePath });
  await apiFetch(`/pdf/close?${params}`, { method: "DELETE" });
}

// ── TTS API ───────────────────────────────────────────────────────────────

export async function listVoices(): Promise<VoiceOption[]> {
  const raw = await apiFetch<
    { short_name: string; name: string; gender: string; locale: string }[]
  >("/tts/voices");

  return raw.map((v) => ({
    shortName: v.short_name,
    name: v.name,
    gender: v.gender,
    locale: v.locale,
  }));
}

/**
 * Returns a fetch Response with the streaming MP3 body.
 * The caller is responsible for piping it to an <audio> element.
 */
export async function streamTts(
  text: string,
  voice: string,
  rate: string,
  volume: string
): Promise<Response> {
  const baseUrl = useAppStore.getState().apiBaseUrl;
  if (!baseUrl) throw new Error("Python backend is not ready yet");

  const res = await fetch(`${baseUrl}/tts/synthesize/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, voice, rate, volume }),
  });

  if (!res.ok) throw new Error(`TTS error ${res.status}`);
  return res;
}

export async function saveTts(
  text: string,
  voice: string,
  rate: string,
  volume: string,
  outputPath: string
): Promise<{ saved: string; sizeBytes: number }> {
  const raw = await apiFetch<{ saved: string; size_bytes: number }>(
    "/tts/synthesize/save",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text,
        voice,
        rate,
        volume,
        output_path: outputPath,
      }),
    }
  );
  return { saved: raw.saved, sizeBytes: raw.size_bytes };
}

// ── TTS Timing API ────────────────────────────────────────────────────────

export interface WordBoundary {
  word: string;
  offset_ms: number;
  duration_ms: number;
  start_ms: number;   // same as offset_ms
  end_ms: number;     // offset_ms + duration_ms
  char_start: number; // position in the full text string
  char_end: number;
}

/**
 * Calls POST /tts/synthesize/timing and enriches each word with char_start / char_end
 * by scanning the original text sequentially, tolerating punctuation attached to words.
 */
export async function getTtsTimingWithCharIndex(
  text: string,
  voice: string,
  rate: string,
  volume: string
): Promise<WordBoundary[]> {
  const baseUrl = useAppStore.getState().apiBaseUrl;
  if (!baseUrl) throw new Error("Python backend is not ready yet");

  const res = await fetch(`${baseUrl}/tts/synthesize/timing`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, voice, rate, volume }),
  });

  if (!res.ok) throw new Error(`TTS timing error ${res.status}`);

  const data = await res.json() as {
    words: { offset_ms: number; duration_ms: number; text: string }[];
    voice: string;
  };

  // Map each timing word back to its position in the original text string.
  // We use a cursor that advances monotonically, stripping leading punctuation/spaces
  // until the word's core characters match.
  let cursor = 0;
  const lowerText = text.toLowerCase();

  return data.words.map((w) => {
    const rawWord = w.text;
    // Strip punctuation from both ends to find the "core" match token.
    const coreWord = rawWord.replace(/^[^\w]+|[^\w]+$/g, "").toLowerCase();

    // Advance cursor past whitespace/punctuation until we find the core word.
    let matchStart = -1;
    let matchEnd = -1;

    for (let i = cursor; i < lowerText.length; i++) {
      if (coreWord.length === 0) {
        // Degenerate: pure-punctuation word — skip one char
        matchStart = i;
        matchEnd = i + 1;
        cursor = matchEnd;
        break;
      }
      if (lowerText.startsWith(coreWord, i)) {
        matchStart = i;
        matchEnd = i + coreWord.length;
        cursor = matchEnd;
        break;
      }
    }

    // If we couldn't find the word (edge case), place it at cursor
    if (matchStart === -1) {
      matchStart = cursor;
      matchEnd = cursor;
    }

    return {
      word: rawWord,
      offset_ms: w.offset_ms,
      duration_ms: w.duration_ms,
      start_ms: w.offset_ms,
      end_ms: w.offset_ms + w.duration_ms,
      char_start: matchStart,
      char_end: matchEnd,
    };
  });
}
