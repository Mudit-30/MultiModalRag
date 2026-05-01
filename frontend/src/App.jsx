import { useState, useEffect } from 'react'
import ChatInterface from './components/ChatInterface'
import GraphVisualization from './components/GraphVisualization'
import CitationPanel from './components/CitationPanel'
import UploadZone from './components/UploadZone'
import ExplainabilityPanel from './components/ExplainabilityPanel'
import { Brain, Network, BookOpen, Upload, Activity, Wifi, WifiOff, Layers } from 'lucide-react'
import { checkHealth } from './lib/api'
import useStore from './store/useStore'
import './index.css'

const TABS = [
  { id: 'graph',     label: 'Knowledge Graph', icon: Network   },
  { id: 'citations', label: 'Citations',        icon: BookOpen  },
  { id: 'trace',     label: 'Agent Trace',      icon: Activity  },
  { id: 'upload',    label: 'Ingest Data',      icon: Upload    },
]

export default function App() {
  const [rightTab, setRightTab] = useState('graph')
  const [backendStatus, setBackendStatus] = useState('checking')
  const { citations, trace } = useStore()

  useEffect(() => {
    const check = () =>
      checkHealth()
        .then(() => setBackendStatus('online'))
        .catch(() => setBackendStatus('offline'))
    check()
    const id = setInterval(check, 15000)
    return () => clearInterval(id)
  }, [])

  // Auto-switch tabs when new data arrives
  useEffect(() => { if (trace)     setRightTab('trace')     }, [trace])
  useEffect(() => { if (citations?.length) setRightTab('citations') }, [citations])

  const statusColor =
    backendStatus === 'online'   ? '#4ade80' :
    backendStatus === 'offline'  ? '#f87171' : '#94a3b8'

  return (
    <div style={{ height:'100vh', background:'var(--bg-base)', display:'flex', flexDirection:'column', overflow:'hidden' }}>
      
      {/* ── Top Bar ─────────────────────────────────────────────────────────── */}
      <header style={{
        display:'flex', alignItems:'center', gap:12,
        padding:'10px 20px',
        background:'var(--bg-surface)',
        borderBottom:'1px solid var(--border)',
        flexShrink:0,
      }}>
        {/* Logo */}
        <div style={{
          width:36, height:36, borderRadius:10,
          background:'linear-gradient(135deg,#4f46e5,#7c3aed)',
          display:'flex', alignItems:'center', justifyContent:'center',
          boxShadow:'0 0 16px #6366f155',
        }}>
          <Brain size={18} color="#fff" />
        </div>

        <div>
          <h1 style={{ fontSize:14, fontWeight:700, color:'var(--text-1)', lineHeight:1 }}>
            Multi-Modal Graph RAG
          </h1>
          <p style={{ fontSize:11, color:'var(--text-3)', marginTop:2, lineHeight:1 }}>
            Agentic · Hybrid Retrieval · Temporal Knowledge Graph
          </p>
        </div>

        {/* Tech chips */}
        <div style={{ display:'flex', gap:6, marginLeft:16 }}>
          {['Groq Llama 3.3', 'Qdrant', 'Neo4j', 'RRF Fusion'].map(t => (
            <span key={t} className="chip indigo">{t}</span>
          ))}
        </div>

        {/* Status */}
        <div style={{ marginLeft:'auto', display:'flex', alignItems:'center', gap:6 }}>
          <div style={{
            display:'flex', alignItems:'center', gap:6,
            fontSize:11, fontWeight:500,
            padding:'4px 10px', borderRadius:99,
            border:'1px solid',
            borderColor: backendStatus === 'online' ? '#166534' : '#7f1d1d',
            background: backendStatus === 'online' ? '#14532d33' : '#45101033',
            color: statusColor,
          }}>
            <div style={{
              width:6, height:6, borderRadius:9999,
              background: statusColor,
              boxShadow: backendStatus === 'online' ? `0 0 6px ${statusColor}` : 'none',
            }} />
            {backendStatus === 'online' ? 'API Online' : backendStatus === 'offline' ? 'API Offline' : 'Connecting…'}
          </div>
        </div>
      </header>

      {/* ── Main Layout ─────────────────────────────────────────────────────── */}
      <div style={{ flex:1, display:'flex', overflow:'hidden' }}>

        {/* Left: Chat */}
        <div style={{
          width:'50%', display:'flex', flexDirection:'column',
          padding:12, borderRight:'1px solid var(--border)',
        }}>
          <ChatInterface onTabSwitch={setRightTab} />
        </div>

        {/* Right: Panels */}
        <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden' }}>

          {/* Tab bar */}
          <div style={{
            display:'flex', gap:2, padding:'8px 12px 0',
            borderBottom:'1px solid var(--border)',
            background:'var(--bg-surface)',
            flexShrink:0,
          }}>
            {TABS.map(({ id, label, icon: Icon }) => {
              const active = rightTab === id
              return (
                <button
                  key={id}
                  onClick={() => setRightTab(id)}
                  style={{
                    display:'flex', alignItems:'center', gap:6,
                    fontSize:12, fontWeight: active ? 600 : 400,
                    padding:'6px 14px',
                    borderRadius:'8px 8px 0 0',
                    border:'1px solid',
                    borderBottom: active ? '1px solid var(--bg-elevated)' : '1px solid transparent',
                    borderColor: active ? 'var(--border)' : 'transparent',
                    background: active ? 'var(--bg-elevated)' : 'transparent',
                    color: active ? 'var(--indigo-glow)' : 'var(--text-3)',
                    cursor:'pointer', transition:'all .15s',
                    marginBottom: active ? -1 : 0,
                  }}
                >
                  <Icon size={13} />
                  {label}
                  {/* Badge */}
                  {id === 'citations' && citations?.length > 0 && (
                    <span style={{
                      fontSize:9, fontWeight:700,
                      background:'var(--indigo)', color:'#fff',
                      padding:'1px 5px', borderRadius:99,
                    }}>{citations.length}</span>
                  )}
                  {id === 'trace' && trace && (
                    <span style={{
                      fontSize:9, fontWeight:700,
                      background:'#7c3aed', color:'#fff',
                      padding:'1px 5px', borderRadius:99,
                    }}>{trace.timeline?.length}</span>
                  )}
                </button>
              )
            })}
          </div>

          {/* Panel content */}
          <div style={{ flex:1, overflow:'hidden', padding:12, background:'var(--bg-elevated)' }}>
            {rightTab === 'graph'     && <GraphVisualization />}
            {rightTab === 'citations' && <CitationPanel />}
            {rightTab === 'trace'     && <ExplainabilityPanel />}
            {rightTab === 'upload'    && <UploadZone />}
          </div>
        </div>
      </div>
    </div>
  )
}
