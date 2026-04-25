"""
python/tts_service.py — Text-to-Speech Module

Uses edge-tts (Microsoft Edge TTS — free, high quality, no API key required).
Supports streaming audio via Server-Sent Events so the frontend can start
playing before the full audio is generated.

All routes are mounted under /tts by main.py.
"""

import asyncio
import io
import json
from typing import Annotated, AsyncGenerator

import aiofiles
import edge_tts
from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

router = APIRouter()

# ── Default voice ─────────────────────────────────────────────────────────
# Full list: run `edge-tts --list-voices` or hit /tts/voices endpoint
DEFAULT_VOICE = "en-US-AriaNeural"
DEFAULT_RATE = "+0%"    # playback rate: "-20%" slower, "+20%" faster
DEFAULT_VOLUME = "+0%"  # volume adjustment


# ── Models ────────────────────────────────────────────────────────────────

class TtsSynthesizeRequest(BaseModel):
    text: str
    voice: str = DEFAULT_VOICE
    rate: str = DEFAULT_RATE           # e.g. "+10%", "-15%"
    volume: str = DEFAULT_VOLUME       # e.g. "+5%"
    output_path: str | None = None     # if set, save MP3 to disk as well


class VoiceInfo(BaseModel):
    name: str
    short_name: str
    gender: str
    locale: str
    suggested_codec: str


# ── Voice listing ─────────────────────────────────────────────────────────

@router.get("/voices", response_model=list[VoiceInfo])
async def list_voices() -> list[VoiceInfo]:
    """
    Return all available Edge TTS voices.
    Results are cached in-memory after the first call.
    """
    voices = await edge_tts.list_voices()
    return [
        VoiceInfo(
            name=v["FriendlyName"],
            short_name=v["ShortName"],
            gender=v["Gender"],
            locale=v["Locale"],
            suggested_codec=v["SuggestedCodec"],
        )
        for v in voices
    ]


# ── Streaming synthesis ────────────────────────────────────────────────────

async def _stream_tts_audio(
    text: str, voice: str, rate: str, volume: str
) -> AsyncGenerator[bytes, None]:
    """
    Generator that yields audio chunks as they are produced by edge-tts.
    This allows the browser's <audio> element to start playing before all
    audio data has been generated (low-latency streaming).
    """
    communicate = edge_tts.Communicate(text, voice, rate=rate, volume=volume)
    async for chunk in communicate.stream():
        if chunk["type"] == "audio":
            yield chunk["data"]


@router.post("/synthesize/stream")
async def synthesize_stream(req: TtsSynthesizeRequest) -> StreamingResponse:
    """
    Stream MP3 audio for the provided text.
    The frontend can pipe the response into an <audio> element src via a
    MediaSource / Blob URL.
    """
    if not req.text.strip():
        raise HTTPException(status_code=422, detail="Text cannot be empty")

    return StreamingResponse(
        _stream_tts_audio(req.text, req.voice, req.rate, req.volume),
        media_type="audio/mpeg",
        headers={
            # Allow partial content / range requests for seek support
            "Accept-Ranges": "bytes",
            "Cache-Control": "no-cache",
        },
    )


# ── Save-to-file synthesis ────────────────────────────────────────────────

@router.post("/synthesize/save")
async def synthesize_save(req: TtsSynthesizeRequest) -> dict:
    """
    Synthesize text and save the result as an MP3 file.
    `output_path` must be set in the request body.
    """
    if not req.text.strip():
        raise HTTPException(status_code=422, detail="Text cannot be empty")
    if not req.output_path:
        raise HTTPException(
            status_code=422,
            detail="output_path is required for /synthesize/save",
        )

    communicate = edge_tts.Communicate(
        req.text, req.voice, rate=req.rate, volume=req.volume
    )

    # Collect all audio chunks into memory first
    chunks: list[bytes] = []
    async for chunk in communicate.stream():
        if chunk["type"] == "audio":
            chunks.append(chunk["data"])

    audio_data = b"".join(chunks)

    # Write to disk asynchronously
    async with aiofiles.open(req.output_path, "wb") as f:
        await f.write(audio_data)

    return {
        "saved": req.output_path,
        "size_bytes": len(audio_data),
        "voice": req.voice,
    }


# ── Word-boundary timing (for text highlighting sync) ─────────────────────

@router.post("/synthesize/timing")
async def synthesize_timing(req: TtsSynthesizeRequest) -> dict:
    """
    Return word-boundary timing metadata WITHOUT audio.
    Use this to synchronise text highlighting with audio playback in the UI.

    Each entry: { "offset_ms": int, "duration_ms": int, "text": str }
    """
    if not req.text.strip():
        raise HTTPException(status_code=422, detail="Text cannot be empty")

    communicate = edge_tts.Communicate(
        req.text, req.voice, rate=req.rate, volume=req.volume
    )

    words: list[dict] = []
    async for chunk in communicate.stream():
        if chunk["type"] == "WordBoundary":
            words.append(
                {
                    "offset_ms": chunk["offset"] // 10_000,   # 100-ns → ms
                    "duration_ms": chunk["duration"] // 10_000,
                    "text": chunk["text"],
                }
            )

    return {"words": words, "voice": req.voice}
