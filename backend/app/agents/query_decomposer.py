from pydantic import BaseModel, Field
from typing import List
from langchain_core.prompts import ChatPromptTemplate
from langchain_groq import ChatGroq

class SubQueries(BaseModel):
    queries: List[str] = Field(description="A list of independent or sequential sub-queries required to answer the main complex query.")

class QueryDecomposer:
    def __init__(self, llm: ChatGroq):
        self.llm = llm
        self.prompt = ChatPromptTemplate.from_messages([
            ("system", "You are an expert query decomposer. Your task is to break down complex, multi-hop questions into simpler, manageable sub-queries that can be run sequentially or in parallel against a retrieval system. If a query is simple enough, just return it as a single element list."),
            ("human", "Decompose this query: {query}")
        ])
        try:
            self._chain = self.prompt | self.llm.with_structured_output(SubQueries)
        except Exception:
            self._chain = None

    async def decompose(self, query: str) -> List[str]:
        if self._chain is None:
            return [query]
        try:
            result = await self._chain.ainvoke({"query": query})
            return result.queries
        except Exception:
            return [query]
