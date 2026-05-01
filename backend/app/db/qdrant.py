"""
QdrantManager — unified API using query_points() throughout.
Supports dense vector search and hybrid retrieval with BM25 scoring.
"""

import uuid
import os
import logging
from typing import List, Dict, Any, Optional

from qdrant_client import QdrantClient
from qdrant_client.models import (
    Distance, VectorParams, PointStruct,
    Filter, FieldCondition, MatchValue,
)
from app.core.config import settings

logger = logging.getLogger(__name__)

PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
LOCAL_STORAGE_PATH = os.path.join(PROJECT_ROOT, "data", "qdrant_local")


class QdrantManager:
    def __init__(self):
        self._client: Optional[QdrantClient] = None
        self.collection_name = "multimodal_rag"
        self.vector_size = 384  # BGE-small-en-v1.5 output dim

    # ── Client (lazy, persistent-first) ──────────────────────────────────────

    @property
    def client(self) -> QdrantClient:
        if self._client is None:
            # Try remote Docker first, fall back to local persistent
            try:
                # Try remote first (Docker/Dev)
                self._client = QdrantClient(host=settings.QDRANT_HOST, port=settings.QDRANT_PORT, timeout=5)
                self._client.get_collections()
                logger.info(f"Connected to Qdrant server at {settings.QDRANT_HOST}:{settings.QDRANT_PORT}")
            except Exception:
                # Fallback to local storage
                logger.info(f"Using local Qdrant storage at {LOCAL_STORAGE_PATH}")
                os.makedirs(LOCAL_STORAGE_PATH, exist_ok=True)
                try:
                    self._client = QdrantClient(path=LOCAL_STORAGE_PATH)
                    logger.info("Local Qdrant client initialized.")
                except Exception as e:
                    logger.error(f"FATAL: Could not initialize Qdrant client: {e}")
                    raise
            
            self._ensure_collection()
        return self._client

    def _ensure_collection(self):
        """Create collection if it doesn't exist."""
        names = [c.name for c in self._client.get_collections().collections]
        if self.collection_name not in names:
            self._client.create_collection(
                collection_name=self.collection_name,
                vectors_config=VectorParams(
                    size=self.vector_size,
                    distance=Distance.COSINE,
                ),
            )
            logger.info("[Qdrant] Collection created: %s", self.collection_name)
        else:
            logger.info("[Qdrant] Collection exists: %s", self.collection_name)

    # ── Write ─────────────────────────────────────────────────────────────────

    def reset(self):
        """Wipe all memory from Qdrant."""
        try:
            self.client.delete_collection(self.collection_name)
            self._ensure_collection()
            logger.info("[Qdrant] Memory wiped.")
        except Exception as e:
            logger.error("[Qdrant] Reset error: %s", e)

    def insert_vectors(self, vectors: List[List[float]], payloads: List[Dict[str, Any]]):
        """Upsert embedding vectors with associated payloads."""
        points = [
            PointStruct(
                id=str(uuid.uuid4()),
                vector=vec,
                payload=payload,
            )
            for vec, payload in zip(vectors, payloads)
        ]
        self.client.upsert(
            collection_name=self.collection_name,
            points=points,
            wait=True,
        )
        logger.info("[Qdrant] Inserted %d vectors", len(points))

    # ── Read ──────────────────────────────────────────────────────────────────

    def dense_search(self, query_vector: List[float], limit: int = 15) -> List[Dict[str, Any]]:
        """
        Dense vector search — works with both remote and local Qdrant clients.
        Always uses query_points() which is supported by both.
        """
        try:
            result = self.client.query_points(
                collection_name=self.collection_name,
                query=query_vector,
                limit=limit,
                with_payload=True,
            )
            hits = result.points
        except Exception as e:
            logger.error("[Qdrant] dense_search error: %s", e)
            return []

        return [
            {
                "text":        h.payload.get("text") or h.payload.get("caption") or h.payload.get("transcript") or "",
                "source_id":   h.payload.get("source_id", ""),
                "chunk_id":    h.payload.get("chunk_id", ""),
                "chunk_index": h.payload.get("chunk_index", 0),
                "page":        h.payload.get("page", 1),
                "filename":    h.payload.get("filename", ""),
                "modality":    h.payload.get("modality", "text"),
                "score":       h.score,
            }
            for h in hits
            if h.payload.get("text") or h.payload.get("caption") or h.payload.get("transcript")
        ]

    # Keep .search() as an alias for backward compatibility with search_logic.py
    def search(self, query_vector: List[float], limit: int = 15) -> List[Dict[str, Any]]:
        return self.dense_search(query_vector, limit)

    def get_all_texts(self, limit: int = 2000) -> List[Dict[str, Any]]:
        """Retrieve all stored chunks (for BM25 scoring at query time)."""
        try:
            result = self.client.scroll(
                collection_name=self.collection_name,
                limit=limit,
                with_payload=True,
                with_vectors=False,
            )
            records = result[0]
            return [
                {
                    "text":        r.payload.get("text", ""),
                    "source_id":   r.payload.get("source_id", ""),
                    "chunk_id":    r.payload.get("chunk_id", ""),
                    "chunk_index": r.payload.get("chunk_index", 0),
                    "page":        r.payload.get("page", 1),
                    "filename":    r.payload.get("filename", ""),
                    "modality":    r.payload.get("modality", "text"),
                }
                for r in records
                if r.payload.get("text")
            ]
        except Exception as e:
            logger.warning("[Qdrant] get_all_texts error: %s", e)
            return []

    def count(self) -> int:
        """Return the number of indexed points."""
        try:
            info = self.client.get_collection(self.collection_name)
            return info.points_count or 0
        except Exception:
            return 0


qdrant_manager = QdrantManager()
