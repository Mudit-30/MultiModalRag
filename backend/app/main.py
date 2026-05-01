from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.api.endpoints import ingest, query, explain
from app.middleware.monitoring import MonitoringMiddleware
import logging

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)

app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    description="Multi-Modal Graph RAG — Agentic · Hybrid · SRLM",
    openapi_url=f"{settings.API_V1_STR}/openapi.json",
)

# Middleware
app.add_middleware(MonitoringMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routers
app.include_router(ingest.router, prefix="/ingest", tags=["Ingestion"])
app.include_router(query.router,  prefix="/query",  tags=["Query"])
app.include_router(explain.router, prefix="/explain", tags=["Explainability"])


@app.get("/health", tags=["System"])
async def health_check():
    return {
        "status":  "healthy",
        "project": settings.PROJECT_NAME,
        "version": settings.VERSION,
    }


@app.get("/debug/qdrant", tags=["Debug"])
async def debug_qdrant():
    """Show Qdrant collection stats and sample payloads."""
    from app.db.qdrant import qdrant_manager
    try:
        count = qdrant_manager.count()
        records, _ = qdrant_manager.client.scroll(
            collection_name=qdrant_manager.collection_name,
            limit=5,
            with_payload=True,
            with_vectors=False,
        )
        samples = [
            {
                "chunk_id": r.payload.get("chunk_id"),
                "filename": r.payload.get("filename"),
                "page":     r.payload.get("page"),
                "modality": r.payload.get("modality"),
                "preview":  (r.payload.get("text") or "")[:120],
            }
            for r in records
        ]
        return {"total_vectors": count, "samples": samples}
    except Exception as e:
        return {"error": str(e)}


@app.get("/debug/stats", tags=["Debug"])
async def debug_stats():
    """System-wide stats: Qdrant count, BM25 corpus size, Neo4j status."""
    from app.db.qdrant import qdrant_manager
    from app.db.neo4j import neo4j_manager
    from app.services.text_processor import text_processor

    qdrant_count = 0
    try:
        qdrant_count = qdrant_manager.count()
    except Exception:
        pass

    neo4j_status = "connected" if neo4j_manager.driver else "offline (graceful skip)"

    bm25_corpus_size = len(text_processor._bm25_corpus)

    return {
        "qdrant_vectors":    qdrant_count,
        "bm25_corpus_docs":  bm25_corpus_size,
        "neo4j":             neo4j_status,
        "embed_model":       "BAAI/bge-small-en-v1.5",
        "llm_smart":         "llama-3.3-70b-versatile",
        "llm_fast":          "llama-3.1-8b-instant",
    }
