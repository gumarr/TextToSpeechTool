# PDF Reader Pro

A professional desktop PDF reader with text-to-speech, built with **Electron 28 + React 18 + FastAPI (Python sidecar)**.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Desktop shell | Electron 28 |
| Frontend | React 18 + TypeScript + Vite (via electron-vite) |
| Styling | Tailwind CSS v3 |
| State | Zustand |
| Backend | Python 3.10+ · FastAPI · Uvicorn |
| PDF parsing | PyMuPDF (`fitz`) |
| TTS | edge-tts (Microsoft Edge Neural voices) |

## Project Structure

```
pdf-reader-pro/
├── electron/
│   ├── main.ts           # Electron main process
│   ├── preload.ts        # Context bridge / IPC type-safe API
│   └── pythonSidecar.ts  # Spawn & manage Python FastAPI process
├── src/                  # React renderer
│   ├── App.tsx
│   ├── index.css
│   ├── components/
│   │   ├── Titlebar.tsx
│   │   ├── Sidebar.tsx
│   │   ├── PdfViewer.tsx
│   │   ├── TtsControls.tsx
│   │   └── CrashBanner.tsx
│   └── store/
│       ├── appStore.ts   # Zustand global state
│       └── apiClient.ts  # Typed fetch wrappers for the Python API
├── python/
│   ├── main.py           # FastAPI entry · auto port discovery
│   ├── pdf_service.py    # PDF endpoints (open, text, render, TOC)
│   ├── tts_service.py    # TTS endpoints (stream, save, timing)
│   └── requirements.txt
├── vite.config.ts        # electron-vite config (main + preload + renderer)
├── electron-builder.config.js
├── tailwind.config.ts
└── tsconfig*.json
```

## Quick Start

### 1. Install Node dependencies
```bash
cd pdf-reader-pro
npm install
```

### 2. Set up Python environment
```bash
cd python
python -m venv .venv

# Windows
.venv\Scripts\activate

# macOS / Linux
source .venv/bin/activate

pip install -r requirements.txt
```

### 3. Run in development
```bash
# From the pdf-reader-pro/ directory
npm run dev
```
electron-vite will:
- Start the Vite dev server for the React renderer on port 5173
- Compile the Electron main/preload TypeScript
- Launch Electron, which spawns the Python sidecar automatically

### 4. Build for production
```bash
npm run build          # compile TS + Vite bundle
npm run package:win    # package for Windows (NSIS installer + portable)
npm run package:mac    # package for macOS (DMG — requires macOS)
npm run package:linux  # package for Linux (AppImage + deb + rpm)
```

## Architecture Decisions

### Why electron-vite instead of plain Vite?
`electron-vite` runs three coordinated Vite configs (main, preload, renderer) in a single command. It handles the `ELECTRON_RENDERER_URL` environment variable injection automatically, so Electron always loads the correct URL in dev vs. production without any custom scripts.

### Why Python-over-stdout health check?
The Python sidecar prints `READY:port=XXXX` to stdout once uvicorn is accepting connections. Electron's `pythonSidecar.ts` watches that stream and only creates the BrowserWindow after receiving this signal — guaranteeing the API is available before any React code runs.

### Why auto port scanning?
If port 8765 is in use (e.g., another PDF Reader Pro instance, or a dev server), `find_free_port()` scans sequentially upward and reports the chosen port back to Electron. Electron stores it in the Zustand store so every `apiClient.ts` call automatically uses the right URL.

### IPC security model
- `nodeIntegration: false` — renderer cannot `require()` Node modules
- `contextIsolation: true` — browser JS cannot access the preload's Node context
- `contextBridge.exposeInMainWorld()` — only named, typed functions are exposed; the renderer cannot invoke arbitrary IPC channels

## API Endpoints (Python FastAPI)

### PDF (`/pdf`)
| Method | Path | Description |
|--------|------|-------------|
| POST | `/pdf/open` | Open PDF, returns metadata |
| GET | `/pdf/toc` | Table of contents |
| GET | `/pdf/page/text` | Page text (for TTS) |
| GET | `/pdf/page/image` | Rendered page as base64 PNG |
| GET | `/pdf/page/text/all` | All pages text |
| DELETE | `/pdf/close` | Release document from cache |

### TTS (`/tts`)
| Method | Path | Description |
|--------|------|-------------|
| GET | `/tts/voices` | List all Edge TTS voices |
| POST | `/tts/synthesize/stream` | Stream MP3 audio |
| POST | `/tts/synthesize/save` | Save MP3 to disk |
| POST | `/tts/synthesize/timing` | Word-boundary timing metadata |

Interactive docs available at `http://127.0.0.1:<port>/docs` when running in dev mode.
