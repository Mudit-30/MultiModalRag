"""
Reranker — Cross-Encoder scoring with proper logging and score normalization.
"""
import logging
from typing import List, Dict, Any

logger = logging.getLogger(__name__)


class Reranker:
    def __init__(self):
        self._model = None

    @property
    def model(self):
        if self._model is None:
            from sentence_transformers import CrossEncoder
            logger.info("Loading CrossEncoder reranker: cross-encoder/ms-marco-MiniLM-L-6-v2")
            self._model = CrossEncoder("cross-encoder/ms-marco-MiniLM-L-6-v2")
        return self._model

    def rerank(self, query: str, contexts: List[Dict[str, Any]], top_k: int = 6) -> List[Dict[str, Any]]:
        """
        Score (query, passage) pairs with a Cross-Encoder and return top_k sorted by score.
        Falls back to original order on any error.
        """
        if not contexts:
            return []
        try:
            texts = [
                ctx.get("text") or ctx.get("caption") or ctx.get("transcript") or ""
                for ctx in contexts
            ]
            # Filter out empty texts so the model doesn't get empty strings
            valid_indices = [i for i, t in enumerate(texts) if t.strip()]
            if not valid_indices:
                return contexts[:top_k]

            valid_texts  = [texts[i] for i in valid_indices]
            valid_ctxs   = [contexts[i] for i in valid_indices]

            pairs  = [[query, t] for t in valid_texts]
            scores = self.model.predict(pairs, show_progress_bar=False)

            for ctx, score in zip(valid_ctxs, scores):
                ctx["rerank_score"] = float(score)

            ranked = sorted(valid_ctxs, key=lambda x: x.get("rerank_score", 0.0), reverse=True)
            logger.info("[Reranker] Scored %d candidates, returning top %d", len(ranked), top_k)
            return ranked[:top_k]

        except Exception as e:
            logger.warning("[Reranker] Failed (%s) — returning unranked results", e)
            return contexts[:top_k]


reranker = Reranker()
