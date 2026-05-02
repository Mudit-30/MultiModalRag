import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from "framer-motion";
import { Menu, Plus, MessageSquare, Library, Settings, User, FileText, Loader2, Sparkles, Network, BookOpen, Activity, Database, Link, Send, Paperclip, Globe, Mic, MicOff, ChevronRight, Zap, Brain, X } from 'lucide-react'
import GraphVisualization from './components/GraphVisualization'
import CitationPanel from './components/CitationPanel'
import UploadZone from './components/UploadZone'
import ExplainabilityPanel from './components/ExplainabilityPanel'
import { checkHealth, queryAgentic, scrapeUrl } from './lib/api'
import useStore from './store/useStore'
import ReactMarkdown from 'react-markdown'
import './index.css'

// ── Helpers ───────────────────────────────────────────────────────────────────

function readableChunkId(citation) {
  if (!citation) return 'Document'
  if (citation.filename) return citation.filename
  if (citation.source) return citation.source
  if (citation.doc_id) return citation.doc_id
  const raw = citation.chunk_id || ''
  const parts = raw.split('_')
  const last = parseInt(parts[parts.length - 1], 10)
  if (!isNaN(last)) return `Chunk ${last + 1}`
  return raw.slice(-10) || 'Document'
}

const URL_RE = /https?:\/\/[^\s]+/g
function extractUrls(text) {
  return (text.match(URL_RE) || [])
}
function stripUrls(text) {
  return text.replace(URL_RE, '').trim()
}

function buildGraphData(query, citations, trace) {
  const nodes = []
  const links = []

  const queryLabel = query.length > 40 ? query.slice(0, 38) + '…' : query
  nodes.push({ id: 'Query', name: queryLabel, label: 'Query' })

  const subQueries = trace?.timeline
    ?.find(t => t.step === 'Decomposition' || t.step === 'Query Analysis')?.result || []
  subQueries.forEach((sq, i) => {
    const id = `sq_${i}`
    const label = typeof sq === 'string' ? (sq.length > 36 ? sq.slice(0, 34) + '…' : sq) : `Sub-query ${i + 1}`
    nodes.push({ id, name: label, label: 'SubQuery' })
    links.push({ source: 'Query', target: id })
  })

  const docMap = new Map()
  citations.forEach((c, i) => {
    const docName = c.filename || c.source || c.doc_id || `Document ${i + 1}`
    if (!docMap.has(docName)) {
      docMap.set(docName, { id: `doc_${docMap.size}`, name: docName, label: c.modality || 'text' })
      nodes.push(docMap.get(docName))
    }
    const targetId = docMap.get(docName).id
    const srcId = subQueries.length > 0 ? `sq_${i % subQueries.length}` : 'Query'
    if (!links.find(l => l.source === srcId && l.target === targetId)) {
      links.push({ source: srcId, target: targetId })
    }
  })

  return { nodes, links }
}

// Animated gradient orb component
const GradientOrb = ({ className, delay = 0 }) => (
  <motion.div
    className={`absolute rounded-full blur-3xl opacity-20 ${className}`}
    animate={{
      scale: [1, 1.2, 1],
      opacity: [0.15, 0.25, 0.15],
    }}
    transition={{
      duration: 8,
      repeat: Infinity,
      delay,
      ease: "easeInOut"
    }}
  />
)

// Typing indicator with smoother animation
const TypingIndicator = () => (
  <div className="flex items-center gap-1.5 px-4 py-2.5 bg-gradient-to-r from-white/[0.03] to-white/[0.06] border border-white/[0.08] rounded-2xl backdrop-blur-sm">
    {[0, 1, 2].map((i) => (
      <motion.div
        key={i}
        className="w-2 h-2 rounded-full bg-gradient-to-r from-cyan-400 to-blue-400"
        animate={{
          y: [0, -6, 0],
          opacity: [0.5, 1, 0.5],
        }}
        transition={{
          duration: 0.8,
          repeat: Infinity,
          delay: i * 0.15,
          ease: "easeInOut"
        }}
      />
    ))}
  </div>
)

// Status badge component
const StatusBadge = ({ status }) => {
  const config = {
    online: { color: 'bg-emerald-500', ring: 'ring-emerald-500/30', text: 'Online' },
    offline: { color: 'bg-red-500', ring: 'ring-red-500/30', text: 'Offline' },
    checking: { color: 'bg-amber-500', ring: 'ring-amber-500/30', text: 'Connecting' },
  }
  const { color, ring, text } = config[status] || config.checking

  return (
    <div className={`flex items-center gap-2 px-2.5 py-1 rounded-full bg-white/[0.03] border border-white/[0.06]`}>
      <div className={`w-2 h-2 rounded-full ${color} ${ring} ring-4 animate-pulse`} />
      <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">{text}</span>
    </div>
  )
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

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  const [detectedUrls, setDetectedUrls] = useState([])
  const [isListening, setIsListening] = useState(false)
  const recognitionRef = useRef(null)

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

        recognitionRef.current.onerror = () => setIsListening(false)
        recognitionRef.current.onend = () => setIsListening(false)
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

  const handleInputChange = (e) => {
    const val = e.target.value
    setInputValue(val)
    setDetectedUrls(extractUrls(val))
  }

  const handleQuery = async (queryText) => {
    const q = queryText.trim()
    if (!q || isLoading) return

    const urls = extractUrls(q)
    const pureQ = urls.length ? stripUrls(q) || q : q
    const hasUrls = urls.length > 0

    addMessage({ role: 'user', content: q, id: Date.now().toString(), hasUrls, urls })
    setInputValue('')
    setDetectedUrls([])
    setLoading(true)

    try {
      let result

      if (hasUrls) {
        addMessage({ role: 'assistant', content: `🌐 Scraping ${urls.length} URL${urls.length > 1 ? 's' : ''}…`, id: (Date.now() + 0.5).toString(), isStatus: true })
        await Promise.all(urls.map(u => scrapeUrl(u).catch(() => null)))
        result = await queryAgentic(pureQ || q)
      } else {
        result = await queryAgentic(q)
      }

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

  const navItems = [
    { id: 'chat', icon: MessageSquare, label: 'Chat' },
    { id: 'graph', icon: Network, label: 'Knowledge Graph' },
    { id: 'citations', icon: BookOpen, label: 'Citations' },
    { id: 'trace', icon: Activity, label: 'Agent Trace' },
    { id: 'upload', icon: Database, label: 'Ingest Data' },
  ]

  return (
    <div className="flex h-screen bg-[#030712] text-slate-200 overflow-hidden font-sans selection:bg-cyan-500/30 selection:text-cyan-100">
      
      {/* Ambient background effects */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <GradientOrb className="w-[800px] h-[800px] -top-40 -left-40 bg-cyan-600" delay={0} />
        <GradientOrb className="w-[600px] h-[600px] top-1/2 -right-20 bg-blue-600" delay={2} />
        <GradientOrb className="w-[500px] h-[500px] -bottom-20 left-1/3 bg-violet-600" delay={4} />
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxwYXRoIGQ9Ik0wIDBoNjB2NjBIMHoiLz48cGF0aCBkPSJNMzAgMzBoMXYxaC0xeiIgZmlsbD0icmdiYSgyNTUsMjU1LDI1NSwwLjAzKSIvPjwvZz48L3N2Zz4=')] opacity-50" />
      </div>

      {/* Sidebar */}
      <AnimatePresence initial={false}>
        {isSidebarOpen && (
          <motion.div
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 280, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ type: 'spring', bounce: 0.1, duration: 0.5 }}
            className="h-full bg-[#0a0f1a]/80 backdrop-blur-2xl border-r border-white/[0.06] flex flex-col shrink-0 z-30 overflow-hidden shadow-2xl shadow-black/50"
          >
            <div className="p-5 w-[280px] flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
              
              {/* Logo */}
              <div className="flex items-center gap-3 mb-8 cursor-pointer group" onClick={() => setCurrentView('chat')}>
                <motion.div 
                  whileHover={{ scale: 1.05, rotate: 5 }}
                  className="w-11 h-11 rounded-2xl bg-gradient-to-br from-cyan-500 via-blue-500 to-violet-500 flex items-center justify-center shadow-lg shadow-cyan-500/20"
                >
                  <Brain size={22} className="text-white" />
                </motion.div>
                <div className="flex-1">
                  <span className="font-semibold text-white text-lg tracking-tight">Zero Memory</span>
                  <div className="flex items-center gap-2 mt-0.5">
                    <StatusBadge status={backendStatus} />
                  </div>
                </div>
                <motion.button 
                  whileHover={{ scale: 1.1, rotate: 90 }}
                  whileTap={{ scale: 0.9 }}
                  onClick={(e) => { 
                    e.stopPropagation(); 
                    useStore.setState({ messages: [], citations: null, trace: null, graphData: {nodes:[], links:[]} }); 
                    setCurrentView('chat'); 
                  }} 
                  className="p-2 bg-white/[0.05] hover:bg-cyan-500/20 rounded-xl text-slate-400 hover:text-cyan-400 transition-all"
                >
                  <Plus size={16} />
                </motion.button>
              </div>

              {/* Navigation */}
              <div className="space-y-6">
                <div>
                  <h3 className="text-[10px] uppercase tracking-[0.2em] text-slate-500 font-semibold mb-2 px-3 flex items-center gap-2">
                    <Zap size={10} /> Workspace
                  </h3>
                  <div className="space-y-1">
                    {navItems.map(({ id, icon: Icon, label }) => (
                      <motion.button
                        key={id}
                        onClick={() => setCurrentView(id)}
                        whileHover={{ x: 4 }}
                        whileTap={{ scale: 0.98 }}
                        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all text-sm group relative overflow-hidden ${
                          currentView === id 
                            ? 'bg-gradient-to-r from-cyan-500/15 to-blue-500/10 text-cyan-400 border border-cyan-500/20' 
                            : 'text-slate-400 hover:text-white hover:bg-white/[0.04]'
                        }`}
                      >
                        {currentView === id && (
                          <motion.div 
                            layoutId="activeNav"
                            className="absolute left-0 top-0 bottom-0 w-[3px] bg-gradient-to-b from-cyan-400 to-blue-500 rounded-r-full"
                          />
                        )}
                        <Icon size={16} className={currentView === id ? 'text-cyan-400' : 'text-slate-500 group-hover:text-cyan-400 transition-colors'} />
                        <span className="flex-1 text-left">{label}</span>
                        <ChevronRight size={14} className={`transition-all ${currentView === id ? 'opacity-100 text-cyan-400' : 'opacity-0 group-hover:opacity-50'}`} />
                      </motion.button>
                    ))}
                  </div>
                </div>

                {/* Recent Sessions */}
                {recentSessions.length > 0 && (
                  <div>
                    <h3 className="text-[10px] uppercase tracking-[0.2em] text-slate-500 font-semibold mb-2 px-3 flex items-center gap-2">
                      <MessageSquare size={10} /> Recent
                    </h3>
                    <div className="space-y-0.5">
                      {recentSessions.map((session, i) => (
                        <motion.button 
                          key={i} 
                          whileHover={{ x: 4 }}
                          onClick={() => setCurrentView('chat')} 
                          className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-slate-500 hover:text-slate-300 hover:bg-white/[0.02] transition-all group"
                        >
                          <div className="w-1.5 h-1.5 rounded-full bg-slate-700 group-hover:bg-cyan-500 transition-colors" />
                          <span className="truncate text-left flex-1">{session}</span>
                        </motion.button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Documents */}
                {uniqueDocs.length > 0 && (
                  <div>
                    <h3 className="text-[10px] uppercase tracking-[0.2em] text-slate-500 font-semibold mb-2 px-3 flex items-center gap-2">
                      <Library size={10} /> Documents
                    </h3>
                    <div className="space-y-0.5">
                      {uniqueDocs.slice(0, 5).map((doc, i) => (
                        <motion.button 
                          key={i}
                          whileHover={{ x: 4 }}
                          className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-slate-500 hover:text-slate-300 hover:bg-white/[0.02] transition-all group"
                        >
                          <FileText size={14} className="text-slate-600 group-hover:text-blue-400 transition-colors shrink-0" />
                          <span className="truncate text-left flex-1">{doc}</span>
                        </motion.button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Profile Section */}
            <div className="p-4 border-t border-white/[0.06] w-[280px] bg-gradient-to-t from-black/20 to-transparent">
              <motion.div 
                whileHover={{ scale: 1.01 }}
                onClick={() => setProfileOpen(!isProfileOpen)}
                className="flex items-center gap-3 cursor-pointer p-2.5 rounded-xl hover:bg-white/[0.04] transition-all"
              >
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-slate-700 to-slate-800 border border-white/10 flex items-center justify-center overflow-hidden">
                  <User size={18} className="text-slate-400" />
                </div>
                <div className="flex-1 overflow-hidden">
                  <p className="text-sm font-medium text-slate-200 truncate">Alex Rivera</p>
                  <p className="text-[11px] text-slate-500 truncate">Research Workspace</p>
                </div>
                <Settings size={14} className="text-slate-500 hover:text-slate-300 transition-colors" />
              </motion.div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Content */}
      <div className="flex-1 flex flex-col h-full relative overflow-hidden">
        
        {/* Floating Header */}
        <header className="absolute top-0 left-0 right-0 z-20 p-4 flex items-center justify-between pointer-events-none">
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => setSidebarOpen(!isSidebarOpen)}
            className="p-2.5 bg-[#0a0f1a]/80 backdrop-blur-xl rounded-xl border border-white/[0.06] text-slate-400 hover:text-white transition-all pointer-events-auto shadow-lg"
          >
            <Menu size={18} className={`transition-transform duration-300 ${isSidebarOpen ? 'rotate-90' : ''}`} />
          </motion.button>

          {currentView !== 'chat' && (
            <motion.div 
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-center gap-2 px-4 py-2 bg-[#0a0f1a]/80 backdrop-blur-xl rounded-xl border border-white/[0.06] pointer-events-auto"
            >
              {navItems.find(n => n.id === currentView)?.icon && (
                <>
                  {(() => {
                    const Icon = navItems.find(n => n.id === currentView)?.icon
                    return <Icon size={14} className="text-cyan-400" />
                  })()}
                </>
              )}
              <span className="text-sm font-medium text-slate-300">
                {navItems.find(n => n.id === currentView)?.label}
              </span>
            </motion.div>
          )}
        </header>

        <div className="flex-1 flex flex-col h-full relative">
          
          {currentView === 'chat' && (
            <>
              {/* Chat Messages */}
              <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 flex flex-col items-center scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
                {messages.length === 0 ? (
                  <div className="flex-1 flex flex-col items-center justify-center w-full pb-32 mt-12">
                    <motion.div
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.6 }}
                      className="text-center mb-12"
                    >
                      <motion.div
                        animate={{ 
                          backgroundPosition: ['0% 50%', '100% 50%', '0% 50%'],
                        }}
                        transition={{ duration: 5, repeat: Infinity, ease: 'linear' }}
                        className="inline-block"
                        style={{
                          backgroundSize: '200% 200%',
                          backgroundImage: 'linear-gradient(90deg, #06b6d4, #3b82f6, #8b5cf6, #06b6d4)',
                          WebkitBackgroundClip: 'text',
                          WebkitTextFillColor: 'transparent',
                          backgroundClip: 'text',
                        }}
                      >
                        <h1 className="text-6xl md:text-7xl font-bold tracking-tight mb-4">
                          Zero Memory
                        </h1>
                      </motion.div>
                      <p className="text-slate-500 text-sm font-medium tracking-[0.3em] uppercase">
                        Agentic • Hybrid Retrieval • Knowledge Graph
                      </p>
                    </motion.div>

                    {/* Feature Pills */}
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.2 }}
                      className="flex flex-wrap justify-center gap-3 mb-10"
                    >
                      {[
                        { icon: Brain, label: 'Multi-hop Reasoning' },
                        { icon: Network, label: 'Graph-Enhanced' },
                        { icon: Zap, label: 'Real-time Analysis' },
                      ].map(({ icon: Icon, label }, i) => (
                        <div key={i} className="flex items-center gap-2 px-4 py-2 bg-white/[0.03] border border-white/[0.06] rounded-full text-xs text-slate-400">
                          <Icon size={12} className="text-cyan-500" />
                          {label}
                        </div>
                      ))}
                    </motion.div>

                    {/* Suggestions */}
                    <motion.div
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.3 }}
                      className="grid grid-cols-1 md:grid-cols-3 gap-3 w-full max-w-3xl px-4"
                    >
                      {[
                        { q: "What are the primary symptoms of the patient?", icon: "🔬" },
                        { q: "Trace the diagnostic journey to final treatment", icon: "🧭" },
                        { q: "What connects X-ray findings to treatment?", icon: "🔗" },
                      ].map(({ q, icon }, idx) => (
                        <motion.button
                          key={idx}
                          onClick={() => handleQuery(q)}
                          disabled={isLoading}
                          whileHover={{ scale: 1.02, y: -2 }}
                          whileTap={{ scale: 0.98 }}
                          className="p-4 rounded-2xl border border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.05] hover:border-cyan-500/30 transition-all text-left group"
                        >
                          <span className="text-2xl mb-2 block">{icon}</span>
                          <p className="text-sm text-slate-400 group-hover:text-slate-200 transition-colors leading-relaxed">
                            {q}
                          </p>
                        </motion.button>
                      ))}
                    </motion.div>
                  </div>
                ) : (
                  <div className="w-full max-w-3xl pt-20 pb-40 flex flex-col gap-6">
                    <AnimatePresence initial={false}>
                      {messages.map((msg) => (
                        <motion.div
                          key={msg.id}
                          initial={{ opacity: 0, y: 15 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ type: "spring", stiffness: 400, damping: 30 }}
                          className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                        >
                          {msg.role === 'assistant' && (
                            <div className="h-9 w-9 shrink-0 rounded-xl bg-gradient-to-br from-cyan-500/20 to-blue-500/20 border border-cyan-500/30 flex items-center justify-center mt-1">
                              <Sparkles size={16} className="text-cyan-400" />
                            </div>
                          )}
                          <div className={`max-w-[80%] ${
                            msg.role === 'user'
                              ? 'bg-gradient-to-br from-cyan-500/10 to-blue-500/10 border border-cyan-500/20 text-slate-100 px-5 py-3.5 rounded-2xl rounded-tr-md'
                              : 'text-slate-300'
                          }`}>
                            {msg.role === 'assistant' ? (
                              <div className="prose prose-invert prose-slate max-w-none leading-relaxed prose-p:text-slate-300 prose-headings:text-white prose-strong:text-white prose-code:text-cyan-400 prose-code:bg-white/5 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded">
                                <ReactMarkdown>{msg.content}</ReactMarkdown>
                              </div>
                            ) : (
                              <p className="leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                            )}

                            {msg.sources && msg.sources.length > 0 && (
                              <motion.div
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: 'auto' }}
                                transition={{ delay: 0.2 }}
                                className="mt-4 pt-3 border-t border-white/[0.06]"
                              >
                                <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest flex items-center gap-1.5 mb-2">
                                  <Library size={10} /> Sources
                                </span>
                                <div className="flex flex-wrap gap-2">
                                  {msg.sources.map((src, i) => (
                                    <motion.button
                                      key={i}
                                      whileHover={{ scale: 1.05 }}
                                      onClick={() => setCurrentView('citations')}
                                      className="flex items-center gap-1.5 px-2.5 py-1.5 bg-white/[0.04] border border-white/[0.08] rounded-lg text-[11px] text-cyan-400 hover:border-cyan-500/40 hover:bg-cyan-500/10 transition-all font-medium"
                                    >
                                      <FileText size={10} />
                                      {src}
                                    </motion.button>
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
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0 }}
                          className="flex gap-3 justify-start"
                        >
                          <div className="h-9 w-9 shrink-0 rounded-xl bg-gradient-to-br from-cyan-500/20 to-blue-500/20 border border-cyan-500/30 flex items-center justify-center">
                            <Sparkles size={16} className="text-cyan-400 animate-pulse" />
                          </div>
                          <TypingIndicator />
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                )}
              </div>

              {/* Input Area */}
              <div className="absolute bottom-0 left-0 right-0 z-20">
                <div className="bg-gradient-to-t from-[#030712] via-[#030712]/95 to-transparent pt-16 pb-6 px-4">
                  <div className="max-w-3xl mx-auto">
                    
                    {/* URL Detection */}
                    <AnimatePresence>
                      {detectedUrls.length > 0 && (
                        <motion.div
                          initial={{ opacity: 0, y: 6, height: 0 }}
                          animate={{ opacity: 1, y: 0, height: 'auto' }}
                          exit={{ opacity: 0, y: 6, height: 0 }}
                          className="mb-3 flex flex-wrap gap-2"
                        >
                          {detectedUrls.map((url, i) => (
                            <div key={i} className="flex items-center gap-2 px-3 py-1.5 bg-blue-500/10 border border-blue-500/30 rounded-lg text-xs text-blue-300 font-mono max-w-xs truncate">
                              <Link size={12} className="text-blue-400 shrink-0" />
                              <span className="truncate">{url}</span>
                              <span className="text-blue-500 text-[10px] shrink-0 ml-1">→ scrape</span>
                            </div>
                          ))}
                        </motion.div>
                      )}
                    </AnimatePresence>

                    {/* Input Box */}
                    <div className="relative group">
                      <div className="absolute -inset-1 bg-gradient-to-r from-cyan-500/20 via-blue-500/20 to-violet-500/20 rounded-2xl blur-xl transition-all duration-500 opacity-0 group-focus-within:opacity-100" />
                      <div className="relative bg-[#0a0f1a]/90 backdrop-blur-xl border border-white/[0.08] rounded-2xl shadow-2xl shadow-black/50 transition-all group-focus-within:border-cyan-500/30">
                        <textarea
                          ref={inputRef}
                          value={inputValue}
                          onChange={handleInputChange}
                          onKeyDown={handleKeyDown}
                          disabled={isLoading}
                          placeholder="Ask anything about your documents..."
                          className="bg-transparent border-none focus:ring-0 text-slate-200 placeholder-slate-500 w-full min-h-[56px] max-h-40 resize-none text-base focus:outline-none px-5 pt-4 pb-2"
                          rows={1}
                        />

                        <div className="flex items-center justify-between px-4 pb-3 pt-1">
                          <div className="flex gap-1">
                            <motion.button
                              whileHover={{ scale: 1.05 }}
                              whileTap={{ scale: 0.95 }}
                              onClick={() => setCurrentView('upload')}
                              className="p-2 text-slate-500 hover:text-white hover:bg-white/[0.05] rounded-lg transition-all flex items-center gap-1.5 text-xs"
                            >
                              <Paperclip size={14} />
                              <span className="hidden sm:inline">Upload</span>
                            </motion.button>
                            <motion.button
                              whileHover={{ scale: 1.05 }}
                              whileTap={{ scale: 0.95 }}
                              className="p-2 text-slate-500 hover:text-white hover:bg-white/[0.05] rounded-lg transition-all flex items-center gap-1.5 text-xs"
                            >
                              <Globe size={14} />
                              <span className="hidden sm:inline">Web</span>
                            </motion.button>
                          </div>

                          <div className="flex items-center gap-2">
                            <motion.button
                              whileHover={{ scale: 1.1 }}
                              whileTap={{ scale: 0.9 }}
                              onClick={toggleListening}
                              className={`p-2 rounded-xl transition-all ${
                                isListening
                                  ? 'bg-red-500/20 text-red-400 border border-red-500/40'
                                  : 'text-slate-500 hover:text-white hover:bg-white/[0.05]'
                              }`}
                            >
                              {isListening ? <Mic size={16} /> : <MicOff size={16} />}
                            </motion.button>

                            <motion.button
                              whileHover={{ scale: 1.02 }}
                              whileTap={{ scale: 0.98 }}
                              onClick={() => handleQuery(inputValue)}
                              disabled={isLoading || !inputValue.trim()}
                              className="px-4 py-2 bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-400 hover:to-blue-400 disabled:from-slate-700 disabled:to-slate-700 rounded-xl font-medium text-white text-sm transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-cyan-500/20"
                            >
                              {isLoading ? (
                                <>
                                  <Loader2 size={14} className="animate-spin" />
                                  <span className="hidden sm:inline">Processing</span>
                                </>
                              ) : detectedUrls.length > 0 ? (
                                <>
                                  <Link size={14} />
                                  <span className="hidden sm:inline">Scrape & Query</span>
                                </>
                              ) : (
                                <>
                                  <Send size={14} />
                                  <span className="hidden sm:inline">Send</span>
                                </>
                              )}
                            </motion.button>
                          </div>
                        </div>
                      </div>
                    </div>

                    <p className="text-center text-[10px] text-slate-600 mt-3">
                      Press Enter to send • Shift+Enter for new line
                    </p>
                  </div>
                </div>
              </div>
            </>
          )}

          {currentView === 'graph' && (
            <div className="flex-1 w-full h-full pt-16 relative">
              <GraphVisualization />
            </div>
          )}

          {currentView === 'citations' && (
            <div className="flex-1 w-full h-full pt-20 overflow-y-auto px-4 max-w-4xl mx-auto scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
              <CitationPanel />
            </div>
          )}

          {currentView === 'trace' && (
            <div className="flex-1 w-full h-full pt-20 overflow-y-auto px-4 max-w-4xl mx-auto scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
              <ExplainabilityPanel />
            </div>
          )}

          {currentView === 'upload' && (
            <div className="flex-1 w-full h-full pt-20 overflow-y-auto p-4 max-w-4xl mx-auto scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
              <UploadZone />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
