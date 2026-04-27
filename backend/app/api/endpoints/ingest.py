from fastapi import APIRouter, UploadFile, File, HTTPException, BackgroundTasks
from app.services.text_processor import text_processor
from app.services.image_processor import image_processor
from app.services.audio_processor import audio_processor
from app.db.qdrant import qdrant_manager
from app.db.neo4j import neo4j_manager
from app.core.config import settings
import uuid
from datetime import datetime, timezone
import logging

logger = logging.getLogger(__name__)
router = APIRouter()

async def process_and_store_graph(text: str, source_id: str):
    """Background task: extract knowledge graph and store in Neo4j."""
    try:
        from langchain_groq import ChatGroq
        from app.services.graph_extractor import GraphExtractor
        llm = ChatGroq(api_key=settings.GROQ_API_KEY, model_name="llama-3.1-8b-instant", temperature=0)
        extractor = GraphExtractor(llm)
        graph_data = await extractor.extract(text)
        neo4j_manager.ingest_graph(graph_data, source_chunk_id=source_id)
        logger.info("Graph stored for source_id=%s", source_id)
    except Exception as e:
        logger.warning("Graph extraction skipped for %s: %s", source_id, e)

@router.post("/")
async def ingest_file(background_tasks: BackgroundTasks, file: UploadFile = File(...)):
    content_type = file.content_type or ""
    file_bytes = await file.read()
    source_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    extracted_text = ""

    if content_type.startswith("text/") or content_type == "application/pdf":
        try:
            extracted_text = file_bytes.decode("utf-8")
        except UnicodeDecodeError:
            raise HTTPException(status_code=400, detail="Cannot decode file as UTF-8 text")

        result = text_processor.process(extracted_text)
        payloads = [
            {
                "modality": "text",
                "source_id": source_id,
                "chunk_id": f"{source_id}_{i}",
                "timestamp": now,
                "text": chunk,
            }
            for i, chunk in enumerate(result["chunks"])
        ]
        qdrant_manager.insert_vectors(result["embeddings"], payloads)

    elif content_type.startswith("image/"):
        result = image_processor.process(file_bytes)
        extracted_text = result["caption"]
        payloads = [{
            "modality": "image",
            "source_id": source_id,
            "chunk_id": f"{source_id}_0",
            "timestamp": now,
            "caption": extracted_text,
            "text": extracted_text,   # unified text field for search
        }]
        qdrant_manager.insert_vectors([result["embedding"]], payloads)

    elif content_type.startswith("audio/"):
        result = audio_processor.process(file_bytes, file.filename or "audio.wav")
        extracted_text = result["transcript"]
        payloads = [{
            "modality": "audio",
            "source_id": source_id,
            "chunk_id": f"{source_id}_0",
            "timestamp": now,
            "transcript": extracted_text,
            "text": extracted_text,   # unified text field for search
        }]
        qdrant_manager.insert_vectors([result["embedding"]], payloads)

    else:
        raise HTTPException(status_code=400, detail=f"Unsupported file type: {content_type}")

    # Fire-and-forget graph extraction
    background_tasks.add_task(process_and_store_graph, extracted_text, source_id)

    return {
        "message": "Ingestion successful",
        "source_id": source_id,
        "modality": content_type.split("/")[0] if "/" in content_type else "unknown",
        "chunks": len(payloads),
    }
