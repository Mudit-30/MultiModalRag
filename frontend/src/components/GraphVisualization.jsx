import React, { useRef, useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import useStore from '../store/useStore';

// Gravitas One applied inline for the section title
const displayFont = { fontFamily: '"Gravitas One", serif' };

export default function GraphVisualization() {
  const { graphData } = useStore();
  const containerRef = useRef(null);

  // Seed positions for real nodes using golden-angle distribution
  const seedNodes = (nodeList) =>
    nodeList.map((n, i) => {
      const angle = i * 2.399; // golden angle radians
      const r = i === 0 ? 0 : 28 + (i % 3) * 9;
      return {
        ...n,
        x: 50 + r * Math.cos(angle),
        y: 50 + r * Math.sin(angle) * 0.65,
      };
    });

  // Demo data shown when no query has been made
  const DEMO_NODES = seedNodes([
    { id: 'center', label: 'Your Knowledge Graph', center: true },
    { id: 1, label: 'Ask a question →', color: 'cyan' },
    { id: 2, label: 'Entities appear here', color: 'blue' },
    { id: 3, label: 'Connections form', color: 'cyan' },
    { id: 4, label: 'Sub-queries expand', color: 'blue' },
  ]);

  const hasRealData = graphData?.nodes?.length > 0;

  const [nodes, setNodes] = useState(DEMO_NODES);

  // Rebuild node positions whenever graphData changes
  useEffect(() => {
    if (!hasRealData) {
      setNodes(DEMO_NODES);
      return;
    }

    const mapped = graphData.nodes.map((n, i) => ({
      id: n.id,
      label: n.name || n.id,
      color: n.label === 'Query' ? 'gradient' : n.label === 'SubQuery' ? 'blue' : 'cyan',
      center: n.label === 'Query',
      modality: n.label,
    }));
    setNodes(seedNodes(mapped));
  }, [graphData]);

  const draggedNode = useRef(null);

  const handlePointerDown = (id) => { draggedNode.current = id; };

  const handlePointerMove = (e) => {
    if (draggedNode.current === null || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    setNodes(prev => prev.map(n => {
      if (n.id !== draggedNode.current) return n;
      return {
        ...n,
        x: Math.max(5, Math.min(95, ((e.clientX - rect.left) / rect.width) * 100)),
        y: Math.max(5, Math.min(95, ((e.clientY - rect.top) / rect.height) * 100)),
      };
    }));
  };

  const handlePointerUp = () => { draggedNode.current = null; };

  const centerNode = nodes.find(n => n.center) || nodes[0];
  const outerNodes = nodes.filter(n => !n.center);

  // Color helper
  const nodeStyle = (n) => {
    if (n.center || n.color === 'gradient')
      return 'bg-gradient-to-r from-cyan-600 to-blue-600 border border-cyan-400/60 text-white font-semibold shadow-[0_0_40px_rgba(6,182,212,0.4)]';
    if (n.color === 'blue')
      return 'bg-[#080e1c] border border-blue-500/40 text-blue-200 shadow-[0_0_18px_rgba(59,130,246,0.15)]';
    return 'bg-[#080e1c] border border-cyan-500/40 text-cyan-200 shadow-[0_0_18px_rgba(6,182,212,0.15)]';
  };

  const lineColor = (n) =>
    n.color === 'blue' ? 'rgba(59,130,246,0.35)' : 'rgba(6,182,212,0.35)';

  return (
    <div className="flex-1 flex flex-col h-full">
      <div className="p-6 border-b border-white/5 shrink-0">
        <h2 className="text-3xl text-white tracking-tight" style={displayFont}>Entity Relationships</h2>
        <p className="text-slate-500 mt-1 text-sm">
          {hasRealData
            ? `${graphData.nodes.length} nodes · ${graphData.links?.length || 0} edges extracted from your query`
            : 'Visualizing the knowledge graph. Ask a question to populate with real entities.'}
          {' '}<span className="text-cyan-400 text-xs">Drag nodes to rearrange.</span>
        </p>
      </div>

      <div
        ref={containerRef}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
        className="flex-1 relative overflow-hidden touch-none bg-[#050810] m-4 rounded-2xl border border-white/5 shadow-2xl"
      >
        {/* Grid lines (decorative) */}
        <svg className="absolute inset-0 w-full h-full opacity-[0.04] pointer-events-none">
          {Array.from({ length: 10 }).map((_, i) => (
            <React.Fragment key={i}>
              <line x1={`${i * 10}%`} y1="0" x2={`${i * 10}%`} y2="100%" stroke="white" strokeWidth="1" />
              <line x1="0" y1={`${i * 10}%`} x2="100%" y2={`${i * 10}%`} stroke="white" strokeWidth="1" />
            </React.Fragment>
          ))}
        </svg>

        {/* Edges */}
        {centerNode && (
          <svg className="absolute inset-0 w-full h-full pointer-events-none">
            {outerNodes.map(n => (
              <line
                key={`edge-${n.id}`}
                x1={`${n.x}%`} y1={`${n.y}%`}
                x2={`${centerNode.x}%`} y2={`${centerNode.y}%`}
                stroke={lineColor(n)} strokeWidth="1.5"
                strokeDasharray={n.color === 'blue' ? '5 4' : 'none'}
              />
            ))}
            {/* Also draw edges from graphData.links if available */}
            {hasRealData && graphData.links?.map((link, i) => {
              const src = nodes.find(n => n.id === (link.source?.id ?? link.source));
              const tgt = nodes.find(n => n.id === (link.target?.id ?? link.target));
              if (!src || !tgt) return null;
              return (
                <line key={`link-${i}`}
                  x1={`${src.x}%`} y1={`${src.y}%`}
                  x2={`${tgt.x}%`} y2={`${tgt.y}%`}
                  stroke="rgba(99,102,241,0.3)" strokeWidth="1.5" strokeDasharray="3 3"
                />
              );
            })}
          </svg>
        )}

        {/* Nodes */}
        <AnimatePresence>
          {nodes.map((n, i) => (
            <motion.div
              key={n.id}
              onPointerDown={() => handlePointerDown(n.id)}
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0, opacity: 0 }}
              transition={{ delay: i * 0.07, type: 'spring', stiffness: 400, damping: 25 }}
              whileHover={{ scale: 1.08, zIndex: 20 }}
              whileTap={{ scale: 0.95, cursor: 'grabbing' }}
              className={`absolute cursor-grab -translate-x-1/2 -translate-y-1/2 backdrop-blur-sm select-none rounded-full text-sm px-5 py-2.5 ${nodeStyle(n)}`}
              style={{ left: `${n.x}%`, top: `${n.y}%`, zIndex: n.center ? 10 : 5 }}
              title={n.label}
            >
              <span className="max-w-[180px] truncate block">{n.label}</span>
            </motion.div>
          ))}
        </AnimatePresence>

        {/* Legend */}
        <div className="absolute bottom-4 left-4 flex gap-3 text-[10px] text-slate-500 pointer-events-none">
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-gradient-to-r from-cyan-500 to-blue-500 inline-block"/> Query</span>
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-blue-500 inline-block"/> Sub-query</span>
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-cyan-500 inline-block"/> Chunk</span>
        </div>
      </div>
    </div>
  );
}
