"""
reset_db.py — Clear Qdrant collection and BM25 index.
Run this once after upgrading from all-MiniLM to BGE embeddings.
Also pre-downloads the BGE model so first query is instant.

Usage:
    python reset_db.py
"""

import os
import sys
import shutil

ROOT    = os.path.dirname(os.path.abspath(__file__))
BACKEND = os.path.join(ROOT, "backend")
sys.path.insert(0, BACKEND)

DATA_DIR     = os.path.join(BACKEND, "data")
QDRANT_DIR   = os.path.join(DATA_DIR, "qdrant_local")
BM25_PATH    = os.path.join(DATA_DIR, "bm25_index.pkl")

print("\n  Multi-Modal Graph RAG — Database Reset & Model Pre-loader")
print("  " + "=" * 56)

# ── 1. Clear Qdrant local storage ─────────────────────────────────────────────
if os.path.isdir(QDRANT_DIR):
    shutil.rmtree(QDRANT_DIR)
    print(f"\n  [OK] Cleared Qdrant local storage: {QDRANT_DIR}")
else:
    print(f"\n  [--] Qdrant local storage not found (already clean)")

# ── 2. Clear BM25 index ───────────────────────────────────────────────────────
if os.path.exists(BM25_PATH):
    os.remove(BM25_PATH)
    print(f"  [OK] Cleared BM25 index: {BM25_PATH}")
else:
    print(f"  [--] BM25 index not found (already clean)")

# ── 3. Pre-download BGE model ─────────────────────────────────────────────────
print("\n  Downloading BAAI/bge-small-en-v1.5 embedding model ...")
try:
    from sentence_transformers import SentenceTransformer
    model = SentenceTransformer("BAAI/bge-small-en-v1.5")
    test  = model.encode(["test"], normalize_embeddings=True)
    print(f"  [OK] BGE model ready — dim={test.shape[1]}")
except Exception as e:
    print(f"  [!!] BGE model download failed: {e}")

# ── 4. Re-initialise Qdrant collection ────────────────────────────────────────
print("\n  Initialising fresh Qdrant collection ...")
try:
    os.environ.setdefault("PYTHONPATH", BACKEND)
    # Load env
    from dotenv import load_dotenv
    load_dotenv(os.path.join(BACKEND, ".env"))

    from app.db.qdrant import qdrant_manager
    count = qdrant_manager.count()
    print(f"  [OK] Qdrant collection ready — {count} vectors (should be 0)")
except Exception as e:
    print(f"  [!!] Qdrant init error: {e}")

print("\n  Reset complete. You can now re-ingest your documents.")
print("  Run:  python run.py\n")
