# Technical Architecture Document: Multi-Modal Graph RAG System

**Date**: April 2026
**Context**: Migration from an existing SRLM RAG system to a Multi-Modal Graph RAG System.
**Purpose**: This document is intended for senior engineering review. It breaks down the system architecture, what has been implemented so far, and the technical blueprint for the upcoming phases.

---

## 1. System Architecture Overview

The Multi-Modal Graph RAG system goes beyond standard Vector RAG. Instead of just chunking text and performing cosine similarity searches, this system ingests multiple data types (Text, Images, Audio), extracts both dense embeddings AND semantic relationships (Knowledge Graphs), and fuses them during retrieval.

### Core Stack
- **Frontend**: React, Vite, Tailwind CSS, `shadcn/ui`, `react-force-graph` (for visualization).
- **Backend API**: FastAPI (Python 3.11), Pydantic for validation, async endpoints.
- **Vector Database**: **Qdrant** (Handles semantic similarity searches across modalities).
- **Graph Database**: **Neo4j** (Handles multi-hop relationship traversal between extracted entities).
- **Orchestration**: Docker Compose.

---

## 2. Phase-by-Phase Technical Implementation

### ✅ Phase 1: Foundation (COMPLETED)
**Goal**: Establish the repository skeleton and ensure connectivity between services.

**Code Written**:
- `backend/app/main.py`: The FastAPI entry point with CORS middleware and a `/health` check.
- `backend/app/core/config.py`: Centralized Pydantic settings loading env variables (`QDRANT_HOST`, `NEO4J_URI`, etc.).
- `frontend/src/App.jsx`: A basic React component that polls the backend `/health` endpoint to ensure the stack is networked properly.
- `docker-compose.yml`: Orchestrates 4 services:
  1. `frontend` (Port 5173)
  2. `backend` (Port 8000)
  3. `qdrant` (Port 6333)
  4. `neo4j` (Port 7474 / 7687)

---

### ✅ Phase 2: Multi-Modal Ingestion (COMPLETED)
**Goal**: Accept diverse file types, process them into text/embeddings, and store them in the Vector DB.

**Technical Strategy**: Because Qdrant requires vectors in a collection to be of uniform dimension, we normalize all modalities into text semantics using `all-MiniLM-L6-v2` (384 dimensions).
- **Text**: Split into chunks.
- **Image**: Caption the image, embed the caption.
- **Audio**: Transcribe audio, embed the transcript.

**Code Written**:
- `backend/app/api/endpoints/ingest.py`: Exposes `POST /ingest/`. Routes the file based on MIME type (`text/plain`, `application/pdf`, `image/*`, `audio/*`).
- `backend/app/services/text_processor.py`: Uses `RecursiveCharacterTextSplitter` (chunk size 500, overlap 50) and `sentence-transformers` to generate embeddings.
- `backend/app/services/image_processor.py`: Mocked integration for an LLM/BLIP-2 to auto-caption the image, then embeds the generated caption.
- `backend/app/services/audio_processor.py`: Uses `openai-whisper` base model to transcribe the audio file into text, then embeds the transcript.
- `backend/app/db/qdrant.py`: Connects to Qdrant, initializes the `multimodal_rag` collection using `Cosine` distance, and inserts points. Every point has a payload storing metadata: `{modality, source_id, chunk_id, timestamp, text/caption/transcript}`.

---

### ⏳ Phase 3: Knowledge Graph Construction (UPCOMING)
**Goal**: Build the semantic network mapping entities (People, Diseases, Locations, Products) and their relationships.

**Technical Blueprint**:
1. **File to create**: `backend/app/services/graph_extractor.py`
2. **Logic**: Whenever text is processed (either native text, image caption, or audio transcript), it will be passed to an LLM (Groq/Ollama) with a strict JSON-schema prompt.
   - *Prompt format*: "Extract entities and relationships from the text. Output JSON: `{"entities": [{"id": "...", "type": "..."}], "relations": [{"source": "...", "target": "...", "type": "..."}]}`"
3. **File to create**: `backend/app/db/neo4j.py`
4. **Logic**: Write Cypher queries to insert this data.
   - `MERGE (e:Entity {name: $name, type: $type})`
   - `MERGE (a)-[:RELATION {type: $rel_type, source_chunk: $chunk_id}]->(b)`
   - **Crucial step**: We attach the `chunk_id` to the relationship. This links the Neo4j graph back to the Qdrant vector chunk, enabling hybrid RAG.

---

### ⏳ Phase 4: Hybrid Retrieval (UPCOMING)
**Goal**: Combine dense vector search with multi-hop graph traversal to answer complex questions.

**Technical Blueprint**:
1. **File to create**: `backend/app/api/endpoints/query.py`
2. **Vector Search (Qdrant)**: Embed the user's query and retrieve the top-K semantically similar chunks.
3. **Graph Search (Neo4j)**: Use the LLM to extract entities from the user's query. Execute a Cypher query to retrieve a 1-to-2 hop subgraph surrounding those entities.
4. **Fusion**: Implement **Reciprocal Rank Fusion (RRF)**. 
   - RRF Score = `1 / (k + rank_vector) + 1 / (k + rank_graph)`.
   - Re-rank the context blocks.
5. **LLM Generation**: Feed the fused, highly-relevant context window to the LLM to generate the final answer, ensuring the prompt mandates citation of source IDs.

---

### ⏳ Phase 5: Frontend Polish (UPCOMING)
**Goal**: Provide a premium, interactive user experience to visualize the Graph RAG process.

**Technical Blueprint**:
1. **Chat UI**: Build a responsive message thread using TailwindCSS. Include an upload zone that shows progress bars for multi-modal ingestion.
2. **Visualization**: Integrate `react-force-graph`. When a user asks a query, the backend will return the subgraph used to generate the answer. The frontend will render this as an interactive 2D/3D node map, visually proving that Graph RAG is functioning.
3. **Citations**: A side-panel that renders the exact source chunks (playing the audio snippet or showing the image thumbnail) that were referenced by the LLM.

---

### ⏳ Phases 6 & 7: Finalization
**Goal**: Production-ready wrap up.
- Optimize multi-stage Dockerfiles to reduce image sizes.
- Populate a `/demo` folder with sample Medical/Historical/Product data.
- Write the final `README.md` with instructions on running the pre-loaded demo queries that showcase the system's ability to answer multi-hop questions spanning images, text, and audio.
