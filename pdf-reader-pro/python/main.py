"""
python/main.py — FastAPI entry point

Startup sequence:
 1. Scan for a free port starting at PREFERRED_PORT (env) or 8765
 2. Start the FastAPI/uvicorn server on that port
 3. Print the magic "READY:port=XXXX" line to stdout so Electron knows we're up
 4. Keep running until Electron kills us (SIGTERM / SIGKILL)

All PDF and TTS logic lives in separate service modules (pdf_service, tts_service).
"""

import asyncio
import os
import signal
import socket
import sys
from contextlib import asynccontextmanager

import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from pdf_service import router as pdf_router
from tts_service import router as tts_router

# ── Port discovery ─────────────────────────────────────────────────────────

def find_free_port(preferred: int = 8765, max_tries: int = 20) -> int:
    """
    Try `preferred` first; if occupied, scan sequentially upward.
    Returns the first available port.
    """
    for port in range(preferred, preferred + max_tries):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
            sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            try:
                sock.bind(("127.0.0.1", port))
                return port
            except OSError:
                continue
    raise RuntimeError(
        f"No free port found in range {preferred}–{preferred + max_tries - 1}"
    )


# ── App lifespan (startup / shutdown hooks) ────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    AsyncContextManager executed by FastAPI on startup and shutdown.
    Use for initialising/closing shared resources (DB connections, caches, etc.)
    """
    print("[python] FastAPI startup — initialising services", flush=True)
    yield
    print("[python] FastAPI shutdown — cleaning up", flush=True)


# ── FastAPI application ────────────────────────────────────────────────────

app = FastAPI(
    title="PDF Reader Pro — Backend",
    description="PDF parsing, rendering, and TTS services for PDF Reader Pro",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS: allow the Electron renderer (file:// or localhost dev server) to call us
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],       # Tighten in production: ["http://localhost:5173"]
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Routers ────────────────────────────────────────────────────────────────
app.include_router(pdf_router, prefix="/pdf", tags=["PDF"])
app.include_router(tts_router, prefix="/tts", tags=["TTS"])


# ── Health endpoint ────────────────────────────────────────────────────────
@app.get("/health", tags=["System"])
async def health_check():
    """Quick liveness probe — Electron polls this optionally."""
    return {"status": "ok", "version": "1.0.0"}


# ── Entry point ────────────────────────────────────────────────────────────

def main() -> None:
    preferred = int(os.environ.get("PREFERRED_PORT", "8765"))
    port = find_free_port(preferred)

    # ── CRITICAL: Print the READY signal BEFORE uvicorn blocks ──────────────
    # Electron's pythonSidecar.ts watches stdout for exactly this pattern.
    # sys.stdout.flush() ensures the line is sent immediately (not buffered).
    print(f"READY:port={port}", flush=True)

    # Graceful shutdown on SIGTERM (sent by Electron on app.quit)
    def handle_sigterm(signum, frame):
        print("[python] Received SIGTERM — shutting down", flush=True)
        sys.exit(0)

    signal.signal(signal.SIGTERM, handle_sigterm)

    # Start uvicorn — this blocks until the server exits
    uvicorn.run(
        app,                        # pass the app object (not "main:app" string)
        host="127.0.0.1",           # bind only to loopback — never expose externally
        port=port,
        log_level="info",
        # access_log=False,         # uncomment to reduce noise in production
    )


if __name__ == "__main__":
    main()
