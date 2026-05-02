# Technical Architecture Document: Multi-Modal Graph RAG System

**Date**: May 2026
**Context**: Production deployment of the Multi-Modal Graph RAG System.
**Purpose**: This document breaks down the system architecture, component interaction, and the finalized implementation details.

---

## 1. System Architecture Overview

The Multi-Modal Graph RAG system goes beyond standard Vector RAG. Instead of just chunking text and performing cosine similarity searches, this system ingests multiple data types (Text, Images, Audio), extracts both dense embeddings AND semantic relationships (Knowledge Graphs), and fuses them during retrieval.

### Core Stack
- **Frontend**: React 18, Vite, Tailwind CSS, `shadcn/ui`, `react-force-graph-2d`.
- **Backend API**: FastAPI (Python 3.11), Pydantic v2, Async/Await logic.
- **Vector Database**: **Qdrant** (Handles semantic similarity searches across modalities).
- **Graph Database**: **Neo4j** (Handles multi-hop relationship traversal between extracted entities).
- **Orchestration**: Docker Compose with bridge networking.

---

## 2. Implementation Phases (ALL COMPLETED)

### ✅ Phase 1: Foundation
**Status**: COMPLETED
- **Backend**: FastAPI entry point with health checks and CORS.
- **Config**: Pydantic settings for env-based configuration.
- **Infra**: Docker Compose setup for 4 services (Frontend, Backend, Qdrant, Neo4j) on `ragnet`.

### ✅ Phase 2: Multi-Modal Ingestion
**Status**: COMPLETED
- **Processors**: 
  - `text_processor.py`: Recursive chunking + **BGE-small** embeddings.
  - `image_processor.py`: **Groq Vision** (LLaMA 3.2) captioning + BGE embeddings.
  - `audio_processor.py`: **OpenAI Whisper** transcription + BGE embeddings.
- **Storage**: Qdrant collection `multimodal_rag` with cosine similarity and metadata payloads.

### ✅ Phase 3: Knowledge Graph Construction
**Status**: COMPLETED
- **Extractor**: `graph_extractor.py` uses **LLaMA 3.1** on Groq to parse text chunks and output JSON entities/relationships.
- **DB Integration**: `neo4j_manager.py` executes Cypher `MERGE` commands in background tasks to build the graph incrementally.
- **Linking**: Entities are tagged with `source_id` to maintain a 1:1 link with Vector DB chunks.

### ✅ Phase 4: Agentic Hybrid Retrieval
**Status**: COMPLETED
- **Agent**: `orchestrator.py` implements a **ReAct** (Reason-Act) agent loop using LangChain.
- **Tools**:
  - `VectorSearch`: Semantic retrieval from Qdrant.
  - `GraphSearch`: Structural retrieval from Neo4j.
  - `WebSearch`: Live fallback via **Firecrawl API**.
- **Fusion**: The agent reasons over combined context from all tools to synthesize the final answer.

### ✅ Phase 5: Advanced UI & Visualization
**Status**: COMPLETED
- **Chat Interface**: Streaming responses with interactive citations.
- **Graph View**: Real-time rendering of the retrieved subgraph using `react-force-graph-2d`.
- **Trace Panel**: Visual "Explainability" log showing the agent's internal thoughts and tool calls.

---

## 3. Data Flow & Security

1. **Ingestion**: `User -> FastAPI -> Processors -> [Qdrant & Neo4j]`.
2. **Querying**: `User -> Agent -> [Tools] -> Observation -> Synthesis -> User`.
3. **Traceability**: Every fact is backed by a `source_id`, visible in the `CitationPanel`.
4. **Data Isolation**: Docker bridge networking ensures databases are not exposed directly to the public internet; all access goes through the authenticated FastAPI backend.
