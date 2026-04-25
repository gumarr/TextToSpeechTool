/**
 * electron/main.ts — Electron Main Process
 *
 * Responsibilities:
 *  1. Spawn & monitor the Python FastAPI sidecar
 *  2. Wait for Python to report its port via stdout (health check)
 *  3. Create the BrowserWindow and load the renderer
 *  4. Register all ipcMain handlers
 *  5. Cleanly kill Python when the app quits
 */

import {
  app,
  BrowserWindow,
  ipcMain,
  dialog,
  shell,
  nativeTheme,
} from "electron";
import { join } from "path";
import { PythonSidecar } from "./pythonSidecar";
import type { IpcChannels } from "./preload";

// ── Globals ───────────────────────────────────────────────────────────────
let mainWindow: BrowserWindow | null = null;
let pythonSidecar: PythonSidecar | null = null;

// ── Window Factory ────────────────────────────────────────────────────────
function createWindow(pythonPort: number): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    show: false, // hidden until "ready-to-show" — avoids white flash
    titleBarStyle: "hidden", // frameless with traffic lights on macOS
    trafficLightPosition: { x: 16, y: 16 },
    webPreferences: {
      // Preload bridge — the ONLY way renderer talks to Node
      preload: join(__dirname, "preload/index.js"),
      // Security defaults
      nodeIntegration: false,   // renderer cannot require() Node modules
      contextIsolation: true,   // isolate Node context from browser context
      sandbox: false,           // needed so preload can use require()
      webSecurity: true,
    },
    backgroundColor: "#0f0f0f",
    icon: join(__dirname, "../../resources/icon.png"),
  });

  // ── Load URL ─────────────────────────────────────────────────────────────
  if (process.env["ELECTRON_RENDERER_URL"]) {
    // Development: electron-vite sets this env var to the Vite dev server URL
    mainWindow.loadURL(process.env["ELECTRON_RENDERER_URL"]);
    mainWindow.webContents.openDevTools();
  } else {
    // Production: load the built index.html
    mainWindow.loadFile(join(__dirname, "../renderer/index.html"));
  }

  // ── Show window only when fully painted ─────────────────────────────────
  mainWindow.once("ready-to-show", () => {
    mainWindow!.show();

    // Immediately send the Python port to the renderer so it can build API URLs
    mainWindow!.webContents.send("python:port", pythonPort);
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

// ── IPC Handlers ─────────────────────────────────────────────────────────
function registerIpcHandlers(): void {
  // ── File system ──────────────────────────────────────────────────────────

  // Open native file picker — returns selected PDF paths (or [] if cancelled)
  ipcMain.handle("dialog:openFile", async () => {
    const result = await dialog.showOpenDialog({
      properties: ["openFile", "multiSelections"],
      filters: [{ name: "PDF Files", extensions: ["pdf"] }],
    });
    return result.canceled ? [] : result.filePaths;
  });

  // Open native folder picker — returns folder path (or null)
  ipcMain.handle("dialog:openDirectory", async () => {
    const result = await dialog.showOpenDialog({
      properties: ["openDirectory"],
    });
    return result.canceled ? null : result.filePaths[0];
  });

  // ── Shell ────────────────────────────────────────────────────────────────

  // Open a path in the OS file explorer
  ipcMain.handle("shell:openPath", async (_event, filePath: string) => {
    await shell.showItemInFolder(filePath);
  });

  // ── Theme ────────────────────────────────────────────────────────────────

  // Toggle between dark/light system theme
  ipcMain.handle("theme:toggle", () => {
    nativeTheme.themeSource =
      nativeTheme.shouldUseDarkColors ? "light" : "dark";
    return nativeTheme.shouldUseDarkColors;
  });

  ipcMain.handle("theme:get", () => nativeTheme.shouldUseDarkColors);

  // ── App ──────────────────────────────────────────────────────────────────

  ipcMain.handle("app:getVersion", () => app.getVersion());

  // ── Python sidecar ───────────────────────────────────────────────────────

  // Expose the current Python port (useful if renderer re-mounts after sleep)
  ipcMain.handle("python:getPort", () => pythonSidecar?.port ?? null);
}

// ── App Lifecycle ─────────────────────────────────────────────────────────
app.whenReady().then(async () => {
  // 1. Register all IPC handlers BEFORE creating the window
  registerIpcHandlers();

  // 2. Start Python sidecar and wait for it to be ready
  pythonSidecar = new PythonSidecar();

  let pythonPort: number;
  try {
    pythonPort = await pythonSidecar.start();
    console.log(`[main] Python sidecar ready on port ${pythonPort}`);
  } catch (err) {
    console.error("[main] Python sidecar failed to start:", err);
    // Show an error dialog and exit gracefully
    dialog.showErrorBox(
      "Startup Error",
      `Failed to start the PDF processing backend:\n\n${err}\n\nPlease reinstall the application.`
    );
    app.quit();
    return;
  }

  // 3. Create window AFTER Python is confirmed ready
  createWindow(pythonPort);

  // macOS: re-create window when dock icon is clicked
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow(pythonPort);
    }
  });
});

// ── Cleanup ───────────────────────────────────────────────────────────────
// Called on all platforms when last window closes (except macOS)
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

// Called just before the process exits — kill Python in ALL cases
app.on("before-quit", () => {
  pythonSidecar?.stop();
});

// Guard against renderer crashes leaking the sidecar
app.on("render-process-gone", (_event, _webContents, details) => {
  console.error("[main] Renderer process gone:", details.reason);
});
