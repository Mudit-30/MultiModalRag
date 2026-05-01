import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FileText, Image, Mic, Hash, AlertCircle, Library } from 'lucide-react';
import useStore from '../store/useStore';

const displayFont = { fontFamily: '"Gravitas One", serif' };

// Convert a raw chunk_id like "a2d19624_0" or filename into a readable label
function readableSource(citation) {
  // Prefer explicit filename / source fields the backend may provide
  if (citation.filename) return citation.filename;
  if (citation.source) return citation.source;
  if (citation.doc_id) return citation.doc_id;

  // Fallback: chunk_id is UUID_chunkIndex — strip the UUID part
  const raw = citation.chunk_id || '';
  const parts = raw.split('_');
  // If last segment is a number it's the chunk index → show "…_chunk N"
  const chunkIndex = parseInt(parts[parts.length - 1], 10);
  if (!isNaN(chunkIndex)) {
    return `Chunk ${chunkIndex + 1}`;
  }
  return raw.substring(0, 24) || 'Document';
}

function modalityIcon(modality) {
  switch (modality) {
    case 'image': return <Image size={13} className="text-amber-400" />;
    case 'audio': return <Mic size={13} className="text-cyan-400" />;
    default:      return <FileText size={13} className="text-violet-400" />;
  }
}

function modalityTag(modality) {
  const map = {
    image: 'bg-amber-950/40 text-amber-400 border-amber-900/40',
    audio: 'bg-cyan-950/40 text-cyan-400 border-cyan-900/40',
    text:  'bg-violet-950/40 text-violet-400 border-violet-900/40',
  };
  return map[modality] || map.text;
}

function scoreBar(score) {
  const pct = Math.min(100, Math.round((score || 0) * 100));
  const color = pct > 70 ? 'bg-cyan-400' : pct > 40 ? 'bg-violet-400' : 'bg-slate-600';
  return (
    <div className="flex items-center gap-2 mt-3">
      <div className="flex-1 h-1 bg-white/5 rounded-full overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
          className={`h-full rounded-full ${color}`}
        />
      </div>
      <span className="text-[10px] font-mono text-slate-500">{pct}%</span>
    </div>
  );
}

export default function CitationPanel() {
  const { citations } = useStore();

  const hasCitations = citations && citations.length > 0;

  return (
    <div className="flex-1 flex flex-col h-full">
      <div className="p-6 border-b border-white/5 shrink-0">
        <h2 className="text-3xl text-white tracking-tight" style={displayFont}>Citations Database</h2>
        <p className="text-slate-500 mt-1 text-sm">
          {hasCitations
            ? `${citations.length} verified segments extracted from your query context.`
            : 'Source segments will appear here after your first query.'}
        </p>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {!hasCitations && (
          <div className="flex flex-col items-center justify-center h-full text-center py-20 gap-3">
            <Library size={40} className="text-slate-700" />
            <p className="text-slate-600 text-sm">Ask a question to retrieve citations</p>
          </div>
        )}

        <AnimatePresence>
          {hasCitations && citations.map((item, i) => {
            const label = readableSource(item);
            const score = item.rerank_score ?? item.score ?? 0;
            const text  = item.text || item.content || '';
            const modality = item.modality || 'text';
            const type = modality.toUpperCase().slice(0, 4);

            return (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ delay: i * 0.06 }}
                className="bg-[#0c111d] border border-white/5 rounded-2xl p-5 hover:border-cyan-900/50 hover:bg-white/[0.02] transition-colors cursor-pointer group"
              >
                {/* Header */}
                <div className="flex items-center gap-3 mb-3">
                  <div className={`w-7 h-7 rounded-lg flex items-center justify-center border ${modalityTag(modality)}`}>
                    {modalityIcon(modality)}
                  </div>
                  <span className="text-sm font-medium text-slate-200 truncate flex-1">{label}</span>
                  <span className="text-[10px] font-mono text-slate-600 shrink-0">[{type}]</span>
                </div>

                {/* Excerpt */}
                {text && (
                  <div className="pl-4 border-l-2 border-slate-800 group-hover:border-cyan-900/60 transition-colors">
                    <p className="text-slate-400 text-sm italic leading-relaxed line-clamp-4">
                      "{text.substring(0, 300)}{text.length > 300 ? '…' : ''}"
                    </p>
                  </div>
                )}

                {/* Score bar */}
                {score > 0 && scoreBar(score)}

                {/* Tags */}
                <div className="mt-4 flex gap-2 flex-wrap">
                  <span className={`px-2.5 py-1 rounded text-[10px] uppercase tracking-widest border ${modalityTag(modality)}`}>
                    {modality}
                  </span>
                  {item.chunk_id && (
                    <span className="px-2.5 py-1 rounded bg-[#050810] border border-white/5 text-[10px] text-slate-600 font-mono">
                      #{item.chunk_id.slice(-6)}
                    </span>
                  )}
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
}
