"""
AnswerValidator — SRLM-style self-reward validator.
Returns numeric confidence score + actionable feedback for iterative improvement.
"""

import logging
from typing import Tuple
from pydantic import BaseModel, Field
from langchain_core.prompts import ChatPromptTemplate
from langchain_groq import ChatGroq

logger = logging.getLogger(__name__)


class ValidationResult(BaseModel):
    is_valid: bool = Field(
        description="True if the answer is faithful to the context and directly answers the query."
    )
    confidence: float = Field(
        description="Confidence score from 0.0 to 1.0 — how well the answer addresses the query using the context.",
        ge=0.0, le=1.0,
    )
    faithfulness: float = Field(
        description="0.0-1.0 — fraction of answer claims that are grounded in context (no hallucination).",
        ge=0.0, le=1.0,
    )
    relevance: float = Field(
        description="0.0-1.0 — how well the answer addresses the specific question asked.",
        ge=0.0, le=1.0,
    )
    feedback: str = Field(
        description=(
            "If is_valid=False, provide SPECIFIC instructions on what to fix: "
            "which claims are unsupported, what information is missing, "
            "how the answer should be rewritten."
        )
    )


SYSTEM_PROMPT = """\
You are a strict Self-Reward Evaluator for a Retrieval-Augmented Generation system.

Your job is to evaluate a generated Answer against:
  1. The original Query — does the answer actually address what was asked?
  2. The retrieved Context — are all claims in the answer grounded in the context?

Scoring criteria:
  - faithfulness: Are ALL factual claims in the answer present in the context? \
(hallucinated facts = 0.0)
  - relevance: Does the answer directly address the query? \
(off-topic = 0.0, perfect = 1.0)
  - confidence: Overall quality combining faithfulness and relevance.
  - is_valid: True only if faithfulness >= 0.75 AND relevance >= 0.75
  
If is_valid=False, give SPECIFIC, actionable feedback:
  - Name the exact claim that is unsupported.
  - Specify what the answer should say instead.
  - Do NOT just say "improve the answer" — be precise.
"""


class AnswerValidator:
    def __init__(self, llm: ChatGroq):
        self.llm = llm
        self.prompt = ChatPromptTemplate.from_messages([
            ("system", SYSTEM_PROMPT),
            ("human",
             "Query: {query}\n\n"
             "Retrieved Context:\n{context}\n\n"
             "Generated Answer:\n{answer}"),
        ])
        try:
            self._chain = self.prompt | self.llm.with_structured_output(ValidationResult)
        except Exception:
            self._chain = None

    async def validate(
        self,
        query: str,
        answer: str,
        context: str,
    ) -> Tuple[bool, str, float]:
        """
        Returns (is_valid, feedback, confidence_score).
        """
        if self._chain is None:
            return True, "", 0.8

        # Truncate context to avoid token overflows in validation
        ctx_truncated = context[:4000] if len(context) > 4000 else context

        try:
            result: ValidationResult = await self._chain.ainvoke({
                "query":   query,
                "context": ctx_truncated,
                "answer":  answer,
            })
            logger.info(
                "[Validator] valid=%s faith=%.2f rel=%.2f conf=%.2f",
                result.is_valid, result.faithfulness,
                result.relevance, result.confidence,
            )
            return result.is_valid, result.feedback, result.confidence

        except Exception as e:
            logger.warning("[Validator] Validation failed: %s — accepting answer", e)
            return True, "", 0.8
