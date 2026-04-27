from pydantic import BaseModel, Field
from typing import List, Dict, Any
from langchain_core.prompts import ChatPromptTemplate
from langchain_groq import ChatGroq

class ValidationResult(BaseModel):
    is_valid: bool = Field(description="True if the answer is completely faithful to the context and addresses the query. False if it hallucinates or is unhelpful.")
    feedback: str = Field(description="If not valid, specific instructions on what needs to be fixed.")

class AnswerValidator:
    def __init__(self, llm: ChatGroq):
        self.llm = llm
        self.prompt = ChatPromptTemplate.from_messages([
            ("system", """You are a strict Hallucination and Faithfulness Evaluator.
            You must evaluate an Answer based on the provided Context and the original Query.
            If the Answer contains ANY facts, claims, or relationships not present in the Context, return is_valid=False and provide feedback.
            If the Answer does not address the Query, return is_valid=False.
            If the Answer is faithful and addresses the Query, return is_valid=True.
            """),
            ("human", "Query: {query}\n\nContext: {context}\n\nAnswer: {answer}")
        ])
        self.chain = self.prompt | self.llm.with_structured_output(ValidationResult)

    async def validate(self, query: str, answer: str, context: str) -> tuple[bool, str]:
        result = await self.chain.ainvoke({
            "query": query, 
            "context": context, 
            "answer": answer
        })
        return result.is_valid, result.feedback
