from typing import Optional, Any
import time

class SemanticCache:
    def __init__(self, threshold: float = 0.95):
        self._model = None
        self.threshold = threshold
        self.cache = []

    @property
    def model(self):
        if self._model is None:
            from sentence_transformers import SentenceTransformer
            self._model = SentenceTransformer('all-MiniLM-L6-v2')
        return self._model

    def get(self, query: str) -> Optional[Any]:
        if not self.cache:
            return None
        from sentence_transformers import util
        q_emb = self.model.encode(query, convert_to_tensor=True)
        for item in self.cache:
            score = util.cos_sim(q_emb, item['embedding']).item()
            if score >= self.threshold:
                print(f"Cache hit (score={score:.3f})")
                return item['response']
        return None

    def set(self, query: str, response: Any):
        q_emb = self.model.encode(query, convert_to_tensor=True)
        self.cache.append({'query': query, 'embedding': q_emb, 'response': response, 'timestamp': time.time()})
        if len(self.cache) > 100:
            self.cache.pop(0)

semantic_cache = SemanticCache()
