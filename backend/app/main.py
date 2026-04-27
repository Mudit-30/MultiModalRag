from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.api.endpoints import ingest, query, explain
from app.middleware.monitoring import MonitoringMiddleware
import logging

logging.basicConfig(level=logging.INFO)

app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    openapi_url=f"{settings.API_V1_STR}/openapi.json",
)

# Monitoring
app.add_middleware(MonitoringMiddleware)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],   # Permissive for dev; restrict in prod
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routers
app.include_router(ingest.router, prefix="/ingest", tags=["ingestion"])
app.include_router(query.router, prefix="/query", tags=["query"])
app.include_router(explain.router, prefix="/explain", tags=["explainability"])

@app.get("/health")
async def health_check():
    return {"status": "healthy", "project": settings.PROJECT_NAME, "version": settings.VERSION}

@app.get("/debug/qdrant")
async def debug_qdrant():
    """Dev-only: check what's stored in Qdrant."""
    from app.db.qdrant import qdrant_manager
    try:
        info = qdrant_manager.client.get_collection(qdrant_manager.collection_name)
        count = info.points_count
        # Scroll first 5 points
        results, _ = qdrant_manager.client.scroll(
            collection_name=qdrant_manager.collection_name,
            limit=5,
            with_payload=True,
            with_vectors=False,
        )
        samples = [{"payload": r.payload} for r in results]
        return {"total_vectors": count, "samples": samples}
    except Exception as e:
        return {"error": str(e)}
