from pydantic import BaseModel, Field
from langchain_core.prompts import ChatPromptTemplate
from langchain_groq import ChatGroq

class RetrievalPlan(BaseModel):
    strategy: str = Field(description="Must be one of: 'VECTOR_ONLY', 'GRAPH_ONLY', or 'HYBRID'.")
    reasoning: str = Field(description="Brief explanation of why this strategy was chosen.")

class RetrievalPlanner:
    def __init__(self, llm: ChatGroq):
        self.llm = llm
        self.prompt = ChatPromptTemplate.from_messages([
            ("system", """You are a strategic retrieval planner. Given a sub-query, decide the best retrieval strategy.
            - Choose 'VECTOR_ONLY' if the query asks for semantic meaning, general descriptions, or text similarity.
            - Choose 'GRAPH_ONLY' if the query asks for direct relationships, connections, dates, or structured multi-hop links between entities.
            - Choose 'HYBRID' if the query asks for semantic meaning but relies heavily on specific entity connections.
            """),
            ("human", "Plan retrieval strategy for this query: {query}")
        ])
        try:
            self._chain = self.prompt | self.llm.with_structured_output(RetrievalPlan)
        except Exception:
            self._chain = None

    async def plan(self, query: str) -> RetrievalPlan:
        if self._chain is None:
            return RetrievalPlan(strategy="HYBRID", reasoning="Defaulting to HYBRID due to model compatibility.")
        try:
            return await self._chain.ainvoke({"query": query})
        except Exception:
            return RetrievalPlan(strategy="HYBRID", reasoning="Defaulting to HYBRID due to model compatibility.")
