from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Dict, Any, List, Optional
from app.agents.orchestrator import orchestrator
import logging

logger = logging.getLogger(__name__)
router = APIRouter()


class QueryRequest(BaseModel):
    query: str


class CitationItem(BaseModel):
    text:        str = ""
    source_id:   str = ""
    chunk_id:    str = ""
    page:        int = 1
    filename:    str = ""
    modality:    str = "text"
    score:       float = 0.0
    rerank_score: Optional[float] = None


class QueryResponse(BaseModel):
    answer:     str
    context:    str
    confidence: float = 0.0
    trace:      Dict[str, Any]
    citations:  Optional[List[Dict[str, Any]]] = []


@router.post("/agentic", response_model=QueryResponse)
async def agentic_query(request: QueryRequest):
    if not request.query.strip():
        raise HTTPException(status_code=400, detail="Query cannot be empty.")
    try:
        result = await orchestrator.process_query(request.query)
        return QueryResponse(
            answer=result["answer"],
            context=result.get("context", ""),
            confidence=result.get("confidence", 0.0),
            trace=result["trace"],
            citations=result.get("citations", []),
        )
    except Exception as e:
        logger.exception("Query failed: %s", e)
        raise HTTPException(status_code=500, detail=str(e))
