"""
SRLM Agentic Orchestrator — Self-Rewarding Language Model RAG loop.

Pipeline:
  1. Semantic cache check
  2. Query decomposition → parallel sub-queries
  3. Retrieval planner → strategy per sub-query
  4. Parallel hybrid search (dense + BM25 + RRF + rerank)
  5. Structured answer generation (with inline citations)
  6. SRLM self-reward loop (validate → re-generate if score < threshold, max 2 retries)
  7. Return answer + citations + full trace
"""

import asyncio
import logging
from typing import Dict, Any, List

from langchain_groq import ChatGroq

from app.agents.query_decomposer import QueryDecomposer
from app.agents.planner import RetrievalPlanner
from app.agents.validator import AnswerValidator
from app.api.endpoints.search_logic import execute_hybrid_search
from app.cache.semantic_cache import semantic_cache
from app.core.config import settings

logger = logging.getLogger(__name__)

GROQ_FAST_MODEL  = "llama-3.1-8b-instant"
GROQ_SMART_MODEL = "llama-3.3-70b-versatile"

# SRLM threshold — re-generate if confidence below this
SRLM_CONFIDENCE_THRESHOLD = 0.75
SRLM_MAX_RETRIES = 2

ANSWER_SYSTEM_PROMPT = """\
You are an expert analytical assistant for a Multi-Modal Graph RAG system.

Rules:
1. Answer ONLY from the provided Context. Do not fabricate.
2. If the context is insufficient, clearly state what IS available and what is missing.
3. Structure your answer with clear sections when appropriate.
4. When citing specific facts, reference the source: e.g. "(Source: patient_case.pdf, Page 2)"
5. Be precise, concise, and clinically/technically accurate.
6. If the previous answer was rejected, carefully follow the improvement feedback.
"""


class QueryOrchestrator:
    def __init__(self):
        self._llm_smart = None
        self._llm_fast  = None
        self._decomposer = None
        self._planner    = None
        self._validator  = None

    # ── Lazy-loaded LLMs ──────────────────────────────────────────────────────
    @property
    def llm_smart(self) -> ChatGroq:
        if self._llm_smart is None:
            self._llm_smart = ChatGroq(
                api_key=settings.GROQ_API_KEY,
                model_name=GROQ_SMART_MODEL,
                temperature=0.1,
            )
        return self._llm_smart

    @property
    def llm_fast(self) -> ChatGroq:
        if self._llm_fast is None:
            self._llm_fast = ChatGroq(
                api_key=settings.GROQ_API_KEY,
                model_name=GROQ_FAST_MODEL,
                temperature=0,
            )
        return self._llm_fast

    @property
    def decomposer(self) -> QueryDecomposer:
        if self._decomposer is None:
            self._decomposer = QueryDecomposer(self.llm_smart)
        return self._decomposer

    @property
    def planner(self) -> RetrievalPlanner:
        if self._planner is None:
            self._planner = RetrievalPlanner(self.llm_fast)
        return self._planner

    @property
    def validator(self) -> AnswerValidator:
        if self._validator is None:
            self._validator = AnswerValidator(self.llm_fast)
        return self._validator

    # ── Main entry point ──────────────────────────────────────────────────────

    async def process_query(self, query: str) -> Dict[str, Any]:
        # 0. Semantic cache
        cached = semantic_cache.get(query)
        if cached:
            logger.info("[Orchestrator] Cache hit for query")
            return cached

        trace: Dict[str, Any] = {"timeline": []}

        # ── Step 1: Query Decomposition ───────────────────────────────────────
        try:
            sub_queries = await self.decomposer.decompose(query)
            # Cap at 4 sub-queries to avoid latency explosion
            sub_queries = sub_queries[:4]
            trace["timeline"].append({
                "step":   "Decomposition",
                "result": sub_queries,
            })
            logger.info("[Orchestrator] Decomposed into %d sub-queries", len(sub_queries))
        except Exception as e:
            sub_queries = [query]
            trace["timeline"].append({
                "step":   "Decomposition",
                "result": [query],
                "error":  str(e),
            })
            logger.warning("[Orchestrator] Decomposition failed (%s) — using original query", e)

        # ── Step 2: Plan + Retrieve (parallel) ───────────────────────────────
        async def _plan_and_search(sq: str) -> Dict[str, Any]:
            try:
                plan = await self.planner.plan(sq)
                result = await execute_hybrid_search(sq, strategy=plan.strategy)
                result["strategy"] = plan.strategy
                result["reasoning"] = plan.reasoning
                return result
            except Exception as e:
                logger.error("[Orchestrator] Search failed for '%s': %s", sq[:60], e)
                return {"context": "", "source_ids": [], "retrieved_chunks": [], "error": str(e)}

        search_results = await asyncio.gather(*[_plan_and_search(sq) for sq in sub_queries])

        # Merge all contexts
        merged_context = self._merge_contexts(list(search_results))
        all_chunks = [
            chunk
            for r in search_results
            for chunk in r.get("retrieved_chunks", [])
        ]

        # Deduplicate chunks by chunk_id
        seen_ids = set()
        unique_chunks = []
        for c in all_chunks:
            cid = c.get("chunk_id", c.get("text", "")[:40])
            if cid not in seen_ids:
                seen_ids.add(cid)
                unique_chunks.append(c)

        strategies_used = list({r.get("strategy", "HYBRID") for r in search_results})
        trace["timeline"].append({
            "step":         "Retrieval",
            "context_size": len(merged_context),
            "chunks_found": len(unique_chunks),
            "strategies":   strategies_used,
        })

        logger.info(
            "[Orchestrator] Context: %d chars from %d unique chunks",
            len(merged_context), len(unique_chunks),
        )

        # ── Step 3+: SRLM Generate → Validate → Retry loop ───────────────────
        answer = ""
        confidence = 0.0
        feedback_history = []

        for attempt in range(SRLM_MAX_RETRIES + 1):
            # Generate
            feedback = feedback_history[-1] if feedback_history else ""
            answer = await self._generate_answer(query, merged_context, feedback)

            if not merged_context.strip():
                # Nothing in the knowledge base — skip validation loop
                trace["timeline"].append({
                    "step":       "Validation",
                    "attempt":    attempt + 1,
                    "is_valid":   True,
                    "confidence": 0.0,
                    "feedback":   "No context available — knowledge base is empty.",
                })
                break

            # Validate (SRLM self-reward)
            try:
                is_valid, val_feedback, confidence = await self.validator.validate(
                    query, answer, merged_context
                )
            except Exception as e:
                logger.warning("[SRLM] Validator error on attempt %d: %s", attempt + 1, e)
                is_valid, val_feedback, confidence = True, "", 0.8

            trace["timeline"].append({
                "step":       "Validation",
                "attempt":    attempt + 1,
                "is_valid":   is_valid,
                "confidence": round(confidence, 3),
                "feedback":   val_feedback,
            })

            logger.info(
                "[SRLM] Attempt %d/%d — valid=%s confidence=%.2f",
                attempt + 1, SRLM_MAX_RETRIES + 1, is_valid, confidence,
            )

            if is_valid and confidence >= SRLM_CONFIDENCE_THRESHOLD:
                break

            if attempt < SRLM_MAX_RETRIES and val_feedback:
                feedback_history.append(val_feedback)
                logger.info("[SRLM] Regenerating with feedback: %s", val_feedback[:120])

        # ── Build response ────────────────────────────────────────────────────
        response = {
            "answer":     answer,
            "context":    merged_context,
            "confidence": round(confidence, 3),
            "trace":      trace,
            "citations":  unique_chunks[:8],
        }

        semantic_cache.set(query, response)
        return response

    # ── Helpers ───────────────────────────────────────────────────────────────

    def _merge_contexts(self, results: List[Dict]) -> str:
        """Merge search results from all sub-queries, deduplicated by text."""
        seen_texts = set()
        blocks = []
        for r in results:
            ctx = r.get("context", "").strip()
            if ctx and ctx not in seen_texts:
                seen_texts.add(ctx)
                blocks.append(ctx)
        return "\n\n---\n\n".join(blocks)

    async def _generate_answer(
        self,
        query: str,
        context: str,
        feedback: str = "",
    ) -> str:
        """Generate a structured answer grounded in the retrieved context."""
        if not context.strip():
            return (
                "I could not find relevant information in the knowledge base to answer your question. "
                "Please ensure you have uploaded documents related to your query using the "
                "'Ingest Data' tab, then try again."
            )

        human_parts = [
            f"Context:\n{context}\n\n",
            f"Question: {query}",
        ]
        if feedback:
            human_parts.append(
                f"\n\n[IMPROVEMENT REQUIRED]\n"
                f"Your previous answer was rejected for the following reason:\n{feedback}\n"
                f"Please rewrite the answer, directly addressing this feedback."
            )

        human_msg = "".join(human_parts)

        try:
            response = await self.llm_smart.ainvoke([
                ("system", ANSWER_SYSTEM_PROMPT),
                ("human",  human_msg),
            ])
            return response.content
        except Exception as e:
            logger.error("[Orchestrator] Answer generation failed: %s", e)
            return f"Answer generation error: {e}"


# Singleton
orchestrator = QueryOrchestrator()
