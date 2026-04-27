import asyncio
from typing import Dict, Any, List
from langchain_groq import ChatGroq
from app.agents.query_decomposer import QueryDecomposer
from app.agents.planner import RetrievalPlanner
from app.agents.validator import AnswerValidator
from app.api.endpoints.search_logic import execute_hybrid_search
from app.cache.semantic_cache import semantic_cache
from app.core.config import settings

# Current Groq production models (as of April 2026)
GROQ_FAST_MODEL = "llama-3.1-8b-instant"      # fast, low-latency
GROQ_SMART_MODEL = "llama-3.3-70b-versatile"  # most capable active model

class QueryOrchestrator:
    def __init__(self):
        self.llm = ChatGroq(
            api_key=settings.GROQ_API_KEY,
            model_name=GROQ_SMART_MODEL,
            temperature=0,
        )
        self.decomposer = QueryDecomposer(self.llm)
        self.planner = RetrievalPlanner(self.llm)
        self.validator = AnswerValidator(self.llm)

    async def process_query(self, query: str) -> Dict[str, Any]:
        # 0. Semantic Cache check
        cached = semantic_cache.get(query)
        if cached:
            return cached

        trace: Dict[str, Any] = {"timeline": []}

        # Step 1 — Decompose
        try:
            sub_queries = await self.decomposer.decompose(query)
            trace["timeline"].append({"step": "Decomposition", "result": sub_queries})
        except Exception as e:
            sub_queries = [query]
            trace["timeline"].append({"step": "Decomposition", "result": [query], "note": str(e)})

        # Step 2 — Plan & Execute concurrently
        async def plan_and_search(sq: str) -> Dict[str, Any]:
            try:
                plan = await self.planner.plan(sq)
                return await execute_hybrid_search(sq, strategy=plan.strategy)
            except Exception as e:
                return {"context": "", "source_ids": [], "retrieved_chunks": [], "error": str(e)}

        results = await asyncio.gather(*[plan_and_search(sq) for sq in sub_queries])
        merged_context = self._merge_contexts(list(results))
        all_chunks = [chunk for r in results for chunk in r.get("retrieved_chunks", [])]
        trace["timeline"].append({"step": "Retrieval", "context_size": len(merged_context)})

        # Step 3 — Generate answer
        raw_answer = await self._generate_answer(query, merged_context)

        # Step 4 — Validate (hallucination check)
        try:
            is_valid, feedback = await self.validator.validate(query, raw_answer, merged_context)
            trace["timeline"].append({"step": "Validation", "is_valid": is_valid, "feedback": feedback})
            if not is_valid and feedback:
                raw_answer = await self._generate_answer(query, merged_context, feedback)
        except Exception as e:
            trace["timeline"].append({"step": "Validation", "is_valid": True, "feedback": f"Skipped: {e}"})

        response = {
            "answer": raw_answer,
            "context": merged_context,
            "trace": trace,
            "citations": all_chunks[:5],
        }
        semantic_cache.set(query, response)
        return response

    def _merge_contexts(self, results: List[Dict]) -> str:
        return "\n\n---\n\n".join(r["context"] for r in results if r.get("context"))

    async def _generate_answer(self, query: str, context: str, feedback: str = "") -> str:
        if not context.strip():
            context = "No relevant context was found in the knowledge base."
        system = (
            "You are a precise AI assistant. Answer based strictly on the provided context. "
            "If the context doesn't contain the answer, say so clearly. Do not fabricate facts."
        )
        human = f"Context:\n{context}\n\nQuestion: {query}"
        if feedback:
            human += f"\n\nPrevious answer was rejected. Fix based on this feedback: {feedback}"
        response = await self.llm.ainvoke([("system", system), ("human", human)])
        return response.content


# Singleton instantiated once
orchestrator = QueryOrchestrator()
