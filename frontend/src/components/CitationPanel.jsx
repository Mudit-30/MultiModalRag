import { BookOpen, FileText, Image, Music, ChevronRight, Hash } from 'lucide-react'
import useStore from '../store/useStore'

const MODALITY_ICON  = { text: FileText, image: Image, audio: Music }
const MODALITY_COLOR = { text:'var(--violet)', image:'var(--amber)', audio:'var(--cyan)' }
const MODALITY_CHIP  = { text:'indigo', image:'amber', audio:'cyan' }

function ScoreBar({ score }) {
  const pct = Math.min(100, Math.max(0, Math.round((score || 0) * 100)))
  const color = pct > 75 ? '#4ade80' : pct > 50 ? '#fbbf24' : '#f87171'
  return (
    <div style={{ display:'flex', alignItems:'center', gap:6 }}>
      <div style={{
        flex:1, height:3, background:'var(--bg-base)',
        borderRadius:99, overflow:'hidden',
      }}>
        <div style={{
          height:'100%', width:`${pct}%`,
          background: color,
          borderRadius:99, transition:'width .5s ease',
          boxShadow:`0 0 6px ${color}88`,
        }} />
      </div>
      <span style={{ fontSize:10, color, fontWeight:600, minWidth:28 }}>{pct}%</span>
    </div>
  )
}

export default function CitationPanel() {
  const { citations } = useStore()

  if (!citations?.length) {
    return (
      <div style={{
        display:'flex', flexDirection:'column',
        alignItems:'center', justifyContent:'center',
        height:'100%', gap:10, color:'var(--text-4)',
      }}>
        <BookOpen size={36} opacity={.2} />
        <p style={{ fontSize:12, textAlign:'center', lineHeight:1.7 }}>
          Retrieved source chunks appear here<br />after a query
        </p>
      </div>
    )
  }

  return (
    <div style={{ height:'100%', display:'flex', flexDirection:'column', gap:0 }}>
      {/* Header */}
      <div style={{
        display:'flex', alignItems:'center', gap:8,
        paddingBottom:10, marginBottom:10,
        borderBottom:'1px solid var(--border)',
      }}>
        <BookOpen size={14} color="var(--indigo-glow)" />
        <span style={{ fontSize:13, fontWeight:600, color:'var(--text-1)' }}>Retrieved Sources</span>
        <span className="chip indigo" style={{ marginLeft:'auto' }}>{citations.length} chunks</span>
      </div>

      {/* Cards */}
      <div style={{ flex:1, overflowY:'auto', display:'flex', flexDirection:'column', gap:8 }}>
        {citations.map((c, i) => {
          const modality = c.modality || 'text'
          const Icon = MODALITY_ICON[modality] || FileText
          const color = MODALITY_COLOR[modality] || 'var(--violet)'
          const chipClass = MODALITY_CHIP[modality] || 'indigo'
          const score = c.rerank_score ?? c.score ?? 0
          const text = c.text || c.caption || c.transcript || '—'

          return (
            <div key={i} className="animate-fade-up" style={{
              background:'var(--bg-base)',
              border:'1px solid var(--border)',
              borderRadius:10, padding:'12px 14px',
              animationDelay:`${i * 60}ms`,
            }}>
              {/* Top row */}
              <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8 }}>
                <div style={{
                  width:26, height:26, borderRadius:7,
                  background: color + '22', border:`1px solid ${color}44`,
                  display:'flex', alignItems:'center', justifyContent:'center',
                  flexShrink:0,
                }}>
                  <Icon size={13} color={color} />
                </div>
                <span className={`chip ${chipClass}`}>{modality}</span>
                <div style={{
                  display:'flex', alignItems:'center', gap:4,
                  fontSize:10, color:'var(--text-4)',
                }}>
                  <Hash size={9} />
                  {(c.chunk_id || c.source_id || `chunk_${i}`).substring(0, 12)}…
                </div>
                <div style={{ marginLeft:'auto', width:80 }}>
                  <ScoreBar score={score} />
                </div>
              </div>

              {/* Text */}
              <p style={{
                fontSize:12, lineHeight:1.7,
                color:'var(--text-2)',
                display:'-webkit-box',
                WebkitLineClamp:4,
                WebkitBoxOrient:'vertical',
                overflow:'hidden',
              }}>
                {text}
              </p>
            </div>
          )
        })}
      </div>
    </div>
  )
}
