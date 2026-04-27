import { BookOpen, FileText, Image, Music } from 'lucide-react'
import useStore from '../store/useStore'

const MODALITY_ICONS = { text: FileText, image: Image, audio: Music }
const MODALITY_COLORS = { text: 'text-blue-400 bg-blue-950', image: 'text-purple-400 bg-purple-950', audio: 'text-green-400 bg-green-950' }

export default function CitationPanel() {
  const { citations } = useStore()

  if (citations.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-gray-700 gap-2">
        <BookOpen className="w-10 h-10 opacity-20" />
        <p className="text-sm">Citations will appear here after a query</p>
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto space-y-3 pr-1">
      {citations.map((cite, i) => {
        const modality = cite.modality || 'text'
        const Icon = MODALITY_ICONS[modality] || FileText
        const colorClass = MODALITY_COLORS[modality] || MODALITY_COLORS.text

        return (
          <div key={i} className="bg-gray-900 border border-gray-800 rounded-xl p-3 space-y-2">
            <div className="flex items-center gap-2">
              <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${colorClass}`}>
                <Icon className="w-3.5 h-3.5" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-gray-300 truncate">{cite.source_id}</p>
                <p className="text-xs text-gray-600 capitalize">{modality} · chunk {cite.chunk_id?.split('_').pop()}</p>
              </div>
              {cite.rerank_score && (
                <span className="text-xs px-2 py-0.5 bg-indigo-950 text-indigo-400 rounded-full font-mono">
                  {(cite.rerank_score * 100).toFixed(0)}%
                </span>
              )}
            </div>

            {/* Content preview */}
            <p className="text-xs text-gray-500 leading-relaxed line-clamp-3">
              {cite.text || cite.caption || cite.transcript}
            </p>

            {/* Audio player for audio modality */}
            {modality === 'audio' && cite.audio_url && (
              <audio controls className="w-full h-8 mt-1" src={cite.audio_url}>
                Your browser does not support the audio element.
              </audio>
            )}

            {/* Image thumbnail for image modality */}
            {modality === 'image' && cite.image_url && (
              <img src={cite.image_url} alt={cite.caption} className="w-full h-28 object-cover rounded-lg mt-1" />
            )}
          </div>
        )
      })}
    </div>
  )
}
