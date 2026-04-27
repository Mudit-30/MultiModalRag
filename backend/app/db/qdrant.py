from qdrant_client import QdrantClient
from qdrant_client.models import Distance, VectorParams, PointStruct
from app.core.config import settings
import uuid
import os

# Persistent local path for dev — data survives restarts
LOCAL_STORAGE_PATH = os.path.join(os.path.dirname(__file__), "..", "..", "..", "data", "qdrant_local")

class QdrantManager:
    def __init__(self):
        self._client = None
        self.collection_name = "multimodal_rag"

    @property
    def client(self) -> QdrantClient:
        if self._client is None:
            # Try remote Qdrant first (Docker), fall back to local persistent storage
            try:
                client = QdrantClient(host=settings.QDRANT_HOST, port=settings.QDRANT_PORT, timeout=3)
                client.get_collections()  # connectivity test
                self._client = client
                print(f"[Qdrant] Connected to remote: {settings.QDRANT_HOST}:{settings.QDRANT_PORT}")
            except Exception:
                os.makedirs(LOCAL_STORAGE_PATH, exist_ok=True)
                self._client = QdrantClient(path=LOCAL_STORAGE_PATH)
                print(f"[Qdrant] Using local persistent storage at: {LOCAL_STORAGE_PATH}")
            self._init_collection()
        return self._client

    def _init_collection(self):
        collections = [c.name for c in self._client.get_collections().collections]
        if self.collection_name not in collections:
            self._client.create_collection(
                collection_name=self.collection_name,
                vectors_config=VectorParams(size=384, distance=Distance.COSINE),
            )
            print(f"[Qdrant] Created collection: {self.collection_name}")

    def insert_vectors(self, vectors, payloads):
        points = [
            PointStruct(id=str(uuid.uuid4()), vector=vec, payload=payload)
            for vec, payload in zip(vectors, payloads)
        ]
        self.client.upsert(collection_name=self.collection_name, points=points)
        print(f"[Qdrant] Inserted {len(points)} vectors")

    def search(self, query_vector, limit: int = 10):
        from qdrant_client.models import QueryRequest
        try:
            # Remote client uses .search()
            return self._client.search(
                collection_name=self.collection_name,
                query_vector=query_vector,
                limit=limit,
            )
        except AttributeError:
            # Local persistent client uses .query_points()
            result = self._client.query_points(
                collection_name=self.collection_name,
                query=query_vector,
                limit=limit,
            )
            return result.points

qdrant_manager = QdrantManager()
