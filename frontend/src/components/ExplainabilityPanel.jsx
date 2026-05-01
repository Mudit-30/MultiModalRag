import { Activity, CheckCircle2, XCircle, Layers, Search, ShieldCheck, ChevronDown, ChevronRight } from 'lucide-react'
import { useState } from 'react'
import useStore from '../store/useStore'

const STEP_CONFIG = {
  Decomposition: {
    icon: Layers,
    color: '#818cf8', bg: '#1e1b4b44', border: '#3730a3',
    label: 'Query Decomposition',
    desc: 'Breaking complex query into parallel sub-queries',
  },
  Retrieval: {
    icon: Search,
    color: '#a78bfa', bg: '#2e1065aa', border: '#6d28d9',
    label: 'Hybrid Retrieval',
    desc: 'Vector search + Graph traversal + RRF Fusion + Cross-Encoder Reranking',
  },
  Validation: {
    icon: ShieldCheck,
    color: '#4ade80', bg: '#14532d44', border: '#166534',
    label: 'Hallucination Validation',
    desc: 'Self-reflection: checking faithfulness to retrieved context',
  },
}

function Step({ step, index }) {
  const [expanded, setExpanded] = useState(true)
  const cfg = STEP_CONFIG[step.step] || STEP_CONFIG.Retrieval
  const Icon = cfg.icon

  return (
    <div className="animate-fade-up" style={{
      animationDelay: `${index * 100}ms`,
      borderRadius:10,
      border:`1px solid ${cfg.border}`,
      background: cfg.bg,
      overflow:'hidden',
    }}>
      {/* Step header */}
      <button
        onClick={() => setExpanded(e => !e)}
        style={{
          width:'100%', display:'flex', alignItems:'center', gap:10,
          padding:'10px 14px', background:'transparent',
          border:'none', cursor:'pointer', textAlign:'left',
        }}
      >
        <div style={{
          width:28, height:28, borderRadius:8,
          background: cfg.color + '22',
          display:'flex', alignItems:'center', justifyContent:'center',
          flexShrink:0,
        }}>
          <Icon size={13} color={cfg.color} />
        </div>
        <div style={{ flex:1 }}>
          <p style={{ fontSize:12, fontWeight:700, color: cfg.color }}>{cfg.label}</p>
          <p style={{ fontSize:10, color:'var(--text-3)' }}>{cfg.desc}</p>
        </div>
        {/* Step number */}
        <span style={{
          fontSize:10, fontWeight:700, padding:'2px 7px',
          borderRadius:99, background: cfg.color + '22',
          color: cfg.color, border:`1px solid ${cfg.color}44`,
        }}>Step {index + 1}</span>
        {expanded
          ? <ChevronDown size={14} color="var(--text-3)" />
          : <ChevronRight size={14} color="var(--text-3)" />
        }
      </button>

      {/* Expanded body */}
      {expanded && (
        <div style={{ padding:'0 14px 12px', display:'flex', flexDirection:'column', gap:6 }}>

          {/* Decomposition sub-queries */}
          {step.result && Array.isArray(step.result) && (
            <div style={{ display:'flex', flexDirection:'column', gap:5 }}>
              {step.result.map((sq, j) => (
                <div key={j} style={{
                  display:'flex', alignItems:'flex-start', gap:8,
                  padding:'7px 10px',
                  background:'var(--bg-base)', borderRadius:7,
                  border:'1px solid var(--border)',
                }}>
                  <span style={{
                    fontSize:9, fontWeight:700, padding:'2px 6px',
                    borderRadius:99, background:'#3730a3', color:'#a5b4fc',
                    flexShrink:0, marginTop:1,
                  }}>Q{j + 1}</span>
                  <p style={{ fontSize:11, color:'var(--text-2)', lineHeight:1.6 }}>{sq}</p>
                </div>
              ))}
            </div>
          )}

          {/* Retrieval context size */}
          {step.context_size !== undefined && (
            <div style={{
              display:'flex', alignItems:'center', gap:8,
              padding:'8px 10px',
              background:'var(--bg-base)', borderRadius:7,
              border:'1px solid var(--border)',
            }}>
              <div style={{
                width:8, height:8, borderRadius:9999,
                background: step.context_size > 0 ? '#4ade80' : '#f87171',
                boxShadow: `0 0 6px ${step.context_size > 0 ? '#4ade80' : '#f87171'}88`,
              }} />
              <span style={{ fontSize:11, color:'var(--text-2)' }}>
                {step.context_size > 0
                  ? `${step.context_size.toLocaleString()} characters of context retrieved`
                  : 'No context retrieved — knowledge base may be empty'
                }
              </span>
            </div>
          )}

          {/* Validation result */}
          {step.is_valid !== undefined && (
            <div style={{
              display:'flex', alignItems:'flex-start', gap:8,
              padding:'8px 10px',
              background: step.is_valid ? '#14532d33' : '#45101033',
              borderRadius:7,
              border:`1px solid ${step.is_valid ? '#166834' : '#7f1d1d'}`,
            }}>
              {step.is_valid
                ? <CheckCircle2 size={14} color="#4ade80" style={{flexShrink:0, marginTop:1}} />
                : <XCircle size={14} color="#f87171" style={{flexShrink:0, marginTop:1}} />
              }
              <p style={{ fontSize:11, color: step.is_valid ? '#86efac' : '#fca5a5', lineHeight:1.6 }}>
                {step.is_valid ? 'Answer validated — faithful to source context' : step.feedback || 'Regenerating with feedback…'}
              </p>
            </div>
          )}

          {/* Error */}
          {step.error && (
            <p style={{ fontSize:11, color:'var(--red)', padding:'6px 10px' }}>{step.error}</p>
          )}
        </div>
      )}
    </div>
  )
}

export default function ExplainabilityPanel() {
  const { trace } = useStore()

  if (!trace) {
    return (
      <div style={{
        display:'flex', flexDirection:'column',
        alignItems:'center', justifyContent:'center',
        height:'100%', gap:10, color:'var(--text-4)',
      }}>
        <Activity size={36} opacity={.2} />
        <p style={{ fontSize:12, textAlign:'center', lineHeight:1.7 }}>
          Agent trace timeline appears here<br />after a query runs
        </p>
      </div>
    )
  }

  const timeline = trace.timeline || []

  return (
    <div style={{ height:'100%', display:'flex', flexDirection:'column', gap:0 }}>
      {/* Header */}
      <div style={{
        display:'flex', alignItems:'center', gap:8,
        paddingBottom:10, marginBottom:12,
        borderBottom:'1px solid var(--border)',
      }}>
        <Activity size={14} color="var(--indigo-glow)" />
        <span style={{ fontSize:13, fontWeight:600, color:'var(--text-1)' }}>Agent Trace</span>
        <span className="chip indigo" style={{ marginLeft:'auto' }}>{timeline.length} steps</span>
      </div>

      {/* Steps */}
      <div style={{ flex:1, overflowY:'auto', display:'flex', flexDirection:'column', gap:8 }}>
        {timeline.map((step, i) => (
          <Step key={i} step={step} index={i} />
        ))}
      </div>
    </div>
  )
}
