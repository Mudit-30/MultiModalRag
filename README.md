# 🧠 Multi-Modal Graph RAG System

> **Production-grade Retrieval-Augmented Generation** combining multi-modal ingestion, an agentic orchestration layer, hybrid vector-graph retrieval, and a real-time React dashboard.

---

## 🎯 Overview

Traditional RAG systems operate on a single modality (text) and retrieve flat document chunks. This system goes beyond by:

- Ingesting **text, images, and audio** into a unified 384-dimensional vector space
- Building a **temporal knowledge graph** in Neo4j during ingestion
- Using a **4-agent pipeline** (Decompose → Plan → Retrieve → Validate) powered by Groq's Llama 3
- Fusing vector and graph results via **Reciprocal Rank Fusion (RRF)** + **Cross-Encoder reranking**
- Serving everything through a **live React UI** with graph visualization, citation panel, and explainability trace

---

## ✨ Key Features

| Feature | Detail |
|---|---|
| **Multi-Modal Ingestion** | Text/PDF → chunking + embedding; Image → BLIP captioning + embedding; Audio → Whisper transcription + embedding |
| **Agentic Orchestration** | QueryDecomposer, RetrievalPlanner, AnswerValidator agents with structured LLM outputs |
| **Hybrid Retrieval** | Qdrant (dense vectors) + Neo4j (graph paths) fused with RRF |
| **Semantic Cache** | Cosine-similarity cache hits for repeated/near-identical queries |
| **Cross-Encoder Reranking** | `ms-marco-MiniLM-L-6-v2` secondary ranking for precision |
| **Temporal Knowledge Graph** | Entities, relations, confidence scores, and `valid_from`/`valid_until` metadata |
| **Explainability** | Per-query timeline: decomposition → retrieval → validation steps |
| **Evaluation Metrics** | Faithfulness, context precision, graph coverage, modality breakdown |

---

## 🛠️ Tech Stack

### Backend
- **FastAPI** (async, Python 3.11)
- **Qdrant** — vector store (Cosine, dim=384)
- **Neo4j 5.x** — temporal knowledge graph
- **Groq API** — `llama-3.3-70b-versatile` (routing/answering) + `llama-3.1-8b-instant` (extraction)
- **Sentence-Transformers** — `all-MiniLM-L6-v2` unified embeddings
- **OpenAI Whisper** — audio transcription
- **LangChain Core + LangChain-Groq** — LLM chains + structured output

### Frontend
- **React 19** + **Vite**
- **Tailwind CSS v4**
- **react-force-graph** — live 3D knowledge graph visualization
- **Zustand** — global state management
- **shadcn/ui** — component library

### Infrastructure
- **Docker Compose** — Qdrant + Neo4j + Backend + Frontend (Nginx)
- **Multi-stage Dockerfiles** — minimal production images

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────┐
│                     React Frontend                       │
│   Chat UI │ Graph Visualization │ Citations │ Trace      │
└───────────────────────┬─────────────────────────────────┘
                        │ HTTP / REST
┌───────────────────────▼─────────────────────────────────┐
│                  FastAPI Backend                          │
│  ┌─────────────────────────────────────────────────┐    │
│  │            Agentic Orchestrator                  │    │
│  │  QueryDecomposer → RetrievalPlanner → Validator  │    │
│  └──────────┬─────────────────────┬────────────────┘    │
│             │                     │                      │
│  ┌──────────▼──────┐   ┌──────────▼──────────┐         │
│  │  Qdrant Manager │   │   Neo4j Manager       │         │
│  │  (Vector Search)│   │  (Graph Traversal)    │         │
│  └─────────────────┘   └───────────────────────┘         │
│             │                     │                      │
│  ┌──────────▼─────────────────────▼────────────┐        │
│  │    RRF Fusion + Cross-Encoder Reranker       │        │
│  └──────────────────────────────────────────────┘        │
└─────────────────────────────────────────────────────────┘
```

---

## 📂 Project Structure

```
MultiModalGraphRAG/
├── backend/
│   ├── app/
│   │   ├── agents/           # Orchestrator, Decomposer, Planner, Validator
│   │   ├── api/
│   │   │   └── endpoints/    # ingest.py, query.py, explain.py, search_logic.py
│   │   ├── cache/            # semantic_cache.py
│   │   ├── core/             # config.py (Pydantic Settings)
│   │   ├── db/               # qdrant.py, neo4j.py (lazy + fallback)
│   │   ├── evaluation/       # metrics.py (faithfulness, precision, graph coverage)
│   │   ├── middleware/       # monitoring.py (structured access logs)
│   │   ├── services/         # text_processor.py, image_processor.py,
│   │   │                     # audio_processor.py, reranker.py,
│   │   │                     # graph_extractor.py, graph_reasoner.py
│   │   └── main.py
│   ├── Dockerfile
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── components/       # ChatInterface, GraphVisualization, CitationPanel,
│   │   │                     # ExplainabilityPanel, UploadZone
│   │   ├── store/            # useStore.js (Zustand)
│   │   └── App.jsx
│   ├── Dockerfile
│   └── nginx.conf
├── demo/                     # Sample documents + presentation script
├── docker-compose.yml
├── .env.example
└── README.md
```

---

## 🚀 Quickstart

### Option A — Docker (Recommended, runs everything)

```bash
# 1. Copy environment template
cp .env.example backend/.env
# Edit backend/.env and set your GROQ_API_KEY

# 2. Build and run all services
docker compose up --build

# 3. Access
#   UI:          http://localhost:5173
#   API Docs:    http://localhost:8000/docs
#   Neo4j:       http://localhost:7474  (user: neo4j, pass: testpassword)
#   Qdrant:      http://localhost:6333/dashboard
```

### Option B — Local Dev (no Docker needed)

```bash
# ── Backend ──────────────────────────────────────────────
cd backend
pip install -r requirements.txt

# Create backend/.env from the template
cp ../.env.example .env
# Set GROQ_API_KEY in .env

uvicorn app.main:app --reload --port 8000
# API running at http://localhost:8000
# Qdrant auto-falls-back to local persistent storage (no Docker needed)
# Neo4j features gracefully disabled if not running

# ── Frontend ─────────────────────────────────────────────
cd frontend
npm install
npm run dev
# UI running at http://localhost:5173
```

---

## 🔑 Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `GROQ_API_KEY` | ✅ | — | Groq API key (get at console.groq.com) |
| `QDRANT_HOST` | No | `localhost` | Qdrant host |
| `QDRANT_PORT` | No | `6333` | Qdrant port |
| `NEO4J_URI` | No | `bolt://localhost:7687` | Neo4j bolt URI |
| `NEO4J_USER` | No | `neo4j` | Neo4j username |
| `NEO4J_PASSWORD` | No | `testpassword` | Neo4j password |

---

## 📡 API Endpoints

| Method | Path | Description |
|---|---|---|
| `POST` | `/ingest/` | Upload a file (text/image/audio) for ingestion |
| `POST` | `/query/agentic` | Run a query through the full agentic pipeline |
| `POST` | `/explain/` | Get evaluation metrics for a query-context-answer triple |
| `GET` | `/health` | Service health check |
| `GET` | `/debug/qdrant` | Dev-only: inspect stored vectors |
| `GET` | `/docs` | Swagger UI (interactive API docs) |

---

## 🎬 Demo Script (10 minutes — May 2nd Presentation)

| Time | Action |
|---|---|
| `0:00–1:00` | Open UI. Show the split layout: Chat (left), Panels (right). Quick intro. |
| `1:00–2:30` | Upload `patient_case.txt`, `xray_report.txt`, `doctor_notes.txt` via Upload tab. |
| `2:30–4:00` | **Query 1**: *"What are the primary symptoms of the patient?"* → Show single vector hit, agent trace. |
| `4:00–7:00` | **Query 2**: *"What connects the X-ray findings to the prescribed treatment?"* → Switch to Graph tab, show multi-hop path. |
| `7:00–9:30` | **Query 3**: *"Trace the full diagnostic journey from the initial symptom to the final medication and explain why each step was necessary."* → Show full agentic trace + 5 cited chunks. |
| `9:30–10:00` | Wrap-up: mention RRF, Semantic Cache, Temporal KG, Docker deployment. |

---

## 🧪 Running Tests

```bash
cd backend
# Health check
curl http://localhost:8000/health

# Ingest a demo file
curl -X POST http://localhost:8000/ingest/ -F "file=@../demo/patient_case.txt"

# Query the system
curl -X POST http://localhost:8000/query/agentic \
  -H "Content-Type: application/json" \
  -d '{"query": "What are the symptoms and treatment plan for the patient?"}'
```

---

## 📄 License

MIT License — free to use for academic and personal projects.
