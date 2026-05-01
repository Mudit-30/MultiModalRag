import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { Menu, Plus, MessageSquare, Library, Settings, User, CornerDownLeft, FileText, Loader2, Sparkles, Search, Network, BookOpen, Activity, Database, CheckCircle2, Link, Send, Paperclip, Globe, Mic, MicOff } from 'lucide-react'
import GraphVisualization from './components/GraphVisualization'
import CitationPanel from './components/CitationPanel'
import UploadZone from './components/UploadZone'
import ExplainabilityPanel from './components/ExplainabilityPanel'
import { checkHealth, queryAgentic, scrapeUrl } from './lib/api'
import useStore from './store/useStore'
import ReactMarkdown from 'react-markdown'
import './index.css'

// ── Helpers ───────────────────────────────────────────────────────────────────

// Convert chunk_id like "a2d19624-b61a-4ab2-ba4a-e771518f128e_3" into readable label
function readableChunkId(citation) {
  if (!citation) return 'Document'
  if (citation.filename) return citation.filename
  if (citation.source)   return citation.source
  if (citation.doc_id)   return citation.doc_id
  const raw = citation.chunk_id || ''
  const parts = raw.split('_')
  const last  = parseInt(parts[parts.length - 1], 10)
  if (!isNaN(last)) return `Chunk ${last + 1}`
  return raw.slice(-10) || 'Document'
}

// Detect URL in text (http/https)
const URL_RE = /https?:\/\/[^\s]+/g
function extractUrls(text) {
  return (text.match(URL_RE) || [])
}
function stripUrls(text) {
  return text.replace(URL_RE, '').trim()
}

// Build a meaningful graph from query result
function buildGraphData(query, citations, trace) {
  const nodes = []
  const links = []

  // Center: the query itself (truncated)
  const queryLabel = query.length > 40 ? query.slice(0, 38) + '…' : query
  nodes.push({ id: 'Query', name: queryLabel, label: 'Query' })

  // Sub-queries from Decomposition step
  const subQueries = trace?.timeline
    ?.find(t => t.step === 'Decomposition' || t.step === 'Query Analysis')?.result || []
  subQueries.forEach((sq, i) => {
    const id = `sq_${i}`
    const label = typeof sq === 'string' ? (sq.length > 36 ? sq.slice(0, 34) + '…' : sq) : `Sub-query ${i + 1}`
    nodes.push({ id, name: label, label: 'SubQuery' })
    links.push({ source: 'Query', target: id })
  })

  // Document nodes — group by filename (not chunk)
  const docMap = new Map()
  citations.forEach((c, i) => {
    const docName = c.filename || c.source || c.doc_id || `Document ${i + 1}`
    if (!docMap.has(docName)) {
      docMap.set(docName, { id: `doc_${docMap.size}`, name: docName, label: c.modality || 'text' })
      nodes.push(docMap.get(docName))
    }
    // Link sub-queries to docs if decomposed, else link query directly
    const targetId = docMap.get(docName).id
    const srcId = subQueries.length > 0 ? `sq_${i % subQueries.length}` : 'Query'
    if (!links.find(l => l.source === srcId && l.target === targetId)) {
      links.push({ source: srcId, target: targetId })
    }
  })

  return { nodes, links }
}

export default function App() {
  const [isSidebarOpen, setSidebarOpen] = useState(true)
  const [isProfileOpen, setProfileOpen] = useState(false)
  const [currentView, setCurrentView] = useState('chat')
  const [backendStatus, setBackendStatus] = useState('checking')
  
  const { messages, addMessage, isLoading, setLoading, setTrace, setCitations, setGraphData, citations, trace, uploadedFiles } = useStore()
  const [inputValue, setInputValue] = useState('')
  const scrollRef = useRef(null)
  const inputRef = useRef(null)

  // Derived state for sidebar
  const recentSessions = messages.filter(m => m.role === 'user').slice(-3).map(m => m.content.slice(0, 30) + (m.content.length > 30 ? '...' : ''))
  const uniqueDocs = uploadedFiles.length > 0 
    ? uploadedFiles.map(f => f.name) 
    : [...new Set((citations || []).map(c => readableChunkId(c)))]

  useEffect(() => {
    const check = () =>
      checkHealth()
        .then(() => setBackendStatus('online'))
        .catch(() => setBackendStatus('offline'))
    check()
    const id = setInterval(check, 15000)
    return () => clearInterval(id)
  }, [])

  // Removed auto-switch side effects so user stays in chat view

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  const [detectedUrls, setDetectedUrls] = useState([])
  const [isListening, setIsListening] = useState(false)
  const recognitionRef = useRef(null)

  // Web Speech API initialization
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
      if (SpeechRecognition) {
        recognitionRef.current = new SpeechRecognition()
        recognitionRef.current.continuous = true
        recognitionRef.current.interimResults = true
        recognitionRef.current.lang = 'en-US'

        recognitionRef.current.onresult = (event) => {
          let transcript = ''
          for (let i = event.resultIndex; i < event.results.length; ++i) {
            transcript += event.results[i][0].transcript
          }
          setInputValue((prev) => {
            const newVal = prev + (prev.endsWith(' ') || prev.length === 0 ? '' : ' ') + transcript
            setDetectedUrls(extractUrls(newVal))
            return newVal
          })
        }

        recognitionRef.current.onerror = (event) => {
          console.error('Speech recognition error:', event.error)
          setIsListening(false)
        }

        recognitionRef.current.onend = () => {
          setIsListening(false)
        }
      }
    }
  }, [])

  const toggleListening = () => {
    if (!recognitionRef.current) return alert('Speech Recognition not supported in this browser.')
    if (isListening) {
      recognitionRef.current.stop()
      setIsListening(false)
    } else {
      recognitionRef.current.start()
      setIsListening(true)
    }
  }

  // Live URL detection as user types
  const handleInputChange = (e) => {
    const val = e.target.value
    setInputValue(val)
    setDetectedUrls(extractUrls(val))
  }

  const handleQuery = async (queryText) => {
    const q = queryText.trim()
    if (!q || isLoading) return

    const urls    = extractUrls(q)
    const pureQ   = urls.length ? stripUrls(q) || q : q   // query without URL
    const hasUrls = urls.length > 0

    addMessage({ role: 'user', content: q, id: Date.now().toString(), hasUrls, urls })
    setInputValue('')
    setDetectedUrls([])
    setLoading(true)

    try {
      let result

      if (hasUrls) {
        // Scrape each URL then query against scraped + stored context
        addMessage({ role: 'assistant', content: `🌐 Scraping ${urls.length} URL${urls.length > 1 ? 's' : ''}…`, id: (Date.now() + 0.5).toString(), isStatus: true })
        await Promise.all(urls.map(u => scrapeUrl(u).catch(() => null)))
        result = await queryAgentic(pureQ || q)
      } else {
        result = await queryAgentic(q)
      }

      // Remove the status message (last assistant message if isStatus)
      if (hasUrls) {
        useStore.setState(s => ({
          messages: s.messages.filter(m => !m.isStatus)
        }))
      }

      addMessage({
        role: 'assistant',
        content: result.answer,
        id: (Date.now() + 1).toString(),
        sources: result.citations?.map(readableChunkId)
      })
      setTrace(result.trace)

      if (result.citations?.length) {
        setCitations(result.citations)
      }

      // Render real neo4j knowledge graph if returned by backend, else fallback to mock execution trace graph
      if (result.graph_data && result.graph_data.nodes?.length > 0) {
        setGraphData(result.graph_data)
      } else if (result.citations?.length > 0) {
        const gd = buildGraphData(pureQ || q, result.citations, result.trace)
        setGraphData(gd)
      }
    } catch (err) {
      addMessage({ role: 'assistant', content: `⚠️ ${err.message}`, id: (Date.now() + 1).toString(), isError: true })
    } finally {
      setLoading(false)
      inputRef.current?.focus()
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleQuery(inputValue);
    }
  };

  const statusColor = backendStatus === 'online' ? '#4ade80' : backendStatus === 'offline' ? '#f87171' : '#94a3b8'

  return (
    <div className="flex h-screen bg-[#050810] text-slate-200 overflow-hidden font-sans selection:bg-cyan-500/30 selection:text-cyan-100">
      {/* Sidebar */}
      <AnimatePresence initial={false}>
        {isSidebarOpen && (
          <motion.div
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 288, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ type: 'spring', bounce: 0, duration: 0.4 }}
            className="h-full bg-[#0c111d]/95 backdrop-blur-xl border-r border-white/5 flex flex-col shrink-0 z-30 overflow-hidden whitespace-nowrap shadow-2xl"
          >
            <div className="p-6 w-72 flex-1 overflow-y-auto">
              <div className="flex items-center gap-3 mb-10 cursor-pointer group">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-cyan-500 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-900/30 group-hover:shadow-cyan-500/40 transition-all group-hover:scale-105">
                  <Sparkles size={20} className="text-white" />
                </div>
                <div className="flex-1" onClick={() => setCurrentView('chat')}>
                  <span className="font-semibold tracking-tight text-white group-hover:text-cyan-400 transition-colors text-lg">Zero Memory</span>
                  <p className="text-[10px] text-slate-500 uppercase tracking-widest">Workspace</p>
                </div>
                <button onClick={(e) => { e.stopPropagation(); useStore.setState({ messages: [], citations: null, trace: null, graphData: {nodes:[], links:[]} }); setCurrentView('chat'); }} className="p-2 bg-white/5 hover:bg-cyan-500/20 hover:text-cyan-400 rounded-xl text-slate-400 transition-all opacity-0 group-hover:opacity-100">
                  <Plus size={16} />
                </button>
              </div>

              <div className="space-y-8">
                <div>
                  <h3 className="text-[10px] uppercase tracking-widest text-slate-500 font-semibold mb-3 ml-2 flex items-center gap-2">
                    <MessageSquare size={12} /> Recent Sessions
                  </h3>
                  <div className="space-y-0.5">
                    {recentSessions.length > 0 ? recentSessions.map((session, i) => (
                      <button key={i} onClick={() => setCurrentView('chat')} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all hover:bg-white/5 text-sm text-slate-400 hover:text-slate-100 hover:translate-x-1 text-left truncate group">
                        <div className="w-1.5 h-1.5 rounded-full bg-slate-700 group-hover:bg-cyan-500 transition-colors shrink-0" />
                        <span className="truncate">{session}</span>
                      </button>
                    )) : (
                      <p className="text-sm text-slate-600 italic px-3 py-2.5">No recent sessions</p>
                    )}
                  </div>
                </div>
                
                <div>
                  <h3 className="text-[10px] uppercase tracking-widest text-slate-500 font-semibold mb-3 ml-2 flex items-center gap-2">
                    <Library size={12} /> Documents
                  </h3>
                  <div className="space-y-0.5">
                    {uniqueDocs.length > 0 ? uniqueDocs.map((doc, i) => (
                      <button key={i} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all hover:bg-white/5 text-sm text-slate-400 hover:text-slate-100 hover:translate-x-1 text-left truncate group">
                        <FileText size={14} className="opacity-50 group-hover:opacity-100 group-hover:text-blue-400 transition-colors shrink-0" />
                        <span className="truncate">{doc}</span>
                      </button>
                    )) : (
                      <p className="text-sm text-slate-600 italic px-3 py-2.5">No documents uploaded</p>
                    )}
                  </div>
                </div>

                <div>
                  <h3 className="text-[10px] uppercase tracking-widest text-slate-500 font-semibold mb-3 ml-2 flex items-center gap-2">
                    <Settings size={12} /> Workspace
                  </h3>
                  <div className="space-y-0.5">
                    <button onClick={() => setCurrentView('chat')} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all text-sm text-left truncate group hover:translate-x-1 ${currentView === 'chat' ? 'bg-cyan-500/10 text-cyan-400' : 'hover:bg-white/5 text-slate-400 hover:text-slate-100'}`}>
                      <MessageSquare size={15} className={`transition-colors shrink-0 ${currentView === 'chat' ? 'text-cyan-400' : 'text-slate-500 group-hover:text-cyan-400'}`} />
                      <span className="truncate">Chat Interface</span>
                    </button>
                    <button onClick={() => setCurrentView('graph')} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all text-sm text-left truncate group hover:translate-x-1 ${currentView === 'graph' ? 'bg-cyan-500/10 text-cyan-400' : 'hover:bg-white/5 text-slate-400 hover:text-slate-100'}`}>
                      <Network size={15} className={`transition-colors shrink-0 ${currentView === 'graph' ? 'text-cyan-400' : 'text-slate-500 group-hover:text-cyan-400'}`} />
                      <span className="truncate">Knowledge Graph</span>
                    </button>
                    <button onClick={() => setCurrentView('citations')} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all text-sm text-left truncate group hover:translate-x-1 ${currentView === 'citations' ? 'bg-cyan-500/10 text-cyan-400' : 'hover:bg-white/5 text-slate-400 hover:text-slate-100'}`}>
                      <BookOpen size={15} className={`transition-colors shrink-0 ${currentView === 'citations' ? 'text-cyan-400' : 'text-slate-500 group-hover:text-cyan-400'}`} />
                      <span className="truncate">Citations</span>
                    </button>
                    <button onClick={() => setCurrentView('trace')} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all text-sm text-left truncate group hover:translate-x-1 ${currentView === 'trace' ? 'bg-cyan-500/10 text-cyan-400' : 'hover:bg-white/5 text-slate-400 hover:text-slate-100'}`}>
                      <Activity size={15} className={`transition-colors shrink-0 ${currentView === 'trace' ? 'text-cyan-400' : 'text-slate-500 group-hover:text-cyan-400'}`} />
                      <span className="truncate">Agent Trace</span>
                    </button>
                    <button onClick={() => setCurrentView('upload')} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all text-sm text-left truncate group hover:translate-x-1 ${currentView === 'upload' ? 'bg-cyan-500/10 text-cyan-400' : 'hover:bg-white/5 text-slate-400 hover:text-slate-100'}`}>
                      <Database size={15} className={`transition-colors shrink-0 ${currentView === 'upload' ? 'text-cyan-400' : 'text-slate-500 group-hover:text-cyan-400'}`} />
                      <span className="truncate">Ingest Data</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-auto p-4 border-t border-white/5 w-72 bg-gradient-to-t from-[#050810]/50 to-transparent">
              <div 
                onClick={() => setProfileOpen(!isProfileOpen)}
                className="flex items-center gap-3 cursor-pointer p-2 rounded-xl hover:bg-white/5 transition-all text-slate-400 hover:text-white">
                <div className="w-9 h-9 rounded-full bg-[#050810] border border-white/10 flex items-center justify-center text-slate-400 shadow-lg group-hover:border-slate-600 transition-colors shrink-0">
                  <User size={16} />
                </div>
                <div className="flex-1 overflow-hidden">
                  <p className="text-sm font-medium truncate">Alex Rivera</p>
                  <p className="text-[11px] text-slate-500 truncate">College Access Plan</p>
                </div>
                <Settings size={14} className="opacity-50 hover:opacity-100 transition-opacity shrink-0" />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Content (Chat + Optional Panel) */}
      <div className="flex-1 flex flex-col h-full relative overflow-hidden">
               
        {/* Header */}
        <header className="flex items-center justify-between p-4 absolute top-0 w-full z-20 bg-transparent pointer-events-none">
          <div className="flex items-center gap-2 pointer-events-auto">
             <button
              onClick={() => setSidebarOpen(!isSidebarOpen)}
              className="p-2 hover:bg-[#0c111d] rounded-xl transition-all duration-300 text-slate-400 hover:text-cyan-400 hover:shadow-lg border border-transparent hover:border-white/5 bg-[#050810]/50 backdrop-blur-md"
            >
              <Menu size={20} className={`transition-transform duration-500 ${isSidebarOpen ? '-rotate-180 scale-90' : 'rotate-0 scale-100'}`} />
            </button>
          </div>
        </header>

        <div className="flex-1 flex flex-col h-full relative transition-all w-full">
          <div className="absolute inset-0 pointer-events-none opacity-20 z-0" 
               style={{ background: 'radial-gradient(circle at 50% 40%, #1e40af 0%, transparent 60%)' }}></div>
               
          {currentView === 'chat' && (
            <>
              {/* Chat Scroll Area */}
              <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 w-full flex flex-col items-center z-10">
                {messages.length === 0 ? (
                  <div className="flex-1 flex flex-col items-center justify-center w-full pb-20 mt-12">
                     <motion.div 
                       initial={{ opacity: 0, scale: 0.95, y: 10 }}
                       animate={{ opacity: 1, scale: 1, y: 0 }}
                       transition={{ duration: 0.5, ease: "easeOut" }}
                       className="text-center mb-10"
                     >
                       <h1 className="rainbow-text font-display mb-5 pb-4"
                           style={{ fontSize: 'clamp(3.5rem, 8vw, 6.5rem)', fontWeight: 400, lineHeight: 1.1 }}>
                         Zero Memory
                       </h1>
                       <p className="text-slate-400 text-base font-light italic tracking-widest uppercase">
                         Agentic &nbsp;·&nbsp; Hybrid Retrieval &nbsp;·&nbsp; Temporal Knowledge Graph
                       </p>
                     </motion.div>

                     {/* Suggestions in empty state */}
                     <motion.div 
                       initial={{ opacity: 0, y: 20 }}
                       animate={{ opacity: 1, y: 0 }}
                       transition={{ delay: 0.2, duration: 0.5 }}
                       className="flex flex-wrap justify-center gap-3 w-full max-w-2xl px-4 mt-4"
                     >
                       {[
                         "What are the primary symptoms of the patient?",
                         "Trace the diagnostic journey to the final treatment",
                         "What connects the X-ray findings to the treatment?"
                       ].map((suggestion, idx) => (
                         <motion.button 
                           key={idx}
                           onClick={() => handleQuery(suggestion)}
                           disabled={isLoading}
                           whileHover={{ scale: 1.02 }}
                           whileTap={{ scale: 0.98 }}
                           className="px-4 py-2 rounded-full border border-white/10 text-xs text-slate-400 hover:border-cyan-500/50 hover:text-cyan-400 transition-colors bg-[#050810]/50 cursor-pointer disabled:opacity-50"
                         >
                           {suggestion}
                         </motion.button>
                       ))}
                     </motion.div>
                  </div>
                ) : (
                  <div className="w-full max-w-4xl pt-20 pb-32 flex flex-col gap-8">
                    <AnimatePresence initial={false}>
                      {messages.map((msg) => (
                        <motion.div 
                          key={msg.id}
                          initial={{ opacity: 0, y: 15, scale: 0.98, transformOrigin: msg.role === 'user' ? 'bottom right' : 'bottom left' }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          transition={{ type: "spring", stiffness: 400, damping: 25 }}
                          className={`flex gap-4 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                        >
                          {msg.role === 'assistant' && (
                            <div className="h-8 w-8 shrink-0 rounded-lg bg-gradient-to-br from-cyan-900 to-blue-900 border border-cyan-800 flex items-center justify-center mt-1">
                              <Sparkles size={16} className="text-cyan-300" />
                            </div>
                          )}
                          <div className={`max-w-[85%] ${msg.role === 'user' ? 'bg-white/5 text-slate-200 px-5 py-3.5 rounded-2xl rounded-tr-sm border border-white/5 shadow-md shadow-black/20' : 'text-slate-300 pt-1'}`}>
                            {msg.role === 'assistant' ? (
                              <div className="prose prose-invert prose-lg prose-slate max-w-none leading-relaxed tracking-wide font-sans text-slate-200">
                                <ReactMarkdown>{msg.content}</ReactMarkdown>
                              </div>
                            ) : (
                              <p className="leading-relaxed whitespace-pre-wrap text-xl font-medium">{msg.content}</p>
                            )}
                            
                            {msg.sources && msg.sources.length > 0 && (
                              <motion.div 
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: 'auto' }}
                                transition={{ delay: 0.3, duration: 0.4 }}
                                className="mt-4 flex flex-col gap-2 overflow-hidden"
                              >
                                 <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
                                   <Library size={12} /> Sources Consulted
                                 </span>
                                 <div className="flex flex-wrap gap-2">
                                   {msg.sources.map((src, i) => (
                                     <motion.div 
                                       key={i} 
                                       onClick={() => setCurrentView('citations')}
                                       whileHover={{ scale: 1.05 }}
                                       className="flex items-center gap-1.5 px-3 py-1.5 bg-[#0c111d] border border-white/10 rounded-lg text-[11px] text-cyan-300 hover:border-cyan-700 hover:bg-cyan-950/30 transition-colors cursor-pointer font-medium"
                                     >
                                       <FileText size={11} />
                                       {src}
                                     </motion.div>
                                   ))}
                                 </div>
                              </motion.div>
                            )}
                          </div>
                        </motion.div>
                      ))}
                    </AnimatePresence>
                    
                    <AnimatePresence>
                      {isLoading && (
                        <motion.div 
                          initial={{ opacity: 0, scale: 0.95, y: 10, transformOrigin: 'bottom left' }}
                          animate={{ opacity: 1, scale: 1, y: 0 }}
                          exit={{ opacity: 0, scale: 0.95, y: 10, transition: { duration: 0.2 } }}
                          transition={{ type: 'spring', damping: 25, stiffness: 400 }}
                          className="flex gap-4 justify-start"
                        >
                          <div className="h-8 w-8 shrink-0 rounded-lg bg-gradient-to-br from-cyan-900 to-blue-900 border border-cyan-800 flex items-center justify-center mt-1 text-cyan-300">
                            <Sparkles size={16} className="animate-pulse" />
                          </div>
                          <div className="text-slate-300 pt-1 flex items-center h-[42px]">
                            <div className="flex items-center gap-1.5 px-3 py-2 bg-white/5 border border-white/5 rounded-full">
                              <motion.div animate={{ y: [0, -4, 0] }} transition={{ duration: 0.6, repeat: Infinity, ease: 'easeInOut' }} className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
                              <motion.div animate={{ y: [0, -4, 0] }} transition={{ duration: 0.6, repeat: Infinity, ease: 'easeInOut', delay: 0.15 }} className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
                              <motion.div animate={{ y: [0, -4, 0] }} transition={{ duration: 0.6, repeat: Infinity, ease: 'easeInOut', delay: 0.3 }} className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                )}
              </div>

              {/* Input Area */}
              <div className="absolute bottom-0 left-0 right-0 pt-12 pb-6 px-6 z-20 bg-gradient-to-t from-[#050810] via-[#050810]/95 to-transparent">
                <div className="max-w-4xl mx-auto">

                  {/* URL detection badge */}
                  <AnimatePresence>
                    {detectedUrls.length > 0 && (
                      <motion.div
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 6 }}
                        className="mb-2 flex flex-wrap gap-2"
                      >
                        {detectedUrls.map((url, i) => (
                          <div key={i} className="flex items-center gap-1.5 px-3 py-1 bg-blue-950/60 border border-blue-700/40 rounded-md text-xs text-blue-300 font-mono max-w-xs truncate">
                            <Link size={11} className="shrink-0" />
                            <span className="truncate">{url}</span>
                            <span className="ml-1 text-blue-500 text-[10px] shrink-0">will scrape →</span>
                          </div>
                        ))}
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* Search bar — rectangular */}
                  <div className="relative group">
                    <div className="absolute -inset-0.5 bg-gradient-to-r from-cyan-500/25 to-blue-600/25 rounded-lg blur-md transition-all duration-500 opacity-60 group-focus-within:opacity-100 group-focus-within:blur-lg"></div>
                    <div className="relative bg-[#0c111d] border border-white/10 rounded-lg shadow-2xl flex flex-col transition-all group-focus-within:border-cyan-500/50">
                      <textarea
                        ref={inputRef}
                        value={inputValue}
                        onChange={handleInputChange}
                        onKeyDown={handleKeyDown}
                        disabled={isLoading}
                        placeholder="Ask anything about your college notes..."
                        className="bg-transparent border-none focus:ring-0 text-slate-200 placeholder-slate-500 w-full min-h-[64px] max-h-52 resize-none text-lg focus:outline-none px-5 pt-4 pb-2"
                        rows={1}
                      />

                      <div className="flex items-center justify-between px-4 pb-3 pt-1 border-t border-white/5">
                        <div className="flex gap-4">
                          <button onClick={() => setCurrentView('upload')} className="px-1 py-1.5 text-slate-400 text-sm flex items-center gap-1.5 transition-colors cursor-pointer hover:text-white">
                            <Paperclip size={16} /> Upload
                          </button>
                          <button onClick={() => setCurrentView('trace')} className="px-1 py-1.5 text-slate-400 text-sm flex items-center gap-1.5 transition-colors cursor-pointer hover:text-white">
                            <Globe size={16} /> Web Access
                          </button>
                        </div>
                        <div className="flex items-center gap-3">
                          <motion.button
                            onClick={toggleListening}
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            className={`p-1.5 rounded-full flex items-center justify-center transition-all cursor-pointer ${
                              isListening 
                                ? 'bg-red-500/20 text-red-400 border border-red-500/50' 
                                : 'bg-white/5 text-slate-400 border border-transparent hover:bg-white/10 hover:text-slate-200'
                            }`}
                            title={isListening ? "Stop listening" : "Voice search"}
                          >
                            {isListening ? <Mic size={18} /> : <MicOff size={18} />}
                          </motion.button>
                          <motion.button
                            onClick={() => handleQuery(inputValue)}
                            disabled={isLoading || !inputValue.trim()}
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                            className="px-5 py-1.5 bg-white/10 hover:bg-white/15 rounded-full font-medium text-slate-300 text-sm transition-all flex items-center gap-2 cursor-pointer border border-white/5"
                          >
                            {isLoading
                              ? <><Loader2 size={15} className="animate-spin" /> Processing…</>
                              : detectedUrls.length > 0
                                ? <><Link size={15} /> Scrape & Query</>
                                : <><Send size={15} className="opacity-60" /> Query Data</>}
                          </motion.button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}

          {currentView === 'graph' && (
            <div className="flex-1 w-full h-full pt-16 relative z-10">
              <div className="absolute top-4 right-4 z-20 flex items-center gap-2 bg-[#050810]/50 backdrop-blur-md px-3 py-1.5 rounded-lg border border-white/5 text-cyan-400 text-sm font-medium tracking-widest uppercase">
                <Network size={14} /> Knowledge Graph
              </div>
              <GraphVisualization />
            </div>
          )}
          {currentView === 'citations' && (
            <div className="flex-1 w-full h-full pt-16 overflow-y-auto relative z-10 px-4 max-w-5xl mx-auto">
              <div className="flex items-center gap-2 mb-6 text-cyan-400 text-sm font-medium tracking-widest uppercase">
                <BookOpen size={14} /> Citations & Sources
              </div>
              <CitationPanel />
            </div>
          )}
          {currentView === 'trace' && (
            <div className="flex-1 w-full h-full pt-16 overflow-y-auto relative z-10 px-4 max-w-5xl mx-auto">
              <div className="flex items-center gap-2 mb-6 text-cyan-400 text-sm font-medium tracking-widest uppercase">
                <Activity size={14} /> Agent Trace
              </div>
              <ExplainabilityPanel />
            </div>
          )}
          {currentView === 'upload' && (
            <div className="flex-1 w-full h-full pt-16 overflow-y-auto p-4 relative z-10 max-w-5xl mx-auto">
              <div className="flex items-center gap-2 mb-6 text-cyan-400 text-sm font-medium tracking-widest uppercase">
                <Database size={14} /> Data Ingestion
              </div>
              <UploadZone />
            </div>
          )}
        </div>

      </div>
    </div>
  )
}

