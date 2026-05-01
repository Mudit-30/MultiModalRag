"""
Ingest endpoint — unified multi-modal file ingestion.
Supports: PDF, DOCX, PPTX, TXT, MD, CSV, XLSX, Images, Audio.
"""

from fastapi import APIRouter, UploadFile, File, HTTPException, BackgroundTasks
from app.services.document_parser import detect_and_parse
from app.services.text_processor import text_processor
from app.services.image_processor import image_processor
from app.services.audio_processor import audio_processor
from app.db.qdrant import qdrant_manager
from app.db.neo4j import neo4j_manager
from app.core.config import settings
import uuid
import logging
from datetime import datetime, timezone

logger = logging.getLogger(__name__)
router = APIRouter()

# File types treated as images / audio (not text-parsed)
IMAGE_TYPES = {"image/jpeg", "image/png", "image/gif", "image/bmp", "image/webp", "image/tiff"}
AUDIO_TYPES = {
    "audio/mpeg", "audio/wav", "audio/ogg", "audio/mp4", "audio/webm",
    "audio/x-wav", "video/mp4", "video/webm", "video/x-matroska", "video/avi"
}


async def _store_graph_background(text: str, source_id: str):
    """Fire-and-forget: extract entities and store in Neo4j knowledge graph."""
    if not neo4j_manager.driver:
        logger.debug("Neo4j offline — skipping graph extraction for %s", source_id)
        return
    try:
        from langchain_groq import ChatGroq
        from app.services.graph_extractor import GraphExtractor
        llm = ChatGroq(
            api_key=settings.GROQ_API_KEY,
            model_name="llama-3.1-8b-instant",
            temperature=0,
        )
        extractor = GraphExtractor(llm)
        graph_data = await extractor.extract(text)
        if graph_data.entities:
            neo4j_manager.ingest_graph(graph_data, source_chunk_id=source_id)
            logger.info("Graph stored for source_id=%s (%d entities)", source_id, len(graph_data.entities))
        else:
            logger.debug("No entities extracted for source_id=%s", source_id)
    except Exception as e:
        logger.warning("Graph extraction skipped for %s: %s", source_id, e)


def _is_image(file_bytes: bytes, content_type: str, filename: str) -> bool:
    """Detect images by content-type, magic bytes, or extension."""
    if content_type in IMAGE_TYPES:
        return True
    ext = filename.lower().rsplit(".", 1)[-1]
    if ext in ("jpg", "jpeg", "png", "gif", "bmp", "webp", "tiff"):
        return True
    # Magic bytes
    magic = file_bytes[:4]
    return magic[:3] == b"\xff\xd8\xff" or magic == b"\x89PNG" or magic[:3] == b"GIF"


def _is_audio(content_type: str, filename: str) -> bool:
    """Detect audio/video by content-type or extension."""
    if content_type in AUDIO_TYPES:
        return True
    ext = filename.lower().rsplit(".", 1)[-1]
    return ext in ("mp3", "wav", "ogg", "m4a", "mp4", "webm", "mkv", "avi", "flac")


@router.post("")
async def ingest_file(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
):
    content_type = (file.content_type or "").lower().split(";")[0].strip()
    filename = file.filename or "upload"
    file_bytes = await file.read()
    source_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    total_vectors = 0
    extracted_text = ""

    if not file_bytes:
        raise HTTPException(status_code=422, detail="Uploaded file is empty.")

    logger.info(
        "Ingesting file: name=%s type=%s size=%d bytes",
        filename, content_type, len(file_bytes),
    )

    # ── IMAGE ─────────────────────────────────────────────────────────────────
    if _is_image(file_bytes, content_type, filename):
        try:
            result = image_processor.process(file_bytes, filename=filename)
            extracted_text = result["caption"]
            payloads = [{
                "modality":  "image",
                "source_id": source_id,
                "chunk_id":  f"{source_id}_0",
                "chunk_index": 0,
                "page":      1,
                "filename":  filename,
                "timestamp": now,
                "text":      extracted_text,
                "caption":   extracted_text,
            }]
            qdrant_manager.insert_vectors([result["embedding"]], payloads)
            text_processor._add_to_bm25([extracted_text])
            total_vectors = 1
        except Exception as e:
            logger.error("Image processing failed: %s", e)
            raise HTTPException(status_code=500, detail=f"Image processing failed: {e}")

    # ── AUDIO ─────────────────────────────────────────────────────────────────
    elif _is_audio(content_type, filename):
        try:
            result = audio_processor.process(file_bytes, filename=filename)
            extracted_text = result["transcript"]
            payloads = [{
                "modality":  "audio",
                "source_id": source_id,
                "chunk_id":  f"{source_id}_0",
                "chunk_index": 0,
                "page":      1,
                "filename":  filename,
                "timestamp": now,
                "text":      extracted_text,
                "transcript": extracted_text,
            }]
            qdrant_manager.insert_vectors([result["embedding"]], payloads)
            text_processor._add_to_bm25([extracted_text])
            total_vectors = 1
        except Exception as e:
            logger.error("Audio processing failed: %s", e)
            raise HTTPException(status_code=500, detail=f"Audio processing failed: {e}")

    # ── DOCUMENTS (PDF / DOCX / PPTX / TXT / CSV / XLSX / etc.) ─────────────
    else:
        pages = detect_and_parse(file_bytes, filename=filename, content_type=content_type)

        if not pages:
            raise HTTPException(status_code=422, detail="Could not extract any text from this file.")

        all_embeddings = []
        all_payloads = []
        full_text_parts = []
        chunk_counter = 0

        for page_info in pages:
            page_text = page_info.get("text", "").strip()
            if not page_text:
                continue

            full_text_parts.append(page_text)

            chunk_results = text_processor.process(
                page_text,
                page=page_info.get("page", 1),
                filename=filename,
            )

            for cr in chunk_results:
                all_embeddings.append(cr["embedding"])
                all_payloads.append({
                    "modality":    "text",
                    "source_id":   source_id,
                    "chunk_id":    f"{source_id}_{chunk_counter}",
                    "chunk_index": chunk_counter,
                    "page":        cr["page"],
                    "filename":    filename,
                    "timestamp":   now,
                    "text":        cr["text"],
                })
                chunk_counter += 1

        if not all_embeddings:
            raise HTTPException(status_code=422, detail="File contained no usable text content.")

        qdrant_manager.insert_vectors(all_embeddings, all_payloads)
        total_vectors = len(all_embeddings)
        extracted_text = "\n\n".join(full_text_parts)

    # Fire-and-forget graph extraction
    if extracted_text.strip():
        background_tasks.add_task(_store_graph_background, extracted_text[:6000], source_id)

    logger.info(
        "Ingestion complete: source_id=%s, vectors=%d, file=%s",
        source_id, total_vectors, filename,
    )

    return {
        "message":   "Ingestion successful",
        "source_id": source_id,
        "filename":  filename,
        "chunks":    total_vectors,
        "preview":   extracted_text[:400] + ("..." if len(extracted_text) > 400 else ""),
    }


# ── URL scraping endpoint ──────────────────────────────────────────────────────

from pydantic import BaseModel as _BaseModel


class UrlIngestRequest(_BaseModel):
    url: str


@router.post("/url")
async def ingest_url(request: UrlIngestRequest, background_tasks: BackgroundTasks):
    """Scrape a URL and ingest its text content into the RAG pipeline."""
    import httpx
    from html.parser import HTMLParser

    url = request.url.strip().split("#")[0]
    if not url.startswith(("http://", "https://")):
        raise HTTPException(status_code=400, detail="Invalid URL. Must start with http:// or https://")

    # Optimization for Wikipedia: use ?action=render for clean content
    if "wikipedia.org" in url:
        sep = "&" if "?" in url else "?"
        if "action=" not in url:
            url = f"{url}{sep}action=render"

    try:
        headers = {
            "User-Agent": (
                "MultiModalGraphRAGBot/1.0 (hello@example.com) "
                "python-httpx/0.27"
            ),
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.9",
        }
        async with httpx.AsyncClient(timeout=25, follow_redirects=True) as client:
            resp = await client.get(url, headers=headers)
        resp.raise_for_status()
        html = resp.text
    except httpx.TimeoutException:
        raise HTTPException(status_code=422, detail="URL fetch timed out. Try a simpler/shorter page.")
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=422, detail=f"URL returned HTTP {e.response.status_code}")
    except Exception as e:
        logger.error("URL fetch failed: %s", e)
        raise HTTPException(status_code=422, detail=f"Could not fetch URL: {e}")

    # Enhanced HTML → plain text stripper
    class _Stripper(HTMLParser):
        SKIP_TAGS = {"script", "style", "nav", "header", "footer", "aside", "noscript", "iframe"}

        def __init__(self):
            super().__init__()
            self.parts = []
            self._skip_depth = 0

        def handle_starttag(self, tag, attrs):
            if tag in self.SKIP_TAGS:
                self._skip_depth += 1

        def handle_endtag(self, tag):
            if tag in self.SKIP_TAGS and self._skip_depth > 0:
                self._skip_depth -= 1

        def handle_data(self, data):
            if self._skip_depth == 0:
                stripped = data.strip()
                if stripped:
                    self.parts.append(stripped)

    parser = _Stripper()
    parser.feed(html)

    lines = [p for p in parser.parts if len(p) > 20 or p.endswith(".")]
    extracted_text = "\n\n".join(lines)

    if len(extracted_text) < 100:
        # Fallback: less filtered
        extracted_text = " ".join(parser.parts)

    if len(extracted_text) < 50:
        raise HTTPException(status_code=422, detail="Could not extract meaningful text from the URL.")

    # Truncate to reasonable size (~50k chars)
    extracted_text = extracted_text[:50_000]

    source_id = str(uuid.uuid4())
    try:
        hostname = url.split("/")[2]
    except IndexError:
        hostname = url

    chunk_results = text_processor.process(extracted_text, filename=hostname)
    all_embeddings = []
    all_payloads = []

    for cr in chunk_results:
        all_embeddings.append(cr["embedding"])
        all_payloads.append({
            "modality":    "text",
            "source_id":   source_id,
            "chunk_id":    f"{source_id}_{cr['chunk_index']}",
            "chunk_index": cr["chunk_index"],
            "page":        1,
            "filename":    hostname,
            "source":      url,
            "text":        cr["text"],
        })

    if all_embeddings:
        qdrant_manager.insert_vectors(all_embeddings, all_payloads)

    background_tasks.add_task(_store_graph_background, extracted_text[:8000], source_id)

    logger.info("URL ingestion complete: url=%s, chunks=%d", url, len(all_embeddings))
    return {
        "message":   "URL ingested successfully",
        "source_id": source_id,
        "filename":  hostname,
        "url":       url,
        "chunks":    len(all_embeddings),
        "preview":   extracted_text[:300] + "...",
    }


@router.post("/reset")
async def reset_memory():
    """Wipe all memory (Qdrant, Neo4j, BM25) to achieve 'Zero-Memory'."""
    try:
        qdrant_manager.reset()
        neo4j_manager.reset()
        text_processor.reset()
        logger.info("All system memory wiped successfully.")
        return {"message": "Memory wiped successfully"}
    except Exception as e:
        logger.error("Failed to wipe memory: %s", e)
        raise HTTPException(status_code=500, detail=str(e))
