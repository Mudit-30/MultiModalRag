"""
seed_demo.py — Ingest the 3 medical demo documents into the RAG system.
Run AFTER the backend is started (python run.py).

Usage:
    python seed_demo.py
"""

import os
import sys
import time
import httpx

BACKEND_URL = "http://localhost:8000"
DEMO_DIR    = os.path.join(os.path.dirname(os.path.abspath(__file__)), "demo")

DEMO_FILES = [
    "patient_case.txt",
    "xray_report.txt",
    "doctor_notes.txt",
]

DEMO_QUERIES = [
    "What are the primary symptoms the patient reported on admission?",
    "What did the chest X-ray reveal about the patient's cardiac and pulmonary status?",
    "What medications were prescribed and why?",
    "What connects the X-ray cardiomegaly finding to the prescribed treatment plan?",
]

print("\n  Multi-Modal Graph RAG — Demo Seeder")
print("  " + "=" * 50)


def wait_for_backend(timeout: int = 30):
    print(f"\n  Waiting for backend at {BACKEND_URL} ...")
    start = time.time()
    while time.time() - start < timeout:
        try:
            r = httpx.get(f"{BACKEND_URL}/health", timeout=3)
            if r.status_code == 200:
                print(f"  [OK] Backend is up")
                return True
        except Exception:
            pass
        time.sleep(2)
    print(f"  [XX] Backend not reachable after {timeout}s")
    return False


def ingest_file(path: str) -> dict:
    filename = os.path.basename(path)
    with open(path, "rb") as f:
        content = f.read()
    r = httpx.post(
        f"{BACKEND_URL}/ingest/",
        files={"file": (filename, content, "text/plain")},
        timeout=60,
    )
    r.raise_for_status()
    return r.json()


def run_query(query: str) -> dict:
    r = httpx.post(
        f"{BACKEND_URL}/query/agentic",
        json={"query": query},
        timeout=120,
    )
    r.raise_for_status()
    return r.json()


def check_stats():
    try:
        r = httpx.get(f"{BACKEND_URL}/debug/stats", timeout=10)
        return r.json()
    except Exception as e:
        return {"error": str(e)}


if __name__ == "__main__":
    if not wait_for_backend():
        sys.exit(1)

    # ── Ingest demo documents ────────────────────────────────────────────────
    print("\n  Ingesting demo documents ...")
    for fname in DEMO_FILES:
        path = os.path.join(DEMO_DIR, fname)
        if not os.path.exists(path):
            print(f"  [!!] Not found: {path} — skipping")
            continue
        try:
            result = ingest_file(path)
            print(
                f"  [OK] {fname:30s}  {result.get('chunks', '?')} chunks  "
                f"source_id={result.get('source_id', '?')[:8]}..."
            )
            if result.get("preview"):
                print(f"       Preview: {result['preview'][:80]}...")
        except Exception as e:
            print(f"  [XX] Failed to ingest {fname}: {e}")

    # ── Stats after ingestion ────────────────────────────────────────────────
    print("\n  Database stats after ingestion:")
    stats = check_stats()
    for k, v in stats.items():
        print(f"    {k:25s}: {v}")

    # ── Run demo queries ─────────────────────────────────────────────────────
    print("\n  Running demo queries ...")
    print("  " + "-" * 50)
    for i, q in enumerate(DEMO_QUERIES, 1):
        print(f"\n  Query {i}: {q}")
        try:
            result  = run_query(q)
            answer  = result.get("answer", "")
            conf    = result.get("confidence", 0)
            chunks  = len(result.get("citations", []))
            steps   = len(result.get("trace", {}).get("timeline", []))

            print(f"  Confidence: {conf:.2f}  |  Citations: {chunks}  |  Trace steps: {steps}")
            print(f"  Answer: {answer[:300]}{'...' if len(answer) > 300 else ''}")
        except Exception as e:
            print(f"  [XX] Query failed: {e}")
        print("  " + "-" * 50)

    print("\n  Demo seeding complete! Open http://localhost:5173 to explore.\n")
