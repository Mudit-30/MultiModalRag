# Demo Dataset & Queries

This folder contains sample documents and prepared queries for the May 2nd presentation.

## Sample Documents

Place these in the `demo/` folder and upload via the UI before the demo:

| File | Modality | Content |
|---|---|---|
| `patient_case.txt` | Text | Medical case study with symptoms, diagnosis |
| `xray_report.txt` | Text | Radiologist's written report (simulate image caption) |
| `doctor_notes.txt` | Text | Doctor's consultation notes and treatment plan |

> **Note**: For a live demo, real image/audio files can be uploaded directly through the Upload tab in the UI.

---

## 🎯 Prepared Demo Queries

### Query 1 — Vector-Only Retrieval (Warm-up)
> "What are the primary symptoms of the patient?"

- **Expected flow**: Planner routes to VECTOR_ONLY. Single Qdrant search. Direct factual answer.
- **What to show**: The agent trace shows `Decomposition → [single query]`, `Planner → VECTOR_ONLY`.

---

### Query 2 — Graph-Traversal (Multi-hop)
> "What connects the patient's X-ray findings to the prescribed treatment?"

- **Expected flow**: Planner routes to HYBRID. Entities extracted: `[X-ray, Patient, Treatment]`. Neo4j traverses the path `X-ray → diagnosed_condition → Treatment`.
- **What to show**: Switch to Graph tab — show the glowing node path. Point out the confidence score on the relationship edge.

---

### Query 3 — Maximum Depth (Wow-factor)
> "Trace the full diagnostic journey: from the initial symptom the patient reported in their consultation to the final prescribed medication and explain why each step was necessary."

- **Expected flow**: Decomposer breaks into 3+ sub-queries. Hybrid retrieval runs concurrently. Validator checks faithfulness. Final answer cites multiple `source_ids`.
- **What to show**: The full explainability panel with all 3 timeline steps (Decomposition, Retrieval, Validation). Then switch to graph view showing the entire multi-hop subgraph.

---

## 🎬 Presentation Script (10 minutes)

| Time | Action |
|---|---|
| 0:00–1:00 | Open UI. Show the split layout: Chat (left), Panels (right). Quick intro. |
| 1:00–2:30 | Upload `patient_case.txt`, `xray_report.txt`, `doctor_notes.txt` via Upload tab. Show progress bars. |
| 2:30–4:00 | Run **Query 1**. Explain Vector RAG. Switch to Agent Trace tab. |
| 4:00–7:00 | Run **Query 2**. Switch to Graph tab. Zoom into the `X-ray → condition → treatment` path. Point out confidence scores on edges. |
| 7:00–9:30 | Run **Query 3**. Watch the full agentic trace. Explain Decomposer, Planner, Validator. Show Citations tab. |
| 9:30–10:00 | Wrap up: mention RRF, Semantic Cache, Temporal KG, and Docker deployment. |
