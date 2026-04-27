from typing import Dict, Any, List

class GraphReasoner:
    def __init__(self):
        pass

    def reason(self, subgraph: Dict[str, Any]) -> str:
        """
        Analyzes the Neo4j subgraph and generates a textual reasoning trace.
        Filters out low-confidence paths and summarizes the optimal topological path.
        """
        paths = subgraph.get("paths", [])
        if not paths:
            return "No relevant graph connections found."
        
        reasoning_trace = []
        for path in paths[:3]:  # Take Top 3 highest confidence paths
            confidence = path["path_confidence"]
            nodes = path["nodes"]
            rels = path["rels"]
            
            # Reconstruct the path as text
            path_str = []
            for i in range(len(rels)):
                src = nodes[i]["id"]
                rel_type = rels[i]["type"]
                tgt = nodes[i+1]["id"]
                path_str.append(f"({src}) -[{rel_type}]-> ({tgt})")
            
            full_path = " => ".join(path_str)
            reasoning_trace.append(f"Path [Confidence {confidence:.2f}]: {full_path}")
            
        return "Graph Reasoning Trace:\n" + "\n".join(reasoning_trace)

graph_reasoner = GraphReasoner()
