import { useRef, useEffect, useCallback } from 'react'
import ForceGraph2D from 'react-force-graph-2d'
import useStore from '../store/useStore'
import { Share2 } from 'lucide-react'

const NODE_COLORS = {
  Person: '#6366f1',
  Disease: '#ef4444',
  Treatment: '#22c55e',
  Location: '#f59e0b',
  Product: '#3b82f6',
  default: '#8b5cf6',
}

export default function GraphVisualization() {
  const graphRef = useRef()
  const { graphData } = useStore()

  const nodeCanvasObject = useCallback((node, ctx, globalScale) => {
    const label = node.name || node.id
    const fontSize = 12 / globalScale
    const color = NODE_COLORS[node.label] || NODE_COLORS.default
    const r = 6

    // Node circle
    ctx.beginPath()
    ctx.arc(node.x, node.y, r, 0, 2 * Math.PI, false)
    ctx.fillStyle = color
    ctx.fill()

    // Glow ring
    ctx.beginPath()
    ctx.arc(node.x, node.y, r + 2, 0, 2 * Math.PI, false)
    ctx.strokeStyle = color + '55'
    ctx.lineWidth = 2
    ctx.stroke()

    // Label
    ctx.font = `${fontSize}px Inter, sans-serif`
    ctx.fillStyle = '#e2e8f0'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(label, node.x, node.y + r + fontSize)
  }, [])

  const linkCanvasObject = useCallback((link, ctx) => {
    const start = link.source
    const end = link.target
    if (!start || !end || typeof start !== 'object' || typeof end !== 'object') return

    ctx.beginPath()
    ctx.moveTo(start.x, start.y)
    ctx.lineTo(end.x, end.y)
    ctx.strokeStyle = '#4f46e5'
    ctx.lineWidth = 1.5
    ctx.setLineDash([4, 4])
    ctx.stroke()
    ctx.setLineDash([])

    // Edge label
    const midX = (start.x + end.x) / 2
    const midY = (start.y + end.y) / 2
    ctx.font = '8px Inter, sans-serif'
    ctx.fillStyle = '#94a3b8'
    ctx.textAlign = 'center'
    ctx.fillText(link.label || '', midX, midY)
  }, [])

  useEffect(() => {
    if (graphRef.current && graphData.nodes.length > 0) {
      graphRef.current.zoomToFit(400, 40)
    }
  }, [graphData])

  return (
    <div className="h-full bg-gray-950 rounded-xl border border-gray-800 flex flex-col overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-800">
        <Share2 className="w-4 h-4 text-indigo-400" />
        <span className="text-sm font-semibold text-white">Knowledge Graph</span>
        <span className="ml-auto text-xs text-gray-600">{graphData.nodes.length} nodes · {graphData.links.length} edges</span>
      </div>
      <div className="flex-1 relative">
        {graphData.nodes.length === 0 ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-700 gap-2">
            <Share2 className="w-10 h-10 opacity-20" />
            <p className="text-sm">Graph will appear after a query</p>
          </div>
        ) : (
          <ForceGraph2D
            ref={graphRef}
            graphData={graphData}
            nodeCanvasObject={nodeCanvasObject}
            linkCanvasObject={linkCanvasObject}
            backgroundColor="#030712"
            nodePointerAreaPaint={(node, color, ctx) => {
              ctx.fillStyle = color
              ctx.beginPath()
              ctx.arc(node.x, node.y, 8, 0, 2 * Math.PI, false)
              ctx.fill()
            }}
            linkDirectionalArrowLength={4}
            linkDirectionalArrowRelPos={1}
            nodeLabel={(node) => `${node.label}: ${node.id}`}
            cooldownTicks={100}
          />
        )}
      </div>
    </div>
  )
}
