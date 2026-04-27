from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Dict, Any, List, Optional
from app.agents.orchestrator import orchestrator
import logging

logger = logging.getLogger(__name__)
router = APIRouter()

class QueryRequest(BaseModel):
    query: str

class QueryResponse(BaseModel):
    answer: str
    context: str
    trace: Dict[str, Any]
    citations: Optional[List[Dict[str, Any]]] = []

@router.post("/agentic", response_model=QueryResponse)
async def agentic_query(request: QueryRequest):
    try:
        result = await orchestrator.process_query(request.query)
        return QueryResponse(
            answer=result["answer"],
            context=result["context"],
            trace=result["trace"],
            citations=result.get("citations", []),
        )
    except Exception as e:
        logger.exception("Query failed")
        raise HTTPException(status_code=500, detail=str(e))
