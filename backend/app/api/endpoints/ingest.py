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
AUDIO_TYPES = {"audio/mpeg", "audio/wav", "audio/ogg", "audio/mp4", "audio/webm", "audio/x-wav", "video/mp4", "video/webm", "video/x-matroska", "video/avi"}


async def _store_graph_background(text: str, source_id: str):
    """Fire-and-forget: extract entities and store in Neo4j knowledge graph."""
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
        neo4j_manager.ingest_graph(graph_data, source_chunk_id=source_id)
        logger.info("Graph stored for source_id=%s", source_id)
    except Exception as e:
        logger.warning("Graph extraction skipped for %s: %s", source_id, e)


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

    logger.info(
        "Ingesting file: name=%s type=%s size=%d bytes",
        filename, content_type, len(file_bytes),
    )

    # ── IMAGE ─────────────────────────────────────────────────────────────────
    if content_type in IMAGE_TYPES or any(
        file_bytes[:4].startswith(sig) for sig in [b"\x89PNG", b"\xff\xd8\xff", b"GIF8", b"BM\x00"]
    ):
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
        total_vectors = 1

    # ── AUDIO ─────────────────────────────────────────────────────────────────
    elif content_type in AUDIO_TYPES or filename.lower().endswith((".mp3", ".wav", ".ogg", ".m4a")):
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
        total_vectors = 1

    # ── DOCUMENTS (PDF / DOCX / PPTX / TXT / CSV / XLSX / etc.) ─────────────
    else:
        # Use the universal document parser — handles PDF correctly via PyMuPDF
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

            # Chunk each page independently and embed
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

        # Batch insert
        qdrant_manager.insert_vectors(all_embeddings, all_payloads)
        total_vectors = len(all_embeddings)
        extracted_text = "\n\n".join(full_text_parts)

    # Fire-and-forget graph extraction for all text content
    if extracted_text.strip():
        # Truncate to avoid hitting token limits
        graph_text = extracted_text[:6000]
        background_tasks.add_task(_store_graph_background, graph_text, source_id)

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

    url = request.url.strip()
    if not url.startswith(("http://", "https://")):
        raise HTTPException(status_code=400, detail="Invalid URL. Must start with http:// or https://")

    try:
        async with httpx.AsyncClient(timeout=20, follow_redirects=True) as client:
            resp = await client.get(url, headers={"User-Agent": "Mozilla/5.0"})
        resp.raise_for_status()
        html = resp.text
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"Could not fetch URL: {e}")

    # Simple HTML → plain text stripper
    class _Stripper(HTMLParser):
        def __init__(self):
            super().__init__()
            self.parts = []
            self._skip = False
        def handle_starttag(self, tag, attrs):
            if tag in ("script", "style", "nav", "header", "footer"):
                self._skip = True
        def handle_endtag(self, tag):
            if tag in ("script", "style", "nav", "header", "footer"):
                self._skip = False
        def handle_data(self, data):
            if not self._skip:
                stripped = data.strip()
                if stripped:
                    self.parts.append(stripped)

    parser = _Stripper()
    parser.feed(html)
    extracted_text = "\n".join(parser.parts)

    if len(extracted_text) < 50:
        raise HTTPException(status_code=422, detail="Could not extract meaningful text from the URL.")

    # Truncate to reasonable size (~50k chars)
    extracted_text = extracted_text[:50_000]

    source_id = str(uuid.uuid4())
    hostname  = url.split("/")[2]

    chunks    = text_processor.chunk_text(extracted_text)
    embeddings = text_processor.encode_batch([c["text"] for c in chunks])
    total_vectors = 0

    for i, (chunk, emb) in enumerate(zip(chunks, embeddings)):
        chunk_id = f"{source_id}_{i}"
        qdrant_manager.upsert_vector(
            chunk_id=chunk_id,
            vector=emb,
            payload={
                "text":      chunk["text"],
                "source_id": source_id,
                "filename":  hostname,
                "source":    url,
                "page":      i,
                "modality":  "text",
            },
        )
        text_processor.add_to_bm25_corpus(chunk["text"])
        total_vectors += 1

    background_tasks.add_task(_store_graph_background, extracted_text[:8000], source_id)

    logger.info("URL ingestion complete: url=%s, chunks=%d", url, total_vectors)
    return {
        "message":   "URL ingested successfully",
        "source_id": source_id,
        "filename":  hostname,
        "url":       url,
        "chunks":    total_vectors,
        "preview":   extracted_text[:300] + "...",
    }

