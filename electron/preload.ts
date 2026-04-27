/**
 * electron/preload.ts — Context Bridge
 *
 * This script runs in a special "preload" context that has access to BOTH
 * the Node.js APIs AND the browser window's JavaScript environment.
 *
 * The contextBridge.exposeInMainWorld() call creates a safe, typed API
 * surface that the React renderer can use via window.electronAPI.
 *
 * SECURITY: Never expose ipcRenderer.invoke directly — always wrap each
 * channel in a named function so the renderer can't invoke arbitrary channels.
 */

import { contextBridge, ipcRenderer } from "electron";

// ── IPC Channel Type Definitions ─────────────────────────────────────────
// Centralised here so both preload and renderer stay in sync.
// Export the type so main.ts can import it for ipcMain.handle() signatures.
export interface IpcChannels {
  // File dialogs
  "dialog:openFile": () => Promise<string[]>;
  "dialog:openDirectory": () => Promise<string | null>;

  // Shell integration
  "shell:openPath": (filePath: string) => Promise<void>;

  // Theme
  "theme:toggle": () => Promise<boolean>;
  "theme:get": () => Promise<boolean>;

  // App info
  "app:getVersion": () => Promise<string>;

  // Python sidecar
  "python:getPort": () => Promise<number | null>;
}

// ── ElectronAPI shape exposed to the renderer ─────────────────────────────
export interface ElectronAPI {
  // ── Invoke (request/response) ──────────────────────────────────────────
  openFilePicker: () => Promise<string[]>;
  openDirectoryPicker: () => Promise<string | null>;
  openInExplorer: (filePath: string) => Promise<void>;
  toggleTheme: () => Promise<boolean>;
  getTheme: () => Promise<boolean>;
  getAppVersion: () => Promise<string>;
  getPythonPort: () => Promise<number | null>;

  // ── Event listeners (main → renderer pushes) ──────────────────────────
  // Called once at startup with the Python port
  onPythonPort: (callback: (port: number) => void) => () => void;
  // Called if the Python sidecar crashes
  onPythonCrash: (callback: (code: number | null) => void) => () => void;
}

// ── Helper: wrap an on-listener and return a cleanup function ─────────────
function onEvent<T>(
  channel: string,
  callback: (payload: T) => void
): () => void {
  const handler = (_event: Electron.IpcRendererEvent, payload: T): void =>
    callback(payload);
  ipcRenderer.on(channel, handler);
  // Return a cleanup/unsubscribe function so React's useEffect can call it
  return () => ipcRenderer.removeListener(channel, handler);
}

// ── Expose API via contextBridge ─────────────────────────────────────────
contextBridge.exposeInMainWorld("electronAPI", {
  // Invoke wrappers
  openFilePicker: () => ipcRenderer.invoke("dialog:openFile"),
  openDirectoryPicker: () => ipcRenderer.invoke("dialog:openDirectory"),
  openInExplorer: (filePath: string) =>
    ipcRenderer.invoke("shell:openPath", filePath),
  toggleTheme: () => ipcRenderer.invoke("theme:toggle"),
  getTheme: () => ipcRenderer.invoke("theme:get"),
  getAppVersion: () => ipcRenderer.invoke("app:getVersion"),
  getPythonPort: () => ipcRenderer.invoke("python:getPort"),

  // Push-event listeners
  onPythonPort: (cb: (port: number) => void) => onEvent("python:port", cb),
  onPythonCrash: (cb: (code: number | null) => void) =>
    onEvent("python:crash", cb),
} satisfies ElectronAPI);

// ── Global type augmentation for the renderer ─────────────────────────────
// This block is never executed — it only teaches TypeScript what
// window.electronAPI looks like inside src/**/*.tsx files.
declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
