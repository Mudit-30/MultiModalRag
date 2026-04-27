from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Dict, Any, Optional
from app.evaluation.metrics import metrics_engine

router = APIRouter()

class ExplainRequest(BaseModel):
    query: str
    answer: str
    context: str
    retrieved_chunks: Optional[List[Dict[str, Any]]] = []
    subgraph: Optional[Dict[str, Any]] = {}
    trace: Optional[Dict[str, Any]] = {}

@router.post("/")
async def explain(req: ExplainRequest):
    try:
        # Run all metrics in one shot
        faithfulness = await metrics_engine.faithfulness(req.answer, req.context)
        precision = metrics_engine.context_precision(req.retrieved_chunks, req.query)
        graph_cov = metrics_engine.graph_coverage(req.subgraph)
        modality_breakdown = metrics_engine.modality_breakdown(req.retrieved_chunks)

        return {
            "faithfulness": faithfulness,
            "context_precision": precision,
            "graph_coverage": graph_cov,
            "modality_breakdown": modality_breakdown,
            "retrieval_timeline": req.trace.get("timeline", []),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
