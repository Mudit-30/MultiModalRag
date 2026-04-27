import { useState, useEffect } from 'react'
import ChatInterface from './components/ChatInterface'
import GraphVisualization from './components/GraphVisualization'
import CitationPanel from './components/CitationPanel'
import UploadZone from './components/UploadZone'
import ExplainabilityPanel from './components/ExplainabilityPanel'
import { Brain, Network, BookOpen, Upload, Activity, Wifi, WifiOff } from 'lucide-react'
import { checkHealth } from './lib/api'
import './index.css'

const TABS = [
  { id: 'graph', label: 'Graph', icon: Network },
  { id: 'citations', label: 'Citations', icon: BookOpen },
  { id: 'trace', label: 'Agent Trace', icon: Activity },
  { id: 'upload', label: 'Upload', icon: Upload },
]

export default function App() {
  const [rightTab, setRightTab] = useState('graph')
  const [backendStatus, setBackendStatus] = useState('checking')

  useEffect(() => {
    checkHealth()
      .then(() => setBackendStatus('online'))
      .catch(() => setBackendStatus('offline'))
  }, [])

  return (
    <div className="h-screen bg-gray-950 text-white flex flex-col overflow-hidden font-sans">
      {/* Top Bar */}
      <header className="flex items-center gap-3 px-6 py-3 border-b border-gray-800 flex-shrink-0">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-600 to-violet-700 flex items-center justify-center">
          <Brain className="w-4 h-4 text-white" />
        </div>
        <div>
          <h1 className="text-sm font-bold text-white leading-none">Multi-Modal Graph RAG</h1>
          <p className="text-xs text-gray-500 leading-none mt-0.5">Agentic · Hybrid Retrieval · Temporal KG</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <div className={`flex items-center gap-1.5 text-xs px-3 py-1 rounded-full border
            ${backendStatus === 'online' ? 'border-green-800 bg-green-950/50 text-green-400' : 
              backendStatus === 'offline' ? 'border-red-800 bg-red-950/50 text-red-400' :
              'border-gray-700 bg-gray-900 text-gray-500'}`}>
            {backendStatus === 'online' ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
            {backendStatus}
          </div>
        </div>
      </header>

      {/* Main Layout */}
      <div className="flex-1 flex gap-0 overflow-hidden">
        {/* Left: Chat — fixed width */}
        <div className="w-[52%] flex flex-col p-4 border-r border-gray-800">
          <ChatInterface />
        </div>

        {/* Right: Panels */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Tab bar */}
          <div className="flex border-b border-gray-800 px-2 pt-2 flex-shrink-0">
            {TABS.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setRightTab(id)}
                className={`flex items-center gap-1.5 text-xs px-3 py-2 rounded-t-lg mr-1 transition-colors
                  ${rightTab === id
                    ? 'bg-gray-900 text-indigo-400 border border-gray-700 border-b-gray-900'
                    : 'text-gray-600 hover:text-gray-400'
                  }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {label}
              </button>
            ))}
          </div>

          {/* Panel content */}
          <div className="flex-1 overflow-hidden p-4">
            {rightTab === 'graph' && <GraphVisualization />}
            {rightTab === 'citations' && <CitationPanel />}
            {rightTab === 'trace' && <ExplainabilityPanel />}
            {rightTab === 'upload' && <UploadZone />}
          </div>
        </div>
      </div>
    </div>
  )
}
