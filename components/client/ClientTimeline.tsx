'use client'

import { CheckCircle2, Circle, XCircle, AlertTriangle } from 'lucide-react'
import { HAPPY_PATH_SEQUENCE, STAGE_LABELS, stageProgress, type ProductionStage } from '@/types/productionStages'
import type { StageTransitionEvent } from '@/types/productionStages'

interface Props {
  currentStage: ProductionStage | null
  history:      StageTransitionEvent[]
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export default function ClientTimeline({ currentStage, history }: Props) {
  const progress = stageProgress(currentStage ?? 'PRODUCTION_FILES_RECEIVED')
  const isCancelled = currentStage === 'CANCELLED'
  const isRevision  = currentStage === 'REVISION_REQUIRED'

  const eventByStage = history.reduce<Record<string, StageTransitionEvent>>((acc, e) => {
    if (e.to_stage) acc[e.to_stage] = e
    return acc
  }, {})

  const currentIdx = currentStage ? HAPPY_PATH_SEQUENCE.indexOf(currentStage) : -1

  return (
    <div className="card">
      <p className="text-xs font-semibold text-gray-900 mb-3">Production Timeline</p>

      {/* Progress bar */}
      <div className="w-full h-1.5 bg-slate-100 rounded-full mb-4">
        <div
          className={`h-full rounded-full transition-all duration-700 ${isCancelled ? 'bg-red-300' : 'bg-brand-green'}`}
          style={{ width: `${progress * 100}%` }}
        />
      </div>

      {/* Revision callout */}
      {isRevision && (
        <div className="mb-3 p-2.5 bg-amber-50 border border-amber-100 rounded-lg flex items-center gap-2">
          <AlertTriangle size={13} className="text-amber-500 shrink-0" />
          <p className="text-[11px] text-amber-700 font-medium">Revision requested — factory is reworking the sample</p>
        </div>
      )}

      {/* Cancelled */}
      {isCancelled && (
        <div className="mb-3 p-2.5 bg-red-50 border border-red-100 rounded-lg flex items-center gap-2">
          <XCircle size={13} className="text-red-400 shrink-0" />
          <p className="text-[11px] text-red-600 font-medium">Order cancelled</p>
        </div>
      )}

      {/* Steps */}
      <div className="space-y-0">
        {HAPPY_PATH_SEQUENCE.map((stage, idx) => {
          const isDone    = currentIdx > idx || currentStage === 'DELIVERED'
          const isCurrent = stage === currentStage
          const event     = eventByStage[stage]

          return (
            <div key={stage} className="flex gap-3">
              <div className="flex flex-col items-center">
                <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${
                  isDone    ? 'text-brand-green' :
                  isCurrent ? 'text-brand-green' :
                  'text-slate-300'
                }`}>
                  {isDone ? (
                    <CheckCircle2 size={16} />
                  ) : isCurrent ? (
                    <span className="w-3 h-3 rounded-full bg-brand-green animate-pulse" />
                  ) : (
                    <Circle size={14} />
                  )}
                </div>
                {idx < HAPPY_PATH_SEQUENCE.length - 1 && (
                  <div className={`w-px flex-1 my-0.5 ${isDone ? 'bg-brand-green/30' : 'bg-slate-100'}`} style={{ minHeight: 16 }} />
                )}
              </div>
              <div className="pb-3 min-w-0">
                <p className={`text-xs font-medium leading-tight ${
                  isCurrent ? 'text-brand-green' : isDone ? 'text-gray-700' : 'text-gray-300'
                }`}>
                  {STAGE_LABELS[stage]}
                </p>
                {event && (
                  <p className="text-[10px] text-gray-400 mt-0.5">{formatTime(event.transitioned_at)}</p>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
