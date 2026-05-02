# Zero-Memory Multi-Modal Graph RAG: Master Technical Guide

This document provides the definitive technical specification and operational workflow for the **Zero-Memory** platform. It details the exact models, technologies, and agentic logic that power our hybrid retrieval system.

---

## 1. The Core AI Model Stack

We do not use generic "AI models." Every task in Zero-Memory is routed to a specialized model optimized for that specific modality or reasoning step.

| Component | Logic Layer | Specific Model | Engine / Source |
| :--- | :--- | :--- | :--- |
| **Agentic Brain** | Orchestration & Tool Use | `llama-3.3-70b-versatile` | Groq Cloud |
| **Fast Reasoning** | Planning & Decomposition | `llama-3.1-8b-instant` | Groq Cloud |
| **Vision AI** | Image Captioning & OCR | `meta-llama/llama-4-scout-17b-16e-instruct` | Groq Cloud |
| **Transcription** | Audio-to-Text | `whisper-base` | Local (OpenAI-Whisper) |
| **Graph Extractor** | Entity/Relation Mapping | `llama-3.1-8b-instant` | Groq Cloud |
| **Text Embedding** | Vector Representation | `BAAI/bge-small-en-v1.5` | Local (HF/Sentence-Transformers) |
| **Reranker** | Cross-Encoding Re-ranking | `mxbai-rerank-base-v1` | Local / API |

### Model Rationale: Why we chose this specific stack?

*   **`llama-3.3-70b-versatile` (The Brain)**: 
    *   *Role*: Final answer synthesis and self-reward validation.
    *   *Rationale*: High-stakes reasoning requires a "large" model. The 70B parameter count ensures it can handle complex logic and follow strict citation formatting. Llama 3.3 provides even higher accuracy than the 3.1 version for long-context reasoning.
*   **`llama-3.1-8b-instant` (The Strategist)**: 
    *   *Role*: Planning search strategies and extracting Graph entities.
    *   *Rationale*: These tasks require extreme speed. By using an 8B model on Groq's LPU hardware, we achieve near-instant planning, allowing the agent to "think" before it acts without the user waiting for seconds.
*   **`meta-llama/llama-4-scout-17b-16e-instruct` (The Eyes)**: 
    *   *Role*: Deep image understanding and OCR.
    *   *Rationale*: Llama 4 Scout is the latest generation vision model, providing significantly better text extraction from complex charts and photographs compared to the decommissioned Llama 3.2 version.
*   **`whisper-base` (The Ears)**: 
    *   *Role*: High-speed local audio transcription.
    *   *Rationale*: We run this locally to maintain privacy and eliminate per-second API costs. The 'base' model is optimized for CPU inference while maintaining high accuracy for English speech.
*   **`BAAI/bge-small-en-v1.5` (The Librarian)**: 
    *   *Role*: Core semantic vector search.
    *   *Rationale*: It is one of the highest-ranked models on the MTEB leaderboard for its size. It provides dense retrieval quality that rivals models 10x its size, all while remaining incredibly fast to run on the local backend.
*   **`mxbai-rerank-base-v1` (The Filter)**: 
    *   *Role*: Ensuring absolute relevance.
    *   *Rationale*: Vector search often retrieves "similar" but "irrelevant" data. A reranker performs a deep cross-comparison between the query and the retrieved chunks to discard the noise, which is the most effective way to stop AI hallucinations.


---

## 2. Deep Dive: The End-to-End Workflow (with Example)

To understand how Zero-Memory works, let's follow a single piece of data: **A Medical Report (PDF) containing a chart image.**

### Phase A: The Ingestion Pipeline (Behind the Scenes)
1.  **Parsing**: The system uses `PyMuPDF` to extract text from the PDF. It identifies the image on page 3 and extracts it as raw bytes.
2.  **Multi-Modal Branching**:
    *   **Text Branch**: The `text_processor` splits the report into 800-character chunks with a 150-character overlap to ensure no context is lost at the boundaries.
    *   **Vision Branch**: The image is sent to **Llama 4 Scout** with a prompt to "Describe this chart in detail and extract all data points."
3.  **Vectorization**: Both the text chunks and the new image caption are sent to the local `bge-small-en-v1.5` model. This turns human language into 384-dimensional mathematical coordinates (Embeddings).
4.  **Graph Extraction**: A background task sends the text to `llama-3.1-8b-instant`. It identifies **Entities** (e.g., "Patient X", "Insulin") and **Relationships** (e.g., "Patient X" -> *TAKES* -> "Insulin").
5.  **Storage**: 
    *   Embeddings + Metadata are saved in **Qdrant**.
    *   Entities + Relationships are saved in **Neo4j**.
    *   A keyword index is updated in **BM25**.

### Phase B: The Query & Reasoning Pipeline
**User Question**: *"What was the glucose trend for Patient X according to the uploaded chart?"*

1.  **Decomposition**: The `orchestrator` breaks this down:
    *   Query 1: "Glucose trends for Patient X"
    *   Query 2: "Extract data points from glucose charts"
2.  **Planning**: The `Planner` decides: *"I need to use VectorSearch for the chart data and GraphSearch to verify the patient identity."*
3.  **Retrieval**:
    *   **Vector Search**: Finds the caption generated by the Vision AI that described the chart.
    *   **Graph Search**: Traces the relationship path `(Patient X)-[:HAS_RECORD]->(Glucose_Data)`.
4.  **SRLM Validation (Self-Reward)**:
    *   The model generates a draft answer.
    *   A separate **Validator** agent checks: *"Does the answer mention chart data? Yes. Is it cited? Yes."*
    *   If confidence is < 0.8, it regenerates the answer with corrections.
5.  **Final Output**: The user receives a natural language summary with clickable citations pointing to **Page 3** of the original PDF.

---

## 3. UI Features & User Benefits

The Zero-Memory interface is designed for maximum transparency and user control. Here is how the four main sections help you:

### 1. Knowledge Graph (Interconnected Discovery)
*   **What it is**: An interactive 2D force-directed node map.
*   **How it helps**: While standard search only gives you "similar" chunks of text, the Graph visualizes **connections**. If document A mentions "Insulin" and document B mentions "Patient X," the Graph will physically link them. This helps users spot non-obvious relationships across thousands of pages that would otherwise remain hidden.

### 2. Citations (Trust & Verification)
*   **What it is**: Small, clickable reference tags attached to specific sentences in the AI's response.
*   **How it helps**: AI "hallucinations" (making things up) are the biggest barrier to professional adoption. Our citations link every fact directly to a specific source file, page number, or image caption. Clicking a citation opens the "Source Preview" so you can verify the truth for yourself in seconds.

### 3. Agent Trace (The "Black Box" Opener)
*   **What it is**: A live, scrolling feed of the AI's internal "Thought → Action → Observation" loop.
*   **How it helps**: Most AI systems are "black boxes"—you ask a question and get an answer with no idea how it was reached. The Agent Trace shows you the query decomposition, which tools were used, and any errors the AI encountered. It is an essential tool for debugging and building user trust in the AI's reasoning.

### 4. Ingest Management (Data Hygiene)
*   **What it is**: A centralized dashboard for managing uploaded files and system memory.
*   **How it helps**: This is the heart of the "Zero-Memory" philosophy. You can monitor the progress of heavy tasks (like Vision OCR or Graph Extraction) and, once a project is finished, perform a **Global Memory Wipe**. This completely erases all data from Qdrant and Neo4j, ensuring your sensitive data never lingers in the system.

---

## 4. Technology Stack

### Frontend (Client Layer)
*   **Framework**: React 18 + Vite.
*   **Styling**: Tailwind CSS + **shadcn/ui** (Premium Dark Mode).
*   **Animations**: Framer Motion for glassmorphic transitions.
*   **State Management**: **Zustand** (Unified store for Chat, Graph, and Trace).
*   **Visualization**: **React Force Graph 2D** for interactive 3D-feeling node maps.

### Backend (API Layer)
*   **Framework**: **FastAPI** (Python 3.11) with high-concurrency `async/await`.
*   **Orchestration**: **LangChain** (Custom ReAct Agent implementation).
*   **Monitoring**: Custom `MonitoringMiddleware` for request-latency tracking.

### Infrastructure & Databases
*   **Qdrant**: Vector engine for dense semantic search.
*   **Neo4j**: Graph engine for multi-hop relational search.
*   **Docker Compose**: Manages the 4-service stack on the internal `ragnet` network.

---

## 5. Key Performance Features
*   **Hybrid RAG**: Fuses Vector similarity with Graph connectivity to answer questions standard RAG systems miss.
*   **Agentic Trace**: Every step of the "Thought → Action → Observation" loop is streamed to the frontend for 100% transparency.
*   **Zero-Memory Reset**: A specialized `/reset` endpoint that cross-wipes all databases, ensuring a clean state for new projects.
