"""
python/pdf_service.py — PDF Parsing Module

Uses PyMuPDF (fitz) for fast, high-quality PDF processing:
 - Extract text with page/block structure
 - Render pages to images (for the PDF viewer canvas)
 - Extract metadata (title, author, page count, etc.)
 - Extract table of contents / bookmarks

All routes are mounted under /pdf by main.py.
"""

import io
import base64
from pathlib import Path
from typing import Annotated

import fitz  # PyMuPDF
import aiofiles
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

router = APIRouter()


# ── Request / Response Models ─────────────────────────────────────────────

class PDFOpenRequest(BaseModel):
    file_path: str        # absolute path on disk (sent from Electron)


class PDFMetadata(BaseModel):
    file_path: str
    page_count: int
    title: str | None
    author: str | None
    subject: str | None
    creator: str | None
    producer: str | None
    creation_date: str | None
    modification_date: str | None


class TocEntry(BaseModel):
    level: int            # nesting level (1 = chapter, 2 = section, …)
    title: str
    page: int             # 1-indexed


class PageText(BaseModel):
    page: int             # 1-indexed
    text: str             # plain text content
    word_count: int


class PageImage(BaseModel):
    page: int
    width: int
    height: int
    image_b64: str        # base64-encoded PNG — renderer draws it on <canvas>
    dpi: int


# ── In-memory document cache ───────────────────────────────────────────────
# Maps file_path → fitz.Document to avoid re-opening on every request.
# Production: add LRU eviction and size limits.
_doc_cache: dict[str, fitz.Document] = {}


def _get_doc(file_path: str) -> fitz.Document:
    if file_path not in _doc_cache:
        path = Path(file_path)
        if not path.exists() or path.suffix.lower() != ".pdf":
            raise HTTPException(status_code=404, detail=f"PDF not found: {file_path}")
        _doc_cache[file_path] = fitz.open(str(path))
    return _doc_cache[file_path]


# ── Endpoints ─────────────────────────────────────────────────────────────

@router.post("/open", response_model=PDFMetadata)
async def open_pdf(req: PDFOpenRequest) -> PDFMetadata:
    """
    Open a PDF and return its metadata.
    This also warms the document cache so subsequent page requests are fast.
    """
    doc = _get_doc(req.file_path)
    meta = doc.metadata

    return PDFMetadata(
        file_path=req.file_path,
        page_count=doc.page_count,
        title=meta.get("title") or None,
        author=meta.get("author") or None,
        subject=meta.get("subject") or None,
        creator=meta.get("creator") or None,
        producer=meta.get("producer") or None,
        creation_date=meta.get("creationDate") or None,
        modification_date=meta.get("modDate") or None,
    )


@router.get("/toc")
async def get_toc(
    file_path: Annotated[str, Query(description="Absolute path to the PDF")]
) -> list[TocEntry]:
    """Return the PDF table of contents (bookmarks/outlines)."""
    doc = _get_doc(file_path)
    toc = doc.get_toc()  # returns [[level, title, page], ...]
    return [TocEntry(level=entry[0], title=entry[1], page=entry[2]) for entry in toc]


@router.get("/page/text", response_model=PageText)
async def get_page_text(
    file_path: Annotated[str, Query()],
    page: Annotated[int, Query(ge=1, description="1-indexed page number")] = 1,
) -> PageText:
    """Extract plain text from a single PDF page."""
    doc = _get_doc(file_path)

    if page > doc.page_count:
        raise HTTPException(
            status_code=422,
            detail=f"Page {page} exceeds page count {doc.page_count}",
        )

    pg = doc[page - 1]                     # fitz uses 0-indexed pages
    text = pg.get_text("text").strip()

    return PageText(
        page=page,
        text=text,
        word_count=len(text.split()),
    )


@router.get("/page/image", response_model=PageImage)
async def get_page_image(
    file_path: Annotated[str, Query()],
    page: Annotated[int, Query(ge=1)] = 1,
    dpi: Annotated[int, Query(ge=72, le=300)] = 150,
) -> PageImage:
    """
    Render a PDF page to a PNG image and return it base64-encoded.
    DPI controls render quality — 150 is a good balance of quality vs. speed.
    """
    doc = _get_doc(file_path)

    if page > doc.page_count:
        raise HTTPException(
            status_code=422,
            detail=f"Page {page} exceeds page count {doc.page_count}",
        )

    pg = doc[page - 1]
    # Matrix scales the render — 1.0 = 72dpi, 2.0 = 144dpi, etc.
    matrix = fitz.Matrix(dpi / 72, dpi / 72)
    pixmap = pg.get_pixmap(matrix=matrix, alpha=False)

    img_bytes = pixmap.tobytes("png")
    img_b64 = base64.b64encode(img_bytes).decode("ascii")

    return PageImage(
        page=page,
        width=pixmap.width,
        height=pixmap.height,
        image_b64=img_b64,
        dpi=dpi,
    )


@router.get("/page/text/all")
async def get_all_text(
    file_path: Annotated[str, Query()],
) -> list[PageText]:
    """Extract text from ALL pages — useful for full-document TTS."""
    doc = _get_doc(file_path)
    results: list[PageText] = []

    for i in range(doc.page_count):
        pg = doc[i]
        text = pg.get_text("text").strip()
        results.append(
            PageText(page=i + 1, text=text, word_count=len(text.split()))
        )

    return results


@router.delete("/close")
async def close_pdf(
    file_path: Annotated[str, Query()]
) -> dict:
    """Remove a document from the cache and release memory."""
    if file_path in _doc_cache:
        _doc_cache[file_path].close()
        del _doc_cache[file_path]
    return {"closed": file_path}
