"""
Neo4j Knowledge Graph Manager.
Gracefully skips if Neo4j is unreachable — the system runs fine without it.
"""
import logging
from neo4j import GraphDatabase
from app.core.config import settings
from typing import List, Dict, Any

logger = logging.getLogger(__name__)


class Neo4jManager:
    def __init__(self):
        self._driver = None
        self._attempted = False  # Only try once per process lifetime

    @property
    def driver(self):
        if self._driver is None and not self._attempted:
            self._attempted = True
            try:
                self._driver = GraphDatabase.driver(
                    settings.NEO4J_URI,
                    auth=(settings.NEO4J_USER, settings.NEO4J_PASSWORD),
                    connection_timeout=3,
                    max_connection_lifetime=30,
                )
                self._driver.verify_connectivity()
                logger.info("Connected to Neo4j at %s", settings.NEO4J_URI)
            except Exception as e:
                logger.info(
                    "Neo4j not reachable (%s) — graph features disabled. Start Neo4j to enable.", e
                )
                self._driver = None
        return self._driver

    def close(self):
        if self._driver:
            try:
                self._driver.close()
            except Exception:
                pass

    def reset(self):
        """Wipe all nodes and relationships from Neo4j."""
        if not self.driver:
            return
        try:
            with self.driver.session() as session:
                session.run("MATCH (n) DETACH DELETE n")
            logger.info("[Neo4j] Graph wiped.")
        except Exception as e:
            logger.error("[Neo4j] Reset error: %s", e)

    def ingest_graph(self, graph, source_chunk_id: str):
        if not self.driver:
            return

        # Only process non-empty entities/relations
        if not graph.entities:
            return

        query = """
        UNWIND $entities AS ent
        MERGE (e:Entity {id: ent.id})
        ON CREATE SET e.type = ent.type
        """
        entities_list = [e.model_dump() for e in graph.entities]
        relations_list = [r.model_dump() for r in graph.relations]

        try:
            with self.driver.session() as session:
                session.run(query, entities=entities_list)
                if relations_list:
                    rel_query = """
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
                    session.run(rel_query, relations=relations_list, chunk_id=source_chunk_id)
            logger.info(
                "[Neo4j] Ingested %d entities, %d relations from chunk %s",
                len(entities_list), len(relations_list), source_chunk_id[:8],
            )
        except Exception as e:
            logger.warning("[Neo4j] Ingest failed: %s", e)

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
        try:
            with self.driver.session() as session:
                result = session.run(cypher, query_entities=query_entities)
                return {"paths": [record.data() for record in result]}
        except Exception as e:
            logger.warning("[Neo4j] Subgraph query failed: %s", e)
            return {"paths": []}


neo4j_manager = Neo4jManager()
