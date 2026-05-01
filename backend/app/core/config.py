from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import List

class Settings(BaseSettings):
    PROJECT_NAME: str = "Multi-Modal Graph RAG API"
    VERSION: str = "0.1.0"
    API_V1_STR: str = "/api/v1"
    
    # CORS
    BACKEND_CORS_ORIGINS: List[str] = ["http://localhost:5173", "http://localhost:3000"]
    
    # Qdrant Settings
    QDRANT_HOST: str = "qdrant"
    QDRANT_PORT: int = 6333
    
    # Neo4j Settings
    NEO4J_URI: str = "bolt://neo4j:7687"
    NEO4J_USER: str = "neo4j"
    NEO4J_PASSWORD: str = "testpassword"
    
    # LLM Settings
    GROQ_API_KEY: str = "your_groq_api_key_here"
    OLLAMA_MODEL: str = "llama3.1"
    
    model_config = SettingsConfigDict(env_file=".env", case_sensitive=True, extra="ignore")

settings = Settings()
