# Zero-Memory Multi-Modal Graph RAG: Technical Architecture & Details

This document provides a 100% comprehensive technical breakdown of the platform, detailing the tech stack, the machine learning models, the custom-coded orchestration logic, and the deployment architecture. 

---

## 1. Complete Technology Stack

### System & Orchestration
- **Docker & Docker Compose**: The entire application is containerized. The `docker-compose.yml` spins up 4 distinct containers on a unified bridge network (`ragnet`): 
  1. **Frontend**: React application served via Nginx.
  2. **Backend**: FastAPI server handling logic and ML orchestration.
  3. **Qdrant**: High-performance Vector Database (v1.9.0).
  4. **Neo4j**: Graph Database (v5.12-community).

### Frontend (Client Layer)
- **Framework**: React 18, bootstrapped with **Vite** for optimized build performance.
- **Styling**: **Tailwind CSS** with custom glassmorphic configurations and **shadcn/ui** components.
- **Animation**: **Framer Motion** (`motion/react`) for layout transitions and interaction feedback.
- **State Management**: **Zustand** for a lightweight, reactive global state store.
- **Data Visualization**: **React Force Graph 2D** (D3-based) for the physics-enabled Knowledge Graph view.
- **Icons**: **Lucide React**.

### Backend (API & Logic Layer)
- **Framework**: **FastAPI** (Python 3.11), utilizing `async/await` for non-blocking I/O.
- **Orchestration**: **LangChain** for the ReAct agent framework and tool-binding.
- **Validation**: **Pydantic v2** for strict schema enforcement.
- **Retrieval Fusion**: Custom implementation of **BM25** (via `rank-bm25`) combined with Vector Search.

---

## 2. Databases & Retrieval Systems

### A. Qdrant (Vector Database)
- **Purporse**: Stores 384-dimensional dense vectors for semantic similarity.
- **Implementation**: Uses `Cosine` distance metrics. Payloads store metadata including `modality`, `filename`, and `page_number` for precise citations.

### B. Neo4j (Graph Database)
- **Purpose**: Stores the structured Knowledge Graph extracted from unstructured data.
- **Implementation**: The `neo4j_manager.py` uses the official Python driver to execute dynamic Cypher queries. It maps Entities (Nodes) and Relationships (Edges) with properties linking back to the original source chunks.

---

## 3. The Multi-Modal Processors & AI Models

| Modality | Task | Specific Model | Engine / Source |
| :--- | :--- | :--- | :--- |
| **Agentic Brain** | Orchestration | `llama-3.1-70b-versatile` | Groq Cloud |
| **Fast Reasoning** | Planning | `llama-3.1-8b-instant` | Groq Cloud |
| **Text** | Embeddings | `BAAI/bge-small-en-v1.5` | Local (Sentence-Transformers) |
| **Images** | Vision/OCR | `llama-3.2-11b-vision-preview` | Groq Cloud |
| **Audio** | Transcription | `whisper-base` | Local (OpenAI-Whisper) |
| **Graph** | Extraction | `llama-3.1-8b-instant` | Groq Cloud |

### Ingestion Logic:
1. **Document Processor**: Uses `PyMuPDF` for structural parsing and `RecursiveCharacterTextSplitter` (800 char chunks, 150 overlap).
2. **Image Processor**: Converts images to Base64 and sends them to the **Groq Vision API (LLaMA 3.2)**. The generated caption extracts text, data points, and visual descriptions.
3. **Audio Processor**: Utilizes local **OpenAI Whisper** for high-fidelity transcription.

---

## 4. Agentic Workflow (The "Brain")

The platform uses a **ReAct (Reasoning + Acting)** agent loop implemented in `orchestrator.py`.

### Step-by-Step Execution:
1. **Query Decomposition**: The query is broken into sub-components (e.g., "Find X" and "Link X to Y").
2. **Dynamic Planning**: The `planner.py` selects the best strategy (Vector, Graph, or Hybrid).
3. **Tool Execution**:
   - `VectorSearchTool`: Semantic retrieval from Qdrant.
   - `GraphSearchTool`: Entity/Relation traversal in Neo4j.
   - `WebSearchTool`: Live fallback via **Firecrawl**.
4. **SRLM Self-Reward Loop**: The generated answer is validated by a secondary agent. If inaccuracies or missing citations are found, it is sent back for regeneration (up to 3 retries).


### Transparency Layer:
The frontend intercepts the agent's internal trace and renders it in the **Explainability Panel**, allowing users to see exactly which documents and tools the AI used to reach its conclusion.

---

## 5. Docker & Deployment

- **Networking**: All services reside on the `ragnet` bridge network.
- **Health Checks**: The Backend service waits for Qdrant and Neo4j to be `healthy` before starting.
- **Persistence**: Data is stored in persistent Docker volumes (`qdrant_data`, `neo4j_data`).

