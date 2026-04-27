// src/electron.d.ts
// Renderer-side ambient type augmentation for window.electronAPI.
// The real implementation lives in electron/preload.ts (contextBridge).
// tsconfig.app.json includes src/**/*.ts so this file is picked up automatically.

export interface ElectronAPI {
  // Invoke (request/response)
  openFilePicker: () => Promise<string[]>;
  openDirectoryPicker: () => Promise<string | null>;
  openInExplorer: (filePath: string) => Promise<void>;
  toggleTheme: () => Promise<boolean>;
  getTheme: () => Promise<boolean>;
  getAppVersion: () => Promise<string>;
  getPythonPort: () => Promise<number | null>;

  // Event listeners (main -> renderer push)
  onPythonPort: (callback: (port: number) => void) => () => void;
  onPythonCrash: (callback: (code: number | null) => void) => () => void;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
