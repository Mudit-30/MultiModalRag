"""
Simple in-memory semantic cache.
Disabled by default in the orchestrator to prevent stale responses.
Only used if explicitly enabled.
"""
from typing import Optional, Any
import time


class SemanticCache:
    def __init__(self, threshold: float = 0.95):
        self.threshold = threshold
        self.cache = []
        self._model = None
        self._enabled = False  # Off by default — set to True to enable

    @property
    def model(self):
        if self._model is None:
            from sentence_transformers import SentenceTransformer
            self._model = SentenceTransformer('all-MiniLM-L6-v2')
        return self._model

    def get(self, query: str) -> Optional[Any]:
        if not self._enabled or not self.cache:
            return None
        try:
            from sentence_transformers import util
            q_emb = self.model.encode(query, convert_to_tensor=True)
            for item in self.cache:
                score = util.cos_sim(q_emb, item['embedding']).item()
                if score >= self.threshold:
                    return item['response']
        except Exception:
            pass
        return None

    def set(self, query: str, response: Any):
        if not self._enabled:
            return
        try:
            q_emb = self.model.encode(query, convert_to_tensor=True)
            self.cache.append({
                'query': query,
                'embedding': q_emb,
                'response': response,
                'timestamp': time.time(),
            })
            if len(self.cache) > 100:
                self.cache.pop(0)
        except Exception:
            pass


semantic_cache = SemanticCache()
