from pydantic import BaseModel, Field
from typing import List, Optional
from langchain_core.prompts import ChatPromptTemplate
from langchain_groq import ChatGroq

class Entity(BaseModel):
    id: str = Field(description="Unique, normalized name of the entity (e.g., 'Aspirin', 'John Doe').")
    type: str = Field(description="The category of the entity. Must be broad like 'Person', 'Disease', 'Product', 'Location'.")

class Relation(BaseModel):
    source: str = Field(description="The ID of the source entity.")
    target: str = Field(description="The ID of the target entity.")
    type: str = Field(description="The nature of the relationship (e.g., 'TREATS', 'LOCATED_IN', 'MANUFACTURES').")
    confidence: float = Field(description="Confidence score between 0.0 and 1.0 that this relationship is factually true based on the text.")
    valid_from: Optional[str] = Field(description="Optional. If the text mentions when this relationship started (e.g., a date), extract it.", default=None)
    valid_until: Optional[str] = Field(description="Optional. If the text mentions when this relationship ended, extract it.", default=None)

class GraphExtraction(BaseModel):
    entities: List[Entity]
    relations: List[Relation]

class GraphExtractor:
    def __init__(self, llm: ChatGroq):
        self.llm = llm
        self.prompt = ChatPromptTemplate.from_messages([
            ("system", """You are an expert Ontologist extracting Knowledge Graphs from text.
            Your task is to extract Entities and their Relationships.
            Rules:
            1. Keep Entity IDs normalized (e.g., 'COVID-19' instead of 'covid 19').
            2. Relationship types MUST be uppercase with underscores (e.g., 'WORKS_FOR').
            3. Always assign a confidence score (0.0 to 1.0) based on how explicit the text is.
            4. If a temporal aspect is mentioned (e.g., 'diagnosed in 2021'), populate valid_from and valid_until appropriately.
            """),
            ("human", "Extract the graph from this text:\n\n{text}")
        ])
        self.chain = self.prompt | self.llm.with_structured_output(GraphExtraction)

    async def extract(self, text: str) -> GraphExtraction:
        return await self.chain.ainvoke({"text": text})
