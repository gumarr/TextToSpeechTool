/**
 * electron/pythonSidecar.ts — Python Process Manager
 *
 * Responsibilities:
 *  1. Resolve the correct Python executable (dev vs packaged app)
 *  2. Spawn `python/main.py` as a child process
 *  3. Parse stdout for the magic "READY:port=XXXX" line (health check)
 *  4. Forward Python logs to Electron's console with a [python] prefix
 *  5. Emit events for crash detection back to main.ts
 *  6. Kill the process cleanly on app quit
 */

import { ChildProcess, spawn } from "child_process";
import { app } from "electron";
import { join } from "path";
import { EventEmitter } from "events";

// ── Constants ─────────────────────────────────────────────────────────────
const STARTUP_TIMEOUT_MS = 30_000; // 30 s — fail if Python doesn't report ready
const HEALTH_CHECK_SIGNAL = "READY:port=";  // must match python/main.py output

// ── PythonSidecar class ────────────────────────────────────────────────────
export class PythonSidecar extends EventEmitter {
  private process: ChildProcess | null = null;
  public port: number | null = null;
  private _stopping = false;

  /**
   * Resolve the Python executable path.
   *
   * - In development: use the system `python` (or `python3`) in PATH
   * - In production (packaged): the Python folder is bundled under
   *   `process.resourcesPath/python/` by electron-builder's extraResources.
   *   A real deployment would use PyInstaller here; for the scaffold we still
   *   call system Python but point it at the bundled script.
   */
  private getPythonExecutable(): string {
    if (app.isPackaged) {
      // On Windows, PyInstaller bundles as python/main.exe
      // On macOS/Linux, it's python/main
      const ext = process.platform === "win32" ? ".exe" : "";
      const bundledExe = join(
        process.resourcesPath,
        "python",
        `main${ext}`
      );
      // TODO: Return bundledExe when using PyInstaller
      // For now fall through to system Python with the bundled script
      return process.platform === "win32" ? "python" : "python3";
    }
    // Development: system Python
    return process.platform === "win32" ? "python" : "python3";
  }

  /**
   * Resolve the path to `main.py`.
   *  - Dev: `<repo>/python/main.py`
   *  - Packaged: `<resourcesPath>/python/main.py`
   */
  private getScriptPath(): string {
    if (app.isPackaged) {
      return join(process.resourcesPath, "python", "main.py");
    }
    // __dirname is dist-electron/ at runtime; go up to repo root
    return join(__dirname, "../../python/main.py");
  }

  /**
   * start() — spawn Python and resolve with the port once ready.
   * Rejects after STARTUP_TIMEOUT_MS if no READY signal is received.
   */
  start(): Promise<number> {
    return new Promise((resolve, reject) => {
      const executable = this.getPythonExecutable();
      const script = this.getScriptPath();

      console.log(`[sidecar] Spawning: ${executable} ${script}`);

      // Spawn Python with unbuffered output so stdout lines arrive immediately
      this.process = spawn(executable, ["-u", script], {
        stdio: ["ignore", "pipe", "pipe"],
        env: {
          ...process.env,
          // Tell Python which port to try first (it will auto-scan if busy)
          PREFERRED_PORT: "8765",
          // Disable Python's output buffering in addition to -u flag
          PYTHONUNBUFFERED: "1",
        },
      });

      // ── Startup timeout ────────────────────────────────────────────────
      const timeout = setTimeout(() => {
        this.stop();
        reject(new Error(`Python sidecar timed out after ${STARTUP_TIMEOUT_MS}ms`));
      }, STARTUP_TIMEOUT_MS);

      let resolved = false;

      // ── stdout: watch for READY signal ────────────────────────────────
      this.process.stdout?.setEncoding("utf8");
      this.process.stdout?.on("data", (chunk: string) => {
        // Python may flush multiple lines in one chunk — split and process each
        for (const line of chunk.split(/\r?\n/).filter(Boolean)) {
          console.log(`[python] ${line}`);

          if (!resolved && line.startsWith(HEALTH_CHECK_SIGNAL)) {
            // Parse "READY:port=8765" → 8765
            const portStr = line.slice(HEALTH_CHECK_SIGNAL.length).trim();
            const port = parseInt(portStr, 10);

            if (!isNaN(port)) {
              resolved = true;
              clearTimeout(timeout);
              this.port = port;
              resolve(port);
            }
          }
        }
      });

      // ── stderr: forward Python tracebacks to console ──────────────────
      this.process.stderr?.setEncoding("utf8");
      this.process.stderr?.on("data", (chunk: string) => {
        for (const line of chunk.split(/\r?\n/).filter(Boolean)) {
          console.error(`[python:err] ${line}`);
        }
      });

      // ── Process exit ──────────────────────────────────────────────────
      this.process.on("exit", (code, signal) => {
        console.log(`[sidecar] Python exited — code=${code} signal=${signal}`);
        this.process = null;
        this.port = null;

        if (!resolved) {
          clearTimeout(timeout);
          reject(new Error(`Python exited before becoming ready (code ${code})`));
        } else if (!this._stopping) {
          // Unexpected crash AFTER it was ready → notify renderer
          this.emit("crash", code);
        }
      });

      // ── Spawn error (e.g. python not in PATH) ─────────────────────────
      this.process.on("error", (err) => {
        clearTimeout(timeout);
        if (!resolved) {
          reject(err);
        } else {
          this.emit("crash", null);
        }
      });
    });
  }

  /**
   * stop() — gracefully terminate the Python process.
   * Called from app's "before-quit" event.
   */
  stop(): void {
    if (!this.process) return;
    this._stopping = true;

    console.log("[sidecar] Stopping Python process...");

    if (process.platform === "win32") {
      // On Windows, SIGTERM is not supported — use taskkill
      try {
        const { execSync } = require("child_process");
        execSync(`taskkill /pid ${this.process.pid} /f /t`);
      } catch {
        // Process may already be gone
      }
    } else {
      // POSIX: send SIGTERM first, then SIGKILL after 3 s
      this.process.kill("SIGTERM");
      setTimeout(() => {
        if (this.process && !this.process.killed) {
          this.process.kill("SIGKILL");
        }
      }, 3000);
    }

    this.process = null;
  }
}
