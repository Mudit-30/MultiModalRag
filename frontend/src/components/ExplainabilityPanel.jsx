import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Activity, Clock, CheckCircle2, Loader2, AlertTriangle, Terminal } from 'lucide-react';
import useStore from '../store/useStore';

const displayFont = { fontFamily: '"Gravitas One", serif' };

const STEP_ICONS = {
  complete: <CheckCircle2 size={14} className="text-green-400" />,
  active:   <Loader2 size={14} className="text-cyan-400 animate-spin" />,
  pending:  <Clock size={14} className="text-slate-600" />,
  error:    <AlertTriangle size={14} className="text-red-400" />,
};

function stepStatus(step) {
  if (step.error) return 'error';
  if (step.status) return step.status;
  if (step.duration_ms !== undefined || step.result) return 'complete';
  return 'pending';
}

function resultPreview(result) {
  if (!result) return null;
  if (Array.isArray(result)) {
    if (result.length === 0) return null;
    return result.slice(0, 3).map((r, i) => (
      <span key={i} className="px-2 py-0.5 text-[10px] rounded bg-white/5 border border-white/5 text-slate-400 font-mono">
        {typeof r === 'string' ? r.slice(0, 40) : JSON.stringify(r).slice(0, 40)}
      </span>
    ));
  }
  if (typeof result === 'string') {
    return <span className="text-[11px] text-slate-400 font-mono">{result.slice(0, 80)}</span>;
  }
  return null;
}

// Fallback demo steps shown when no trace exists yet
const DEMO_STEPS = [
  { step: 'Awaiting Query', description: 'Ask a question to start the agent pipeline.', status: 'pending' },
  { step: 'Query Analysis', description: 'Decompose multi-part questions into sub-queries.', status: 'pending' },
  { step: 'Vector Retrieval', description: 'Scan vector store with top_k ranked results.', status: 'pending' },
  { step: 'Re-ranking', description: 'Apply cross-encoder to filter irrelevant chunks.', status: 'pending' },
  { step: 'Synthesis', description: 'Generate final response via LLM.', status: 'pending' },
];

export default function ExplainabilityPanel() {
  const { trace } = useStore();

  const hasTrace = trace && trace.timeline && trace.timeline.length > 0;
  const steps = hasTrace ? trace.timeline : DEMO_STEPS;

  // Build terminal log from trace
  const terminalLines = hasTrace
    ? [
        `> query: "${trace.query || '(see above)'}"`,
        `> pipeline: ${trace.pipeline || 'hybrid_rag'}`,
        ...steps.map(s => `> [${(s.duration_ms || '—') + 'ms'}] ${s.step} — ${stepStatus(s)}`),
        trace.total_time_ms ? `> total: ${trace.total_time_ms}ms` : null,
        `> status: ok`,
      ].filter(Boolean)
    : [
        '> waiting for first query...',
        '> agent trace will appear here',
        '> in real-time as each step completes',
      ];

  return (
    <div className="flex-1 flex flex-col h-full">
      {/* Header */}
      <div className="p-6 border-b border-white/5 shrink-0">
        <h2 className="text-3xl text-white tracking-tight" style={displayFont}>Execution Trace</h2>
        <p className="text-slate-500 mt-1 text-sm">
          {hasTrace
            ? `${steps.length} pipeline steps · ${trace.total_time_ms ? trace.total_time_ms + 'ms total' : 'completed'}`
            : 'Real-time telemetry of the intelligence engine.'}
        </p>
      </div>

      {/* Timeline */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="relative border-l border-white/10 ml-3 space-y-8 pb-8">
          <AnimatePresence>
            {steps.map((step, i) => {
              const status = stepStatus(step);
              const isActive = status === 'active';
              const isComplete = status === 'complete';

              return (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: -12 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.1 }}
                  className="relative pl-7"
                >
                  {/* Timeline dot */}
                  <div className={`absolute -left-[7px] top-1 w-3.5 h-3.5 rounded-full flex items-center justify-center
                    ${isActive   ? 'bg-cyan-400 shadow-[0_0_14px_rgba(6,182,212,0.9)] animate-pulse' :
                      isComplete ? 'bg-green-900 border border-green-500' :
                                   'bg-slate-800 border border-slate-600'}`}
                  >
                    {isComplete && <CheckCircle2 size={9} className="text-green-400" />}
                  </div>

                  {/* Step header */}
                  <div className="flex items-center justify-between mb-1.5">
                    <h4 className={`font-medium tracking-tight text-base
                      ${isActive ? 'text-cyan-400' : isComplete ? 'text-slate-200' : 'text-slate-500'}`}>
                      {step.step}
                    </h4>
                    {step.duration_ms !== undefined && (
                      <span className="text-[10px] font-mono text-slate-500 bg-white/5 px-2 py-0.5 rounded">
                        {step.duration_ms}ms
                      </span>
                    )}
                  </div>

                  {/* Description */}
                  <p className="text-sm text-slate-500 leading-relaxed mb-2">
                    {step.description || step.desc || ''}
                  </p>

                  {/* Result preview */}
                  {isComplete && step.result && (
                    <div className="flex flex-wrap gap-2 mt-2">
                      {resultPreview(step.result)}
                    </div>
                  )}
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>

        {/* Terminal log */}
        <div className="bg-[#080e1c] rounded-xl border border-white/5 p-4 font-mono text-[11px] text-cyan-700 overflow-hidden shadow-xl mt-2">
          <div className="flex items-center gap-2 mb-3 pb-2 border-b border-white/5">
            <div className="w-2.5 h-2.5 rounded-full bg-red-500/80" />
            <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/80" />
            <div className="w-2.5 h-2.5 rounded-full bg-green-500/80" />
            <span className="ml-2 text-slate-600 flex items-center gap-1">
              <Terminal size={10} /> agent-terminal
            </span>
            {hasTrace && trace.total_time_ms && (
              <span className="ml-auto text-slate-600">{trace.total_time_ms}ms</span>
            )}
          </div>
          <pre className="whitespace-pre-wrap leading-loose text-[11px]">
            {terminalLines.join('\n')}
          </pre>
        </div>
      </div>
    </div>
  );
}
