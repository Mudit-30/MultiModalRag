"""
TextProcessor — semantic chunking + BGE embeddings + BM25 sparse index.
Replaces the old 500-char/all-MiniLM implementation.
"""

import logging
import pickle
import os
from typing import List, Dict, Any

from langchain_text_splitters import RecursiveCharacterTextSplitter
from sentence_transformers import SentenceTransformer

logger = logging.getLogger(__name__)

# Better embedding model: BGE small — same 384-dim but far better retrieval quality
EMBED_MODEL_NAME = "BAAI/bge-small-en-v1.5"

# Project root for data storage
PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
BM25_INDEX_PATH = os.path.join(PROJECT_ROOT, "data", "bm25_index.pkl")


class TextProcessor:
    def __init__(self):
        self._model = None
        self._bm25 = None
        self._bm25_corpus: List[str] = []

        # Semantic chunker: 800-char chunks, 150 overlap
        self.splitter = RecursiveCharacterTextSplitter(
            chunk_size=800,
            chunk_overlap=150,
            separators=["\n\n", "\n", ". ", "! ", "? ", " ", ""],
        )

    # ── Lazy loaders ─────────────────────────────────────────────────────────

    @property
    def embed_model(self) -> SentenceTransformer:
        if self._model is None:
            logger.info("Loading BGE embedding model: %s", EMBED_MODEL_NAME)
            self._model = SentenceTransformer(EMBED_MODEL_NAME)
        return self._model

    def _save_bm25(self):
        try:
            os.makedirs(os.path.dirname(BM25_INDEX_PATH), exist_ok=True)
            with open(BM25_INDEX_PATH, "wb") as f:
                pickle.dump({"index": self._bm25, "corpus": self._bm25_corpus}, f)
            logger.info(f"BM25 index saved: {BM25_INDEX_PATH}")
        except Exception as e:
            logger.error(f"Failed to save BM25 index: {e}")

    @property
    def bm25(self):
        """Lazy-load or initialise BM25 from disk."""
        if self._bm25 is None:
            if os.path.exists(BM25_INDEX_PATH):
                try:
                    with open(BM25_INDEX_PATH, "rb") as f:
                        data = pickle.load(f)
                    self._bm25 = data["index"]
                    self._bm25_corpus = data["corpus"]
                    logger.info("BM25 index loaded from disk (%d docs)", len(self._bm25_corpus))
                except Exception as e:
                    logger.warning("Failed to load BM25 index: %s", e)
        return self._bm25

    # ── Core ─────────────────────────────────────────────────────────────────

    def reset(self):
        """Wipe BM25 index."""
        self._bm25_corpus = []
        self._bm25 = None
        if os.path.exists(BM25_INDEX_PATH):
            try:
                os.remove(BM25_INDEX_PATH)
            except Exception:
                pass
        logger.info("BM25 memory wiped.")

    def chunk_text(self, text: str) -> List[str]:
        """Split text into semantic chunks."""
        chunks = self.splitter.split_text(text)
        return chunks if chunks else [text]

    def embed(self, texts: List[str]) -> List[List[float]]:
        """Dense embeddings via BGE."""
        # BGE models benefit from a query prefix — but for indexing, use bare text
        vecs = self.embed_model.encode(texts, normalize_embeddings=True, show_progress_bar=False)
        return vecs.tolist()

    def process(self, text: str, page: int = 1, filename: str = "") -> List[Dict[str, Any]]:
        """
        Full ingestion pipeline for a page/section of text.
        Returns list of chunk dicts with text, embedding, bm25_score_vec, metadata.
        """
        chunks = self.chunk_text(text)
        if not chunks:
            return []

        enriched_chunks = []
        for c in chunks:
            enriched_chunks.append(f"Document File: {filename}\nPage: {page}\n\n{c}")
        chunks = enriched_chunks

        embeddings = self.embed(chunks)
        logger.info(f"Generated {len(embeddings)} embeddings for {filename}")

        # Update BM25 index with new chunks
        self._add_to_bm25(chunks)
        logger.info(f"Added {len(chunks)} chunks to BM25 index")

        results = []
        for i, (chunk, emb) in enumerate(zip(chunks, embeddings)):
            results.append({
                "text":        chunk,
                "embedding":   emb,
                "chunk_index": i,
                "page":        page,
                "filename":    filename,
            })
        return results

    def embed_query(self, query: str) -> List[float]:
        """Embed a search query (with BGE query prefix for better recall)."""
        prefixed = f"Represent this sentence for searching relevant passages: {query}"
        vec = self.embed_model.encode([prefixed], normalize_embeddings=True)[0]
        return vec.tolist()

    # ── BM25 sparse index ─────────────────────────────────────────────────────

    def _add_to_bm25(self, new_chunks: List[str]):
        """Add new documents to the BM25 index and persist."""
        try:
            from rank_bm25 import BM25Okapi

            # Simple tokeniser
            def tokenise(text: str):
                return text.lower().split()

            self._bm25_corpus.extend(new_chunks)
            tokenised = [tokenise(c) for c in self._bm25_corpus]
            self._bm25 = BM25Okapi(tokenised)

            # Persist
            os.makedirs(os.path.dirname(BM25_INDEX_PATH), exist_ok=True)
            with open(BM25_INDEX_PATH, "wb") as f:
                pickle.dump({"index": self._bm25, "corpus": self._bm25_corpus}, f)
        except ImportError:
            logger.warning("rank_bm25 not installed — BM25 sparse retrieval disabled")
        except Exception as e:
            logger.warning("BM25 update failed: %s", e)

    def bm25_search(self, query: str, top_k: int = 10) -> List[Dict[str, Any]]:
        """
        Return top-k chunks from the in-memory BM25 index.
        Falls back to empty list if index is not built.
        """
        if not self.bm25 or not self._bm25_corpus:
            return []
        try:
            tokens = query.lower().split()
            scores = self.bm25.get_scores(tokens)
            ranked = sorted(
                enumerate(scores), key=lambda x: x[1], reverse=True
            )[:top_k]
            return [
                {"text": self._bm25_corpus[i], "bm25_score": float(s), "chunk_index": i}
                for i, s in ranked
                if s > 0
            ]
        except Exception as e:
            logger.warning("BM25 search error: %s", e)
            return []


# Singleton
text_processor = TextProcessor()
