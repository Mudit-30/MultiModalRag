import { useState, useRef, useEffect } from 'react'
import { Send, Bot, User, Loader2, Sparkles } from 'lucide-react'
import useStore from '../store/useStore'
import { queryAgentic } from '../lib/api'
import ReactMarkdown from 'react-markdown'

export default function ChatInterface() {
  const [input, setInput] = useState('')
  const bottomRef = useRef(null)
  const { messages, addMessage, isLoading, setLoading, setTrace, setCitations, setGraphData } = useStore()

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!input.trim() || isLoading) return

    const userMsg = { role: 'user', content: input, id: Date.now() }
    addMessage(userMsg)
    setInput('')
    setLoading(true)

    try {
      const result = await queryAgentic(input)
      addMessage({ role: 'assistant', content: result.answer, id: Date.now() + 1 })
      setTrace(result.trace)
      if (result.citations) setCitations(result.citations)

      // Build graph data from trace if subgraph is available
      if (result.trace?.subgraph) {
        const nodes = result.trace.subgraph.nodes?.map(n => ({ id: n.id, label: n.type, name: n.id })) || []
        const links = result.trace.subgraph.rels?.map(r => ({ source: r.source, target: r.target, label: r.type })) || []
        setGraphData({ nodes, links })
      }
    } catch (err) {
      addMessage({ role: 'assistant', content: `⚠️ Error: ${err.message}`, id: Date.now() + 1, isError: true })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col h-full bg-gray-950 rounded-xl border border-gray-800">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-800">
        <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center">
          <Sparkles className="w-4 h-4 text-white" />
        </div>
        <div>
          <p className="text-sm font-semibold text-white">Graph RAG Agent</p>
          <p className="text-xs text-gray-500">Multi-Modal · Agentic · Hybrid Retrieval</p>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center gap-3 text-gray-600">
            <Bot className="w-12 h-12 opacity-30" />
            <p className="text-sm">Upload documents, then ask a question.<br />Try a multi-hop query for best results.</p>
          </div>
        )}
        {messages.map((msg) => (
          <div key={msg.id} className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
            <div className={`w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-bold
              ${msg.role === 'user' ? 'bg-indigo-600 text-white' : 'bg-gray-800 text-gray-300'}`}>
              {msg.role === 'user' ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
            </div>
            <div className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed
              ${msg.role === 'user'
                ? 'bg-indigo-600 text-white rounded-tr-sm'
                : msg.isError
                  ? 'bg-red-950 border border-red-800 text-red-300 rounded-tl-sm'
                  : 'bg-gray-900 border border-gray-800 text-gray-200 rounded-tl-sm'
              }`}>
              <ReactMarkdown>{msg.content}</ReactMarkdown>
            </div>
          </div>
        ))}
        {isLoading && (
          <div className="flex gap-3">
            <div className="w-7 h-7 rounded-full bg-gray-800 flex items-center justify-center">
              <Bot className="w-4 h-4 text-gray-400" />
            </div>
            <div className="bg-gray-900 border border-gray-800 rounded-2xl rounded-tl-sm px-4 py-3 flex items-center gap-2">
              <Loader2 className="w-4 h-4 text-indigo-400 animate-spin" />
              <span className="text-sm text-gray-500">Agents working…</span>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <form onSubmit={handleSubmit} className="p-4 border-t border-gray-800">
        <div className="flex gap-2">
          <input
            className="flex-1 bg-gray-900 border border-gray-700 rounded-xl px-4 py-2.5 text-sm text-white placeholder-gray-600
              focus:outline-none focus:border-indigo-500 transition-colors"
            placeholder="Ask a multi-hop question…"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={isLoading}
          />
          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed
              text-white rounded-xl px-4 py-2.5 transition-colors flex items-center gap-2 text-sm font-medium"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </form>
    </div>
  )
}
