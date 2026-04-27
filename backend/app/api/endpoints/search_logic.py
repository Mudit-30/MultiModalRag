from typing import Dict, Any
from app.db.qdrant import qdrant_manager
from app.db.neo4j import neo4j_manager
from app.services.graph_reasoner import graph_reasoner
from app.services.reranker import reranker
from app.core.config import settings
from sentence_transformers import SentenceTransformer
import logging

logger = logging.getLogger(__name__)

# Module-level singleton — loaded once on first import
_embed_model = None

def get_embed_model() -> SentenceTransformer:
    global _embed_model
    if _embed_model is None:
        logger.info("Loading sentence-transformer model for search...")
        _embed_model = SentenceTransformer('all-MiniLM-L6-v2')
    return _embed_model


async def execute_hybrid_search(query: str, strategy: str) -> Dict[str, Any]:
    model = get_embed_model()
    query_vec = model.encode(query).tolist()

    vector_results = []

    # ── Vector search (always run — GRAPH_ONLY falls back to VECTOR too for safety) ──
    try:
        hits = qdrant_manager.search(query_vec, limit=10)
        vector_results = [
            {
                "text": h.payload.get("text") or h.payload.get("caption") or h.payload.get("transcript") or "",
                "source_id": h.payload.get("source_id", ""),
                "chunk_id": h.payload.get("chunk_id", ""),
                "modality": h.payload.get("modality", "text"),
                "score": h.score,
            }
            for h in hits
            if h.payload.get("text") or h.payload.get("caption") or h.payload.get("transcript")
        ]
        logger.info("Vector search returned %d hits for strategy=%s", len(vector_results), strategy)
    except Exception as e:
        logger.error("Vector search error: %s", e)

    # ── Graph search (only for HYBRID or GRAPH_ONLY) ──
    graph_context = ""
    if strategy in ("GRAPH_ONLY", "HYBRID") and neo4j_manager.driver:
        try:
            from langchain_groq import ChatGroq
            from app.services.graph_extractor import GraphExtractor
            llm = ChatGroq(api_key=settings.GROQ_API_KEY, model_name="llama-3.1-8b-instant", temperature=0)
            extractor = GraphExtractor(llm)
            extraction = await extractor.extract(query)
            entities = [e.id for e in extraction.entities]
            if entities:
                subgraph = neo4j_manager.extract_subgraph(entities)
                graph_context = graph_reasoner.reason(subgraph)
                logger.info("Graph context generated for entities: %s", entities)
        except Exception as e:
            logger.warning("Graph search skipped: %s", e)

    # ── Rerank ──
    reranked = reranker.rerank(query, vector_results, top_k=5) if vector_results else []

    context_blocks = [v["text"] for v in reranked if v.get("text")]
    if graph_context:
        context_blocks.append(graph_context)

    final_context = "\n\n---\n\n".join(context_blocks)
    logger.info("Final context length: %d chars from %d chunks", len(final_context), len(context_blocks))

    return {
        "context": final_context,
        "source_ids": list({v["source_id"] for v in reranked if v.get("source_id")}),
        "retrieved_chunks": reranked,
    }


def rrf_fusion(vector_hits, graph_hits, k: int = 60):
    scores: Dict[str, float] = {}
    for i, hit in enumerate(sorted(vector_hits, key=lambda x: x.get('score', 0), reverse=True)):
        doc_id = hit.get('source_id', str(i))
        scores[doc_id] = scores.get(doc_id, 0) + 1.0 / (k + i + 1)
    for i, hit in enumerate(sorted(graph_hits, key=lambda x: x.get('path_confidence', 0), reverse=True)):
        doc_id = hit.get('source_id', f"g{i}")
        scores[doc_id] = scores.get(doc_id, 0) + 1.0 / (k + i + 1)
    return sorted(scores.items(), key=lambda x: x[1], reverse=True)
