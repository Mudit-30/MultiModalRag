from sentence_transformers import CrossEncoder
from typing import List, Dict, Any

class Reranker:
    def __init__(self):
        self._model = None

    @property
    def model(self):
        if self._model is None:
            print("Loading CrossEncoder reranker model...")
            self._model = CrossEncoder('cross-encoder/ms-marco-MiniLM-L-6-v2')
        return self._model

    def rerank(self, query: str, contexts: List[Dict[str, Any]], top_k: int = 5) -> List[Dict[str, Any]]:
        if not contexts:
            return []
        texts = [ctx.get('text') or ctx.get('caption') or ctx.get('transcript') or "" for ctx in contexts]
        pairs = [[query, t] for t in texts]
        scores = self.model.predict(pairs)
        for i, ctx in enumerate(contexts):
            ctx['rerank_score'] = float(scores[i])
        return sorted(contexts, key=lambda x: x['rerank_score'], reverse=True)[:top_k]

reranker = Reranker()
