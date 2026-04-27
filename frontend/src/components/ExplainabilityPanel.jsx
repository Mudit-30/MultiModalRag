import { Activity, CheckCircle, XCircle, Layers } from 'lucide-react'
import useStore from '../store/useStore'

const STEP_COLORS = {
  Decomposition: 'text-blue-400 border-blue-800 bg-blue-950/40',
  Retrieval: 'text-purple-400 border-purple-800 bg-purple-950/40',
  Validation: 'text-green-400 border-green-800 bg-green-950/40',
  'Decomposition Error': 'text-red-400 border-red-800 bg-red-950/40',
}

export default function ExplainabilityPanel() {
  const { trace } = useStore()

  if (!trace) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-gray-700 gap-2">
        <Activity className="w-10 h-10 opacity-20" />
        <p className="text-sm">Agent trace will appear here</p>
      </div>
    )
  }

  const timeline = trace.timeline || []

  return (
    <div className="h-full overflow-y-auto space-y-3">
      <div className="flex items-center gap-2 mb-4">
        <Activity className="w-4 h-4 text-indigo-400" />
        <span className="text-sm font-semibold text-white">Agent Trace</span>
        <span className="ml-auto text-xs text-gray-600">{timeline.length} steps</span>
      </div>

      {/* Timeline */}
      <div className="relative pl-5">
        {/* Vertical line */}
        <div className="absolute left-1.5 top-0 bottom-0 w-px bg-gray-800" />

        {timeline.map((step, i) => {
          const colorClass = STEP_COLORS[step.step] || STEP_COLORS.Retrieval
          return (
            <div key={i} className="relative mb-4">
              {/* Dot */}
              <div className={`absolute -left-3.5 w-2.5 h-2.5 rounded-full border-2 border-current top-2.5 ${colorClass.split(' ')[0]}`} />

              <div className={`rounded-lg border p-3 ${colorClass}`}>
                <p className="text-xs font-bold mb-2">{step.step}</p>

                {/* Sub-queries from Decomposition */}
                {step.result && Array.isArray(step.result) && (
                  <div className="space-y-1">
                    {step.result.map((sq, j) => (
                      <div key={j} className="flex items-start gap-1.5 text-xs text-current opacity-80">
                        <Layers className="w-3 h-3 mt-0.5 flex-shrink-0" />
                        <span>{sq}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Retrieval step */}
                {step.context_size !== undefined && (
                  <p className="text-xs opacity-80">Context window: {step.context_size} chars</p>
                )}

                {/* Validation step */}
                {step.is_valid !== undefined && (
                  <div className="flex items-center gap-2 text-xs">
                    {step.is_valid
                      ? <CheckCircle className="w-3.5 h-3.5 text-green-400" />
                      : <XCircle className="w-3.5 h-3.5 text-red-400" />
                    }
                    <span className="opacity-80">{step.feedback || (step.is_valid ? 'Answer validated' : 'Regenerating...')}</span>
                  </div>
                )}

                {/* Error */}
                {step.error && <p className="text-xs opacity-80 text-red-300">{step.error}</p>}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
