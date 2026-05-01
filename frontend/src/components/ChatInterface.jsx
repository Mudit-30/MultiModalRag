import { useState, useRef, useEffect } from 'react'
import { Send, Bot, User, Loader2, Sparkles, Zap, ChevronRight } from 'lucide-react'
import useStore from '../store/useStore'
import { queryAgentic } from '../lib/api'

// Demo quick-fire queries shown as chips
const QUICK_QUERIES = [
  { label: '🩺 Symptoms', query: 'What are the primary symptoms of the patient?' },
  { label: '💊 Treatment', query: 'What medications and treatment plan was prescribed?' },
  { label: '🔗 Multi-hop', query: 'What connects the X-ray findings to the final prescribed treatment?' },
  { label: '🧠 Full Trace', query: 'Trace the full diagnostic journey from the initial symptom the patient reported to the final prescribed medication and explain why each step was necessary.' },
]

function MessageBubble({ msg }) {
  const isUser = msg.role === 'user'
  return (
    <div className="animate-fade-up" style={{
      display:'flex', gap:10,
      flexDirection: isUser ? 'row-reverse' : 'row',
      alignItems:'flex-start',
    }}>
      {/* Avatar */}
      <div style={{
        width:30, height:30, borderRadius:9999, flexShrink:0,
        display:'flex', alignItems:'center', justifyContent:'center',
        background: isUser
          ? 'linear-gradient(135deg,#4f46e5,#7c3aed)'
          : 'var(--bg-elevated)',
        border:'1px solid var(--border)',
        boxShadow: isUser ? '0 0 10px #6366f133' : 'none',
      }}>
        {isUser ? <User size={14} color="#fff" /> : <Bot size={14} color="var(--indigo-glow)" />}
      </div>

      {/* Bubble */}
      <div style={{
        maxWidth:'78%',
        padding:'10px 14px',
        borderRadius: isUser ? '16px 4px 16px 16px' : '4px 16px 16px 16px',
        fontSize:13, lineHeight:1.65,
        background: isUser
          ? 'linear-gradient(135deg,#4338ca,#6d28d9)'
          : msg.isError
            ? '#1c0a0a'
            : 'var(--bg-elevated)',
        border:'1px solid',
        borderColor: isUser ? '#4f46e544' : msg.isError ? '#7f1d1d' : 'var(--border)',
        color: msg.isError ? '#fca5a5' : 'var(--text-1)',
        boxShadow: isUser ? '0 4px 20px #4f46e522' : '0 2px 8px #00000033',
        whiteSpace:'pre-wrap',
        wordBreak:'break-word',
      }}>
        {msg.content}
      </div>
    </div>
  )
}

function TypingIndicator() {
  return (
    <div style={{ display:'flex', gap:10, alignItems:'flex-start' }}>
      <div style={{
        width:30, height:30, borderRadius:9999,
        display:'flex', alignItems:'center', justifyContent:'center',
        background:'var(--bg-elevated)', border:'1px solid var(--border)',
      }}>
        <Bot size={14} color="var(--indigo-glow)" />
      </div>
      <div style={{
        padding:'12px 16px',
        background:'var(--bg-elevated)',
        border:'1px solid var(--border)',
        borderRadius:'4px 16px 16px 16px',
        display:'flex', alignItems:'center', gap:6,
      }}>
        <span style={{ fontSize:11, color:'var(--text-3)', marginRight:4 }}>Agents reasoning</span>
        <span className="typing-dot" />
        <span className="typing-dot" />
        <span className="typing-dot" />
      </div>
    </div>
  )
}

export default function ChatInterface({ onTabSwitch }) {
  const [input, setInput] = useState('')
  const bottomRef = useRef(null)
  const inputRef = useRef(null)
  const { messages, addMessage, isLoading, setLoading, setTrace, setCitations, setGraphData } = useStore()

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isLoading])

  const handleQuery = async (queryText) => {
    const q = queryText.trim()
    if (!q || isLoading) return

    addMessage({ role: 'user', content: q, id: Date.now() })
    setInput('')
    setLoading(true)

    try {
      const result = await queryAgentic(q)

      addMessage({ role: 'assistant', content: result.answer, id: Date.now() + 1 })
      setTrace(result.trace)
      if (result.citations?.length) {
        setCitations(result.citations)
        onTabSwitch?.('citations')
      }

      // Build synthetic graph from citations for visualization
      if (result.citations?.length > 0) {
        const nodes = []
        const links = []
        const queryNode = { id: 'Query', name: 'Query', label: 'Query', color: '#6366f1' }
        nodes.push(queryNode)

        result.citations.forEach((c, i) => {
          const id = c.chunk_id || `chunk_${i}`
          const shortText = (c.text || '').substring(0, 30) + '…'
          const color = c.modality === 'image' ? '#f59e0b' : c.modality === 'audio' ? '#22d3ee' : '#8b5cf6'
          nodes.push({ id, name: shortText, label: c.modality || 'text', color })
          links.push({ source: 'Query', target: id, label: `score: ${c.rerank_score?.toFixed(2) || c.score?.toFixed(2) || '—'}` })
        })

        // Add trace entities as additional nodes
        const traceEntities = result.trace?.timeline
          ?.find(t => t.step === 'Decomposition')?.result || []
        traceEntities.forEach((sq, i) => {
          const id = `sub_${i}`
          nodes.push({ id, name: sq.substring(0, 28) + '…', label: 'SubQuery', color: '#4ade80' })
          links.push({ source: 'Query', target: id, label: 'decomposed_to' })
        })

        setGraphData({ nodes, links })
        onTabSwitch?.('graph')
      }

    } catch (err) {
      addMessage({ role: 'assistant', content: `⚠️ ${err.message}`, id: Date.now() + 1, isError: true })
    } finally {
      setLoading(false)
      inputRef.current?.focus()
    }
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    handleQuery(input)
  }

  return (
    <div style={{
      display:'flex', flexDirection:'column', height:'100%',
      background:'var(--bg-surface)',
      borderRadius:12, border:'1px solid var(--border)',
      overflow:'hidden',
    }}>
      {/* Header */}
      <div style={{
        display:'flex', alignItems:'center', gap:10,
        padding:'12px 16px',
        borderBottom:'1px solid var(--border)',
        background:'var(--bg-elevated)',
      }}>
        <div style={{
          width:34, height:34, borderRadius:10,
          background:'linear-gradient(135deg,#4f46e5,#7c3aed)',
          display:'flex', alignItems:'center', justifyContent:'center',
          boxShadow:'0 0 12px #6366f144',
        }}>
          <Sparkles size={16} color="#fff" />
        </div>
        <div>
          <p style={{ fontSize:13, fontWeight:700, color:'var(--text-1)' }}>Graph RAG Agent</p>
          <p style={{ fontSize:11, color:'var(--text-3)' }}>Multi-Modal · Agentic · Cross-Encoder Reranking</p>
        </div>
        {isLoading && (
          <div style={{ marginLeft:'auto', display:'flex', alignItems:'center', gap:6, fontSize:11, color:'var(--indigo-glow)' }}>
            <Zap size={12} style={{ animation:'spin 1s linear infinite' }} />
            Processing
          </div>
        )}
      </div>

      {/* Messages */}
      <div style={{ flex:1, overflowY:'auto', padding:'16px', display:'flex', flexDirection:'column', gap:12 }}>
        {messages.length === 0 && (
          <div style={{
            flex:1, display:'flex', flexDirection:'column',
            alignItems:'center', justifyContent:'center',
            textAlign:'center', gap:12, padding:24,
          }}>
            <div style={{
              width:56, height:56, borderRadius:16,
              background:'linear-gradient(135deg,#1e1b4b,#2e1065)',
              border:'1px solid #3730a3',
              display:'flex', alignItems:'center', justifyContent:'center',
              boxShadow:'0 0 32px #6366f122',
            }}>
              <Bot size={28} color="var(--indigo-glow)" />
            </div>
            <div>
              <p style={{ fontSize:14, fontWeight:600, color:'var(--text-1)', marginBottom:4 }}>
                Multi-Modal Graph RAG
              </p>
              <p style={{ fontSize:12, color:'var(--text-3)', lineHeight:1.7 }}>
                Upload your documents in the <strong style={{color:'var(--text-2)'}}>Ingest Data</strong> tab,<br />
                then ask a question below or pick a demo query.
              </p>
            </div>

            {/* Quick query chips */}
            <div style={{ display:'flex', flexDirection:'column', gap:6, width:'100%', maxWidth:400, marginTop:8 }}>
              <p style={{ fontSize:10, fontWeight:600, color:'var(--text-4)', textTransform:'uppercase', letterSpacing:'.08em', textAlign:'left' }}>
                Demo Queries
              </p>
              {QUICK_QUERIES.map(q => (
                <button
                  key={q.label}
                  onClick={() => handleQuery(q.query)}
                  disabled={isLoading}
                  style={{
                    display:'flex', alignItems:'center', gap:8,
                    textAlign:'left', padding:'9px 12px',
                    background:'var(--bg-elevated)', border:'1px solid var(--border)',
                    borderRadius:8, cursor:'pointer',
                    color:'var(--text-2)', fontSize:12, lineHeight:1.5,
                    transition:'all .15s',
                    opacity: isLoading ? .5 : 1,
                  }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor='var(--indigo)'; e.currentTarget.style.color='var(--text-1)' }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor='var(--border)'; e.currentTarget.style.color='var(--text-2)' }}
                >
                  <ChevronRight size={12} color="var(--indigo-glow)" style={{flexShrink:0}} />
                  <span style={{flex:1}}>{q.query}</span>
                  <span style={{
                    fontSize:9, fontWeight:700, padding:'2px 6px',
                    borderRadius:99, background:'#1e1b4b', color:'#a5b4fc',
                    flexShrink:0, border:'1px solid #3730a3',
                  }}>{q.label}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map(msg => <MessageBubble key={msg.id} msg={msg} />)}
        {isLoading && <TypingIndicator />}
        <div ref={bottomRef} />
      </div>

      {/* Quick queries bar (after first message) */}
      {messages.length > 0 && (
        <div style={{
          display:'flex', gap:6, padding:'6px 16px',
          borderTop:'1px solid var(--border)',
          overflowX:'auto', flexShrink:0,
        }}>
          {QUICK_QUERIES.map(q => (
            <button
              key={q.label}
              onClick={() => handleQuery(q.query)}
              disabled={isLoading}
              style={{
                whiteSpace:'nowrap', fontSize:11, fontWeight:500,
                padding:'4px 10px', borderRadius:99,
                border:'1px solid var(--border)',
                background:'var(--bg-elevated)', color:'var(--text-2)',
                cursor:'pointer', transition:'all .15s',
                opacity: isLoading ? .4 : 1,
              }}
              onMouseEnter={e => e.currentTarget.style.borderColor='var(--indigo)'}
              onMouseLeave={e => e.currentTarget.style.borderColor='var(--border)'}
            >{q.label}</button>
          ))}
        </div>
      )}

      {/* Input */}
      <form onSubmit={handleSubmit} style={{
        display:'flex', gap:8, padding:'10px 12px',
        borderTop:'1px solid var(--border)',
        background:'var(--bg-elevated)',
        flexShrink:0,
      }}>
        <input
          ref={inputRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          disabled={isLoading}
          placeholder="Ask a multi-hop question about your documents…"
          style={{
            flex:1, background:'var(--bg-base)',
            border:'1px solid var(--border)',
            borderRadius:10, padding:'9px 14px',
            fontSize:13, color:'var(--text-1)',
            outline:'none', transition:'border-color .15s',
          }}
          onFocus={e => e.target.style.borderColor='var(--indigo)'}
          onBlur={e => e.target.style.borderColor='var(--border)'}
        />
        <button
          type="submit"
          disabled={isLoading || !input.trim()}
          style={{
            background: 'linear-gradient(135deg,#4f46e5,#7c3aed)',
            border:'none', borderRadius:10,
            padding:'9px 16px', cursor:'pointer',
            display:'flex', alignItems:'center', gap:6,
            fontSize:13, fontWeight:600, color:'#fff',
            opacity: (isLoading || !input.trim()) ? .4 : 1,
            transition:'opacity .15s',
            boxShadow:'0 0 12px #6366f133',
          }}
        >
          {isLoading ? <Loader2 size={15} style={{animation:'spin 1s linear infinite'}} /> : <Send size={15} />}
          Send
        </button>
      </form>
    </div>
  )
}
