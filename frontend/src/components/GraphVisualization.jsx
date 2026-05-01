import { useRef, useEffect, useCallback, useState } from 'react'
import ForceGraph2D from 'react-force-graph-2d'
import useStore from '../store/useStore'
import { Share2, ZoomIn, ZoomOut, Maximize2 } from 'lucide-react'

const MODALITY_COLORS = {
  Query:    '#6366f1',
  SubQuery: '#4ade80',
  text:     '#8b5cf6',
  image:    '#f59e0b',
  audio:    '#22d3ee',
  default:  '#64748b',
}

const MODALITY_LABELS = {
  Query:    'Query Node',
  SubQuery: 'Sub-query',
  text:     'Text Chunk',
  image:    'Image',
  audio:    'Audio',
}

export default function GraphVisualization() {
  const graphRef = useRef()
  const { graphData } = useStore()
  const [hoveredNode, setHoveredNode] = useState(null)

  const getColor = (node) => node.color || MODALITY_COLORS[node.label] || MODALITY_COLORS.default

  const nodeCanvasObject = useCallback((node, ctx, globalScale) => {
    const label = node.name || node.id
    const color  = getColor(node)
    const isQuery = node.label === 'Query'
    const r = isQuery ? 9 : 6
    const isHovered = hoveredNode?.id === node.id

    // Outer glow
    const gradient = ctx.createRadialGradient(node.x, node.y, r * .5, node.x, node.y, r * 3)
    gradient.addColorStop(0, color + (isHovered ? 'aa' : '44'))
    gradient.addColorStop(1, color + '00')
    ctx.beginPath()
    ctx.arc(node.x, node.y, r * 3, 0, 2 * Math.PI)
    ctx.fillStyle = gradient
    ctx.fill()

    // Node
    ctx.beginPath()
    ctx.arc(node.x, node.y, r, 0, 2 * Math.PI)
    ctx.fillStyle = color
    ctx.fill()

    // Border
    ctx.beginPath()
    ctx.arc(node.x, node.y, r + 1.5, 0, 2 * Math.PI)
    ctx.strokeStyle = color + 'aa'
    ctx.lineWidth = isHovered ? 2.5 : 1.5
    ctx.stroke()

    // Label
    const fontSize = Math.max(8, 11 / globalScale)
    ctx.font = `${isQuery ? 'bold ' : ''}${fontSize}px Inter, sans-serif`
    ctx.fillStyle = isHovered ? '#f1f5f9' : '#94a3b8'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    ctx.fillText(
      label.length > 20 ? label.substring(0, 18) + '…' : label,
      node.x, node.y + r + 3
    )
  }, [hoveredNode])

  const linkCanvasObject = useCallback((link, ctx, globalScale) => {
    const s = link.source, t = link.target
    if (!s || !t || typeof s !== 'object') return

    const color = '#4f46e5'

    // Arrow line
    ctx.beginPath()
    ctx.moveTo(s.x, s.y)
    ctx.lineTo(t.x, t.y)
    ctx.strokeStyle = color + '77'
    ctx.lineWidth = 1.2
    ctx.setLineDash([5, 4])
    ctx.stroke()
    ctx.setLineDash([])

    // Edge label
    if (globalScale > 0.6) {
      const mx = (s.x + t.x) / 2, my = (s.y + t.y) / 2
      const fontSize = Math.max(6, 8 / globalScale)
      ctx.font = `${fontSize}px Inter, sans-serif`
      ctx.fillStyle = '#475569'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(link.label || '', mx, my - 5)
    }
  }, [])

  useEffect(() => {
    if (graphRef.current && graphData.nodes.length > 0) {
      setTimeout(() => graphRef.current?.zoomToFit(600, 50), 300)
    }
  }, [graphData])

  const isEmpty = graphData.nodes.length === 0

  return (
    <div style={{
      height:'100%', background:'var(--bg-base)',
      borderRadius:12, border:'1px solid var(--border)',
      display:'flex', flexDirection:'column', overflow:'hidden',
    }}>
      {/* Header */}
      <div style={{
        display:'flex', alignItems:'center', gap:8,
        padding:'10px 14px', borderBottom:'1px solid var(--border)',
        background:'var(--bg-elevated)',
      }}>
        <Share2 size={14} color="var(--indigo-glow)" />
        <span style={{ fontSize:13, fontWeight:600, color:'var(--text-1)' }}>Knowledge Graph</span>
        <span style={{ fontSize:11, color:'var(--text-3)', marginLeft:'auto' }}>
          {graphData.nodes.length} nodes · {graphData.links.length} edges
        </span>
        {!isEmpty && (
          <button
            onClick={() => graphRef.current?.zoomToFit(400, 50)}
            style={{
              background:'var(--bg-hover)', border:'1px solid var(--border)',
              borderRadius:6, padding:'3px 8px', cursor:'pointer',
              fontSize:10, color:'var(--text-2)', display:'flex', alignItems:'center', gap:4,
            }}
          >
            <Maximize2 size={10} /> Fit
          </button>
        )}
      </div>

      {/* Legend */}
      {!isEmpty && (
        <div style={{
          display:'flex', gap:10, padding:'6px 14px',
          borderBottom:'1px solid var(--border)',
          flexWrap:'wrap',
        }}>
          {Object.entries(MODALITY_LABELS).map(([k, v]) => (
            <div key={k} style={{ display:'flex', alignItems:'center', gap:4, fontSize:10, color:'var(--text-3)' }}>
              <div style={{ width:8, height:8, borderRadius:9999, background: MODALITY_COLORS[k] }} />
              {v}
            </div>
          ))}
        </div>
      )}

      {/* Graph canvas */}
      <div style={{ flex:1, position:'relative' }}>
        {isEmpty ? (
          <div style={{
            position:'absolute', inset:0,
            display:'flex', flexDirection:'column',
            alignItems:'center', justifyContent:'center',
            gap:10, color:'var(--text-4)',
          }}>
            <Share2 size={36} opacity={.2} />
            <p style={{ fontSize:12, textAlign:'center', lineHeight:1.7 }}>
              Graph visualization appears here<br />after you run a query
            </p>
          </div>
        ) : (
          <ForceGraph2D
            ref={graphRef}
            graphData={graphData}
            nodeCanvasObject={nodeCanvasObject}
            linkCanvasObject={linkCanvasObject}
            backgroundColor="transparent"
            nodePointerAreaPaint={(node, color, ctx) => {
              ctx.fillStyle = color
              ctx.beginPath()
              ctx.arc(node.x, node.y, 10, 0, 2 * Math.PI)
              ctx.fill()
            }}
            onNodeHover={setHoveredNode}
            nodeLabel={node => `<div style="background:#131921;border:1px solid #1e2d40;padding:6px 10px;border-radius:6px;font-size:11px;color:#e2e8f0;">${node.label}: ${node.name || node.id}</div>`}
            linkDirectionalArrowLength={5}
            linkDirectionalArrowRelPos={1}
            cooldownTicks={120}
            d3AlphaDecay={0.02}
            d3VelocityDecay={0.3}
          />
        )}
      </div>
    </div>
  )
}
