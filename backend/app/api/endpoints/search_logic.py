"""
Hybrid search: Dense (BGE) + Sparse (BM25) with RRF Fusion + Cross-Encoder Reranking.
All results carry page + filename metadata for frontend citations.
"""

import logging
from typing import Dict, Any, List

from app.db.qdrant import qdrant_manager
from app.db.neo4j import neo4j_manager
from app.services.text_processor import text_processor
from app.services.graph_reasoner import graph_reasoner
from app.services.reranker import reranker
from app.core.config import settings

logger = logging.getLogger(__name__)


# ── RRF Fusion ────────────────────────────────────────────────────────────────

def rrf_fusion(
    dense_hits:  List[Dict],
    sparse_hits: List[Dict],
    k: int = 60,
) -> List[Dict]:
    """
    Reciprocal Rank Fusion — merges dense vector results and BM25 sparse results.
    Returns deduplicated list sorted by fused score.
    """
    scores: Dict[str, float] = {}
    meta:   Dict[str, Dict]  = {}

    def _rank_list(hits: List[Dict], score_key: str = "score"):
        for rank, hit in enumerate(
            sorted(hits, key=lambda x: x.get(score_key, 0), reverse=True)
        ):
            key = hit.get("chunk_id") or hit.get("text", "")[:60]
            scores[key] = scores.get(key, 0.0) + 1.0 / (k + rank + 1)
            if key not in meta:
                meta[key] = hit

    _rank_list(dense_hits,  score_key="score")
    _rank_list(sparse_hits, score_key="bm25_score")

    fused = sorted(scores.items(), key=lambda x: x[1], reverse=True)
    results = []
    for key, rrf_score in fused:
        item = dict(meta.get(key, {}))
        item["rrf_score"] = rrf_score
        results.append(item)
    return results


# ── Main search function ──────────────────────────────────────────────────────

async def execute_hybrid_search(query: str, strategy: str = "HYBRID") -> Dict[str, Any]:
    """
    Full hybrid retrieval pipeline:
      1. Dense search  (BGE embeddings → Qdrant)
      2. Sparse search (BM25 on in-memory corpus)
      3. RRF Fusion
      4. Graph traversal (if HYBRID / GRAPH_ONLY and Neo4j is live)
      5. Cross-Encoder Reranking
    """

    # ── 1. Dense vector search ────────────────────────────────────────────────
    query_vec = text_processor.embed_query(query)

    dense_hits = []
    try:
        dense_hits = qdrant_manager.dense_search(query_vec, limit=20)
        logger.info("[Search] Dense: %d hits", len(dense_hits))
    except Exception as e:
        logger.error("[Search] Dense search error: %s", e)

    if not dense_hits:
        logger.warning("[Search] No dense hits — knowledge base may be empty. Ingest data first.")

    # ── 2. Sparse BM25 search ─────────────────────────────────────────────────
    sparse_hits = []
    if strategy != "GRAPH_ONLY":
        try:
            sparse_hits = text_processor.bm25_search(query, top_k=20)
            # Enrich sparse hits with Qdrant metadata if chunk_index matches
            all_texts = None
            if sparse_hits:
                all_texts = qdrant_manager.get_all_texts(limit=5000)
                text_map = {r["text"][:60]: r for r in all_texts}
                for sh in sparse_hits:
                    key = sh.get("text", "")[:60]
                    if key in text_map:
                        sh.update(text_map[key])
            logger.info("[Search] BM25: %d hits", len(sparse_hits))
        except Exception as e:
            logger.warning("[Search] BM25 search error: %s", e)

    # ── 3. RRF Fusion ─────────────────────────────────────────────────────────
    if dense_hits or sparse_hits:
        fused = rrf_fusion(dense_hits, sparse_hits)
    else:
        fused = []
    logger.info("[Search] Fused: %d candidates", len(fused))

    # ── 4. Graph traversal (HYBRID / GRAPH_ONLY) ──────────────────────────────
    graph_context = ""
    frontend_graph_data = {"nodes": [], "links": []}
    if strategy in ("HYBRID", "GRAPH_ONLY") and neo4j_manager.driver:
        try:
            from langchain_groq import ChatGroq
            from app.services.graph_extractor import GraphExtractor
            llm = ChatGroq(
                api_key=settings.GROQ_API_KEY,
                model_name="llama-3.1-8b-instant",
                temperature=0,
            )
            extractor = GraphExtractor(llm)
            extraction = await extractor.extract(query)
            entities = [e.id for e in extraction.entities]
            if entities:
                subgraph = neo4j_manager.extract_subgraph(entities)
                graph_context = graph_reasoner.reason(subgraph)
                logger.info("[Search] Graph context: %d chars for entities: %s", len(graph_context), entities)
                
                # Parse Neo4j subgraph for frontend D3 visualization
                seen_nodes = set()
                seen_links = set()
                for path in subgraph.get("paths", []):
                    nodes_list = path.get("nodes", [])
                    rels_list = path.get("rels", [])
                    
                    for node in nodes_list:
                        nid = node.get("id")
                        if nid and nid not in seen_nodes:
                            seen_nodes.add(nid)
                            frontend_graph_data["nodes"].append({"id": nid, "name": nid, "label": node.get("type", "Entity")})
                            
                    for i, rel in enumerate(rels_list):
                        if i + 1 < len(nodes_list):
                            src = nodes_list[i].get("id")
                            tgt = nodes_list[i+1].get("id")
                            if src and tgt:
                                l_key = f"{src}->{tgt}"
                                if l_key not in seen_links:
                                    seen_links.add(l_key)
                                    frontend_graph_data["links"].append({"source": src, "target": tgt, "label": rel[1] if isinstance(rel, tuple) else rel.get("type", "RELATED")})
        except Exception as e:
            logger.warning("[Search] Graph search skipped: %s", e)

    # ── 5. Rerank ─────────────────────────────────────────────────────────────
    # Convert fused results to the format reranker expects
    rerank_candidates = [
        {
            "text":        h.get("text", ""),
            "source_id":   h.get("source_id", ""),
            "chunk_id":    h.get("chunk_id", ""),
            "page":        h.get("page", 1),
            "filename":    h.get("filename", ""),
            "modality":    h.get("modality", "text"),
            "score":       h.get("rrf_score", h.get("score", 0.0)),
        }
        for h in fused
        if h.get("text")
    ]

    reranked = []
    if rerank_candidates:
        try:
            reranked = reranker.rerank(query, rerank_candidates, top_k=6)
        except Exception as e:
            logger.warning("[Search] Reranker failed (%s) — using RRF order", e)
            reranked = rerank_candidates[:6]

    logger.info("[Search] Reranked: %d final chunks", len(reranked))

    # ── Build final context ────────────────────────────────────────────────────
    context_blocks = []
    for i, chunk in enumerate(reranked):
        text = chunk.get("text", "").strip()
        if not text:
            continue
        # Add source attribution inline for LLM context
        fname = chunk.get("filename", "")
        page  = chunk.get("page", 1)
        attribution = f"[Source: {fname}, Page {page}]" if fname else f"[Chunk {i+1}]"
        context_blocks.append(f"{attribution}\n{text}")

    if graph_context:
        context_blocks.append(f"[Knowledge Graph]\n{graph_context}")

    final_context = "\n\n---\n\n".join(context_blocks)
    logger.info("[Search] Final context: %d chars from %d chunks", len(final_context), len(context_blocks))

    return {
        "context":         final_context,
        "source_ids":      list({c.get("source_id", "") for c in reranked}),
        "retrieved_chunks": reranked,
        "graph_data":      frontend_graph_data if 'frontend_graph_data' in locals() else None,
    }
