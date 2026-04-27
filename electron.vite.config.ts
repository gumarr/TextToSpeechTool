import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";

/**
 * electron-vite config
 *
 * electron-vite manages THREE separate Vite configs in one file:
 *  1. `main`     — Electron main process (Node.js target)
 *  2. `preload`  — Preload scripts (sandboxed Node context)
 *  3. `renderer` — React renderer (browser target)
 *
 * This replaces the need for a plain vite.config.ts + custom scripts.
 */
export default defineConfig({
  // ── 1. Electron Main Process ─────────────────────────────────────────────
  main: {
    plugins: [
      // externalizeDepsPlugin prevents bundling node_modules into main —
      // Electron loads them natively, so bundling them wastes space & breaks native modules.
      externalizeDepsPlugin(),
    ],
    build: {
      rollupOptions: {
        input: {
          // Key 'main' → output file dist-electron/main.js (matches package.json "main" field)
          main: resolve(__dirname, "electron/main.ts"),
        },
      },
      // Output compiled main process to dist-electron/
      outDir: "dist-electron",
    },
  },

  // ── 2. Preload Script ─────────────────────────────────────────────────────
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, "electron/preload.ts"),
        },
      },
      outDir: "dist-electron/preload",
    },
  },

  // ── 3. React Renderer (Vite browser build) ────────────────────────────────
  renderer: {
    root: resolve(__dirname, "src"),
    plugins: [react()],
    resolve: {
      alias: {
        // "@/" maps to src/ — use in imports like: import Foo from "@/components/Foo"
        "@": resolve(__dirname, "src"),
      },
    },
    build: {
      outDir: "dist",
      rollupOptions: {
        input: {
          index: resolve(__dirname, "src/index.html"),
        },
      },
    },
    // Dev server for the renderer (electron-vite auto-connects Electron to this)
    server: {
      port: 5173,
      strictPort: true,
    },
  },
});
