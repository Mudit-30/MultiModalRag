from typing import List, Dict, Any
from langchain_groq import ChatGroq
from pydantic import BaseModel, Field
from langchain_core.prompts import ChatPromptTemplate
from app.core.config import settings

# ── Faithfulness Check via LLM ──────────────────────────────────────────────

class FaithfulnessResult(BaseModel):
    score: float = Field(description="Float between 0.0 (fully hallucinated) and 1.0 (fully faithful).")
    unsupported_claims: List[str] = Field(description="List of claims in the answer that are NOT found in the context.")

class RAGMetrics:
    def __init__(self):
        self.llm = ChatGroq(api_key=settings.GROQ_API_KEY, model_name="llama-3.1-8b-instant", temperature=0)

        self.faithfulness_chain = ChatPromptTemplate.from_messages([
            ("system", """You are a RAG evaluator. Given a Context and an Answer, identify any claims in the Answer that are NOT directly supported by the Context.
            Return a faithfulness score (0.0 = fully made up, 1.0 = entirely supported) and a list of unsupported claims.
            Be strict: if a fact in the answer cannot be traced to a specific sentence in the context, it is unsupported."""),
            ("human", "Context:\n{context}\n\nAnswer:\n{answer}")
        ]) | self.llm.with_structured_output(FaithfulnessResult)

    async def faithfulness(self, answer: str, context: str) -> Dict[str, Any]:
        result = await self.faithfulness_chain.ainvoke({"context": context, "answer": answer})
        return {"score": result.score, "unsupported_claims": result.unsupported_claims}

    def context_precision(self, retrieved_chunks: List[Dict], query: str) -> float:
        """
        Rough heuristic: % of retrieved chunks that contain at least one query keyword.
        In production, replace with an LLM-based relevance check.
        """
        if not retrieved_chunks:
            return 0.0
        keywords = set(query.lower().split())
        relevant = sum(
            1 for chunk in retrieved_chunks
            if any(kw in (chunk.get("text") or chunk.get("caption") or chunk.get("transcript") or "").lower()
                   for kw in keywords)
        )
        return round(relevant / len(retrieved_chunks), 2)

    def graph_coverage(self, subgraph: Dict) -> Dict[str, Any]:
        """How well the graph contributed to the answer."""
        paths = subgraph.get("paths", [])
        if not paths:
            return {"nodes_used": 0, "avg_confidence": 0.0, "max_hops": 0}
        confidences = [p.get("path_confidence", 0) for p in paths]
        return {
            "nodes_used": len(paths),
            "avg_confidence": round(sum(confidences) / len(confidences), 2),
            "max_hops": max((len(p.get("rels", [])) for p in paths), default=0),
        }

    def modality_breakdown(self, retrieved_chunks: List[Dict]) -> Dict[str, int]:
        """Count of chunks per modality contributing to the answer."""
        breakdown: Dict[str, int] = {}
        for chunk in retrieved_chunks:
            mod = chunk.get("modality", "unknown")
            breakdown[mod] = breakdown.get(mod, 0) + 1
        return breakdown

metrics_engine = RAGMetrics()
