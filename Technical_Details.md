# Zero-Memory Multi-Modal Graph RAG: Technical Architecture & Details

This document provides a 100% comprehensive technical breakdown of the platform, detailing the tech stack, the machine learning models, the custom-coded orchestration logic, and the deployment architecture. 

---

## 1. Complete Technology Stack

### System & Orchestration
- **Docker & Docker Compose**: The entire application is containerized. The `docker-compose.yml` spins up 4 distinct containers on a unified bridge network (`ragnet`): 
  1. Frontend (React)
  2. Backend (FastAPI)
  3. Qdrant (Vector Database)
  4. Neo4j (Graph Database)

### Frontend (Client Layer)
- **Framework**: React 18, bootstrapped with **Vite** for optimized Hot Module Replacement (HMR) and lightning-fast production builds.
- **Styling & UI**: **Tailwind CSS** heavily customized to support a premium, dark-mode glassmorphic aesthetic. **Lucide React** is used for lightweight, consistent SVG iconography.
- **Animation Engine**: **Framer Motion** (`motion/react`) handles complex layout transitions, the sliding sidebar, and `AnimatePresence` for unmounting components gracefully.
- **State Management**: **Zustand** (`useStore`) is used for global state. It avoids Prop Drilling and allows independent view components (like the Chat, Graph, and Trace panels) to reactively sync with the backend data.
- **Data Visualization**: **React Force Graph 2D** (built on D3.js) is custom-configured to render the physics-based Temporal Knowledge Graph, complete with node-collision algorithms and edge directional particles.

### Backend (API & Logic Layer)
- **Framework**: **FastAPI** (Python 3.10+), utilizing asynchronous `async/await` syntax for high-concurrency request handling.
- **Server**: **Uvicorn** handles ASGI processing.
- **API Architecture**: Modular routing system separating `/ingest` (data processing) and `/query` (agentic reasoning). Uses **Pydantic** models for strict request/response validation.

---

## 2. Databases & Retrieval Systems

To achieve "Hybrid RAG", we use two distinct database engines:

### A. Qdrant (Vector Database)
- **Purpose**: Stores high-dimensional mathematical representations (Embeddings) of data for Semantic Similarity Search. 
- **Implementation**: We run a local Dockerized instance (`v1.9.0`). The `qdrant_manager.py` custom code handles batch upserts, creating collections, and performing nearest-neighbor (`cosine` similarity) searches on both sparse (BM25) and dense vectors.

### B. Neo4j (Graph Database)
- **Purpose**: Stores extracted Knowledge Graphs (Entities and Relationships) to allow multi-hop reasoning (e.g., tracing a symptom to a disease to a treatment).
- **Implementation**: We run `neo4j:5.12-community`. The `neo4j_manager.py` script uses the official Python driver to execute dynamic **Cypher** queries. 

---

## 3. The Multi-Modal Processors & AI Models

The backend utilizes specialized processors to handle 3 distinct modalities, unifying them into textual schemas for the RAG pipeline.

### 1. Document & Text Processor (`text_processor.py`)
- **Libraries Used**: `PyMuPDF` (`fitz`) and `pdfplumber`.
- **Logic**: Custom chunking algorithms split large documents into overlapping windows to preserve context.
- **Embedding Model**: Uses **`BAAI/bge-small-en-v1.5`** (via `sentence-transformers`). This runs entirely locally to encode text into 384-dimensional dense vectors.

### 2. Image & Vision Processor (`image_processor.py`)
- **Libraries Used**: Base64 encoding and `Pillow` (PIL) for metadata fallbacks.
- **Vision Model**: Integrates the **Groq Vision API** powered by **`meta-llama/llama-4-scout-17b-16e-instruct`**. 
- **Logic**: When an image is uploaded, the vision model generates a highly descriptive caption extracting charts, medical findings, and text. This caption is then embedded into Qdrant as if it were a text document.

### 3. Audio & Video Processor (`audio_processor.py`)
- **Libraries Used**: `pydub` and `ffmpeg` for audio normalization and temporal chunking.
- **Transcription Model**: Utilizes **Groq Whisper (`whisper-large-v3`)**.
- **Logic**: Audio files are transcribed into precise text transcripts, which are then chunked and embedded into Qdrant.

---

## 4. Custom LangChain Orchestrator & Agentic Workflow

The "Brain" of the platform is the custom-coded Agentic Orchestrator (`orchestrator.py`), which completely replaces standard, hardcoded RAG pipelines.

### The ReAct Agent Loop
We use **LangChain** to construct a **ReAct (Reasoning and Acting)** agent.
- **LLM Engine**: Powered by **Groq (`llama-3.1-8b-instant`)** for near-zero latency reasoning.
- **The Loop**: Instead of immediately answering, the LLM is placed in a `while` loop where it must output a "Thought" (e.g., "I need to search for X"), select a "Tool", and parse the "Observation". It continues this loop until it reaches a final answer.

### Custom Tools Bound to the Agent:
1. **`VectorSearchTool`**: Triggers a semantic search against the Qdrant database to retrieve relevant document chunks, image captions, or audio transcripts.
2. **`GraphSearchTool`**: Automatically generates and executes Cypher queries against Neo4j to pull network schemas and relationships.
3. **`WebSearchTool`**: Uses the **Firecrawl API**. If internal databases fail to provide the answer, the agent autonomously generates a web search query, scrapes live HTML, parses the DOM, and feeds the live context back into its reasoning loop.

---

## 5. Background Graph Extraction Pipeline

Building a Knowledge Graph manually is impossible. We custom-coded an automated **Graph Extractor** (`graph_extractor.py`).
- **How it works**: When files are ingested, FastAPI triggers a `BackgroundTask`.
- **The LLM**: `llama-3.1-8b-instant` is prompted with rigorous few-shot examples to read the text chunks and output a strict JSON schema identifying `Nodes` (Entities) and `Edges` (Relationships).
- **The Integration**: The backend dynamically translates this JSON into Cypher `MERGE` statements, incrementally expanding the Neo4j database in real-time as users upload data.

---

## Summary of Unique Technical Achievements
1. **Fully Local Hybrid Search Architecture**: Integrating Qdrant and Neo4j simultaneously.
2. **Multi-Modal Normalization**: Seamlessly treating Images and Audio as queryable text via scout and whisper models.
3. **Agentic Transparency**: The React frontend successfully intercepts the LangChain execution trace and visually renders it in the `ExplainabilityPanel.jsx`, giving users 100% visibility into the AI's tool usage and preventing hallucinations.
