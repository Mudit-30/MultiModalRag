import { Activity, CheckCircle2, XCircle, Layers, Search, ShieldCheck, ChevronDown, ChevronRight, Zap } from 'lucide-react'
import { useState } from 'react'
import useStore from '../store/useStore'

const STEP_CONFIG = {
  Decomposition: {
    icon: Layers, color:'#818cf8', bg:'#1e1b4b44', border:'#3730a3',
    label:'Query Decomposition',
    desc:'Breaking complex query into parallel sub-queries',
  },
  Retrieval: {
    icon: Search, color:'#a78bfa', bg:'#2e106555', border:'#6d28d9',
    label:'Hybrid Retrieval',
    desc:'Dense (BGE) + BM25 Sparse + RRF Fusion + Cross-Encoder Reranking',
  },
  Validation: {
    icon: ShieldCheck, color:'#4ade80', bg:'#14532d44', border:'#166534',
    label:'SRLM Self-Reward Validation',
    desc:'Faithfulness + Relevance scoring — iterative self-improvement loop',
  },
}

function ConfidenceRing({ score }) {
  const pct  = Math.round((score || 0) * 100)
  const color = pct >= 75 ? '#4ade80' : pct >= 50 ? '#fbbf24' : '#f87171'
  return (
    <div style={{
      width:38, height:38, borderRadius:'50%',
      background:`conic-gradient(${color} ${pct * 3.6}deg, #1e2d40 0deg)`,
      display:'flex', alignItems:'center', justifyContent:'center',
      flexShrink:0,
    }}>
      <div style={{
        width:28, height:28, borderRadius:'50%',
        background:'var(--bg-base)',
        display:'flex', alignItems:'center', justifyContent:'center',
        fontSize:9, fontWeight:700, color,
      }}>
        {pct}%
      </div>
    </div>
  )
}

function AttemptBadge({ attempt, isValid }) {
  return (
    <span style={{
      fontSize:9, fontWeight:700, padding:'2px 6px',
      borderRadius:99,
      background: isValid ? '#14532d' : '#45101044',
      color:       isValid ? '#4ade80' : '#f87171',
      border:`1px solid ${isValid ? '#166534' : '#7f1d1d'}`,
    }}>
      Attempt {attempt}
    </span>
  )
}

function Step({ step, index }) {
  const [open, setOpen] = useState(true)
  const cfg  = STEP_CONFIG[step.step] || STEP_CONFIG.Retrieval
  const Icon = cfg.icon

  return (
    <div className="animate-fade-up" style={{
      borderRadius:10, border:`1px solid ${cfg.border}`,
      background: cfg.bg, overflow:'hidden',
      animationDelay:`${index * 80}ms`,
    }}>
      {/* Header */}
      <button onClick={() => setOpen(o => !o)} style={{
        width:'100%', display:'flex', alignItems:'center', gap:10,
        padding:'10px 14px', background:'transparent',
        border:'none', cursor:'pointer', textAlign:'left',
      }}>
        <div style={{
          width:28, height:28, borderRadius:8,
          background: cfg.color + '22',
          display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0,
        }}>
          <Icon size={13} color={cfg.color} />
        </div>
        <div style={{ flex:1 }}>
          <p style={{ fontSize:12, fontWeight:700, color: cfg.color }}>{cfg.label}</p>
          <p style={{ fontSize:10, color:'var(--text-3)' }}>{cfg.desc}</p>
        </div>
        <span style={{
          fontSize:10, fontWeight:700, padding:'2px 7px',
          borderRadius:99, background: cfg.color + '22',
          color: cfg.color, border:`1px solid ${cfg.color}44`,
          flexShrink:0,
        }}>Step {index + 1}</span>
        {open ? <ChevronDown size={14} color="var(--text-3)" /> : <ChevronRight size={14} color="var(--text-3)" />}
      </button>

      {/* Body */}
      {open && (
        <div style={{ padding:'0 14px 12px', display:'flex', flexDirection:'column', gap:6 }}>

          {/* Decomposition sub-queries */}
          {step.result && Array.isArray(step.result) && (
            <div style={{ display:'flex', flexDirection:'column', gap:5 }}>
              {step.result.map((sq, j) => (
                <div key={j} style={{
                  display:'flex', alignItems:'flex-start', gap:8,
                  padding:'7px 10px',
                  background:'var(--bg-base)', borderRadius:7, border:'1px solid var(--border)',
                }}>
                  <span style={{
                    fontSize:9, fontWeight:700, padding:'2px 6px',
                    borderRadius:99, background:'#3730a3', color:'#a5b4fc', flexShrink:0, marginTop:1,
                  }}>Q{j + 1}</span>
                  <p style={{ fontSize:11, color:'var(--text-2)', lineHeight:1.6 }}>{sq}</p>
                </div>
              ))}
            </div>
          )}

          {/* Retrieval stats */}
          {step.context_size !== undefined && (
            <div style={{
              display:'flex', flexWrap:'wrap', gap:8,
              padding:'8px 10px',
              background:'var(--bg-base)', borderRadius:7, border:'1px solid var(--border)',
            }}>
              <div style={{ display:'flex', alignItems:'center', gap:6, fontSize:11, color:'var(--text-2)' }}>
                <div style={{
                  width:8, height:8, borderRadius:9999,
                  background: step.context_size > 0 ? '#4ade80' : '#f87171',
                  boxShadow:`0 0 6px ${step.context_size > 0 ? '#4ade80' : '#f87171'}88`,
                }} />
                {step.context_size > 0
                  ? `${step.context_size.toLocaleString()} chars retrieved`
                  : 'No context found — ingest documents first'}
              </div>
              {step.chunks_found > 0 && (
                <span style={{ fontSize:11, color:'var(--text-3)' }}>
                  {step.chunks_found} unique chunks
                </span>
              )}
              {step.strategies && (
                <span style={{ fontSize:11, color:'var(--indigo-glow)' }}>
                  {step.strategies.join(' + ')}
                </span>
              )}
            </div>
          )}

          {/* Validation attempt result */}
          {step.is_valid !== undefined && (
            <div style={{
              display:'flex', alignItems:'flex-start', gap:10,
              padding:'10px 12px',
              background: step.is_valid ? '#14532d33' : '#45101033',
              borderRadius:7,
              border:`1px solid ${step.is_valid ? '#166534' : '#7f1d1d'}`,
            }}>
              {/* Confidence ring */}
              {step.confidence !== undefined && (
                <ConfidenceRing score={step.confidence} />
              )}

              <div style={{ flex:1 }}>
                <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:5 }}>
                  {step.is_valid
                    ? <CheckCircle2 size={13} color="#4ade80" />
                    : <XCircle size={13} color="#f87171" />
                  }
                  <span style={{
                    fontSize:11, fontWeight:600,
                    color: step.is_valid ? '#4ade80' : '#f87171',
                  }}>
                    {step.is_valid ? 'Validated — faithful to context' : 'Rejected — regenerating'}
                  </span>
                  {step.attempt && <AttemptBadge attempt={step.attempt} isValid={step.is_valid} />}
                </div>
                {step.feedback && !step.is_valid && (
                  <p style={{ fontSize:10, color:'var(--text-3)', lineHeight:1.6 }}>
                    {step.feedback}
                  </p>
                )}
              </div>
            </div>
          )}

          {step.error && (
            <p style={{ fontSize:11, color:'var(--red)', padding:'6px 10px' }}>
              Error: {step.error}
            </p>
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
          Agent trace appears here after a query.<br />
          Shows Decomposition → Retrieval → SRLM Validation.
        </p>
      </div>
    )
  }

  const timeline  = trace.timeline || []
  const validated = timeline.filter(s => s.step === 'Validation')
  const lastVal   = validated[validated.length - 1]
  const finalConf = lastVal?.confidence ?? 0

  return (
    <div style={{ height:'100%', display:'flex', flexDirection:'column' }}>
      {/* Header */}
      <div style={{
        display:'flex', alignItems:'center', gap:8,
        paddingBottom:10, marginBottom:12,
        borderBottom:'1px solid var(--border)',
      }}>
        <Activity size={14} color="var(--indigo-glow)" />
        <span style={{ fontSize:13, fontWeight:600, color:'var(--text-1)' }}>Agent Trace</span>

        {/* Final confidence */}
        {finalConf > 0 && (
          <div style={{
            display:'flex', alignItems:'center', gap:5,
            marginLeft:'auto',
            fontSize:11, fontWeight:700,
            color: finalConf >= 0.75 ? '#4ade80' : '#fbbf24',
            background: finalConf >= 0.75 ? '#14532d33' : '#78350f33',
            border:`1px solid ${finalConf >= 0.75 ? '#166534' : '#92400e'}`,
            borderRadius:99, padding:'3px 10px',
          }}>
            <Zap size={10} />
            {Math.round(finalConf * 100)}% confidence
          </div>
        )}
        <span className="chip indigo">{timeline.length} steps</span>
      </div>

      {/* SRLM retry indicator */}
      {validated.length > 1 && (
        <div style={{
          display:'flex', alignItems:'center', gap:6,
          padding:'7px 10px', marginBottom:8,
          background:'#451a0333', border:'1px solid #78350f',
          borderRadius:7, fontSize:11, color:'#fbbf24',
        }}>
          <Zap size={12} />
          SRLM self-improvement triggered — {validated.length} generation attempts
        </div>
      )}

      {/* Steps */}
      <div style={{ flex:1, overflowY:'auto', display:'flex', flexDirection:'column', gap:8 }}>
        {timeline.map((step, i) => <Step key={i} step={step} index={i} />)}
      </div>
    </div>
  )
}
