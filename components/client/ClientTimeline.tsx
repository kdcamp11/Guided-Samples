'use client'

import { Check, Truck, Package, Sparkles, Star, RotateCcw } from 'lucide-react'
import type { ProductionStage } from '@/types/productionStages'
import type { StageTransitionEvent } from '@/types/productionStages'
import {
  CLIENT_JOURNEY,
  journeyMilestoneIndex,
  clientProgress,
  CLIENT_STAGE_LABELS,
} from '@/lib/clientStagePresentation'

interface Props {
  currentStage: ProductionStage | null
  history:      StageTransitionEvent[]
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

const MILESTONE_ICONS = [Package, Sparkles, Star, Package, Truck, Check]

export default function ClientTimeline({ currentStage, history }: Props) {
  const isCancelled   = currentStage === 'CANCELLED'
  const isRevision    = currentStage === 'REVISION_REQUIRED'
  const progress      = clientProgress(currentStage)
  const currentMilestone = journeyMilestoneIndex(currentStage)

  // Build a timestamp map: earliest event whose to_stage lands in each milestone
  const milestoneTimestamps: Record<string, string> = {}
  for (const event of history) {
    const milestoneIdx = journeyMilestoneIndex(event.to_stage as ProductionStage)
    if (milestoneIdx >= 0) {
      const key = CLIENT_JOURNEY[milestoneIdx].id
      if (!milestoneTimestamps[key]) milestoneTimestamps[key] = event.transitioned_at
    }
  }

  if (isCancelled) {
    return (
      <div className="card border-red-100 bg-red-50/30">
        <div className="flex items-center gap-2.5 py-2">
          <div className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center shrink-0">
            <Package size={14} className="text-red-400" />
          </div>
          <div>
            <p className="text-sm font-semibold text-red-700">Order Cancelled</p>
            <p className="text-xs text-red-500 mt-0.5">This order is no longer active.</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="card">
      {/* Progress bar */}
      <div className="mb-5">
        <div className="flex items-center justify-between mb-1.5">
          <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-widest">Order Progress</p>
          <p className="text-[11px] text-gray-400">{Math.round(progress * 100)}%</p>
        </div>
        <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-brand-green rounded-full transition-all duration-700"
            style={{ width: `${progress * 100}%` }}
          />
        </div>
      </div>

      {/* Revision in-progress note */}
      {isRevision && (
        <div className="mb-4 flex items-center gap-2 p-2.5 bg-amber-50 border border-amber-100 rounded-lg">
          <RotateCcw size={12} className="text-amber-500 shrink-0 animate-spin" style={{ animationDuration: '3s' }} />
          <p className="text-[11px] text-amber-700 font-medium">Factory is applying your requested changes</p>
        </div>
      )}

      {/* Milestone steps */}
      <div className="space-y-0">
        {CLIENT_JOURNEY.map((milestone, idx) => {
          const isDone    = currentMilestone > idx || currentStage === 'DELIVERED'
          const isCurrent = currentMilestone === idx && !isCancelled
          const isUpcoming = !isDone && !isCurrent
          const ts        = milestoneTimestamps[milestone.id]
          const Icon      = MILESTONE_ICONS[idx] ?? Package

          return (
            <div key={milestone.id} className="flex gap-3 group">
              {/* Icon column */}
              <div className="flex flex-col items-center">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 transition-all ${
                  isDone    ? 'bg-brand-green shadow-sm shadow-brand-green/20' :
                  isCurrent ? 'bg-brand-green/10 ring-2 ring-brand-green/30 ring-offset-1' :
                  'bg-slate-100'
                }`}>
                  {isDone ? (
                    <Check size={14} className="text-white" strokeWidth={2.5} />
                  ) : isCurrent ? (
                    <Icon size={14} className="text-brand-green" />
                  ) : (
                    <Icon size={14} className="text-slate-300" />
                  )}
                </div>
                {idx < CLIENT_JOURNEY.length - 1 && (
                  <div
                    className={`w-0.5 flex-1 my-1 rounded-full transition-all ${
                      isDone ? 'bg-brand-green/40' : 'bg-slate-100'
                    }`}
                    style={{ minHeight: 20 }}
                  />
                )}
              </div>

              {/* Label column */}
              <div className={`pb-4 min-w-0 flex-1 ${idx === CLIENT_JOURNEY.length - 1 ? 'pb-0' : ''}`}>
                <div className="flex items-center gap-2 mt-1">
                  <p className={`text-sm font-semibold leading-tight ${
                    isDone    ? 'text-gray-700' :
                    isCurrent ? 'text-gray-900' :
                    'text-slate-300'
                  }`}>
                    {milestone.label}
                  </p>
                  {isCurrent && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-brand-green/10 text-brand-green">
                      <span className="w-1 h-1 rounded-full bg-brand-green animate-pulse" />
                      Now
                    </span>
                  )}
                </div>
                {ts && (isDone || isCurrent) && (
                  <p className="text-[11px] text-gray-400 mt-0.5">{formatDate(ts)}</p>
                )}
                {isUpcoming && idx === currentMilestone + 1 && (
                  <p className="text-[11px] text-slate-300 mt-0.5">Up next</p>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
