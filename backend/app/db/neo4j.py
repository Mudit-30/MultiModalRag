from neo4j import GraphDatabase
from app.core.config import settings
from typing import List, Dict, Any

class Neo4jManager:
    def __init__(self):
        self._driver = None

    @property
    def driver(self):
        if self._driver is None:
            try:
                self._driver = GraphDatabase.driver(
                    settings.NEO4J_URI,
                    auth=(settings.NEO4J_USER, settings.NEO4J_PASSWORD),
                    connection_timeout=3
                )
                self._driver.verify_connectivity()
                print(f"Connected to Neo4j at {settings.NEO4J_URI}")
            except Exception as e:
                print(f"Neo4j not reachable ({e}) — graph features disabled for local dev")
                self._driver = None
        return self._driver

    def close(self):
        if self._driver:
            self._driver.close()

    def ingest_graph(self, graph, source_chunk_id: str):
        if not self.driver:
            print("Neo4j unavailable — skipping graph ingestion")
            return

        query = """
        UNWIND $entities AS ent
        MERGE (e:Entity {id: ent.id})
        ON CREATE SET e.type = ent.type
        WITH e
        UNWIND $relations AS rel
        MATCH (s:Entity {id: rel.source})
        MATCH (t:Entity {id: rel.target})
        MERGE (s)-[r:RELATED_TO {type: rel.type}]->(t)
        ON CREATE SET
            r.confidence = rel.confidence,
            r.valid_from = rel.valid_from,
            r.valid_until = rel.valid_until,
            r.source_chunks = [$chunk_id]
        ON MATCH SET
            r.source_chunks = CASE
                WHEN NOT $chunk_id IN r.source_chunks THEN r.source_chunks + [$chunk_id]
                ELSE r.source_chunks END
        """
        entities_list = [e.model_dump() for e in graph.entities]
        relations_list = [r.model_dump() for r in graph.relations]
        with self.driver.session() as session:
            session.run(query, entities=entities_list, relations=relations_list, chunk_id=source_chunk_id)

    def extract_subgraph(self, query_entities: List[str], hops: int = 2) -> Dict[str, Any]:
        if not self.driver:
            return {"paths": []}
        cypher = f"""
        MATCH p=(source:Entity)-[r:RELATED_TO*1..{hops}]-(target:Entity)
        WHERE any(node IN nodes(p) WHERE node.id IN $query_entities)
        WITH p, reduce(s=1.0, edge in relationships(p) | s * edge.confidence) AS path_confidence
        ORDER BY path_confidence DESC LIMIT 50
        RETURN nodes(p) AS nodes, relationships(p) AS rels, path_confidence
        """
        with self.driver.session() as session:
            result = session.run(cypher, query_entities=query_entities)
            return {"paths": [record.data() for record in result]}

neo4j_manager = Neo4jManager()
