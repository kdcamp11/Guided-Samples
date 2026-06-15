'use client'

/**
 * AdminStageOverride
 *
 * Control panel for GRACE admins to advance production orders.
 *
 * Targeted actions surface first for the two logistics stages admins own:
 *   SAMPLE_SHIPPED  → SAMPLE_DELIVERED   (confirm sample arrived)
 *   SAMPLE_DELIVERED → CLIENT_SAMPLE_EVALUATION (open for client review)
 *   SHIPPED         → DELIVERED          (confirm bulk delivery)
 *
 * A general override dropdown allows advancing to any valid next stage
 * from the transition graph.
 */

import { useState } from 'react'
import { CheckCircle2, ChevronDown, Loader2, AlertTriangle, Truck } from 'lucide-react'
import { adminTransition } from '@/lib/adminPortal'
import { TRANSITION_GRAPH, STAGE_LABELS, type ProductionStage } from '@/types/productionStages'

interface Props {
  orderId:      string
  currentStage: ProductionStage | null
  onTransition: () => void
}

// ─── Targeted delivery confirmation ──────────────────────────────────────────

function DeliveryConfirmAction({
  orderId,
  fromStage,
  toStage,
  label,
  description,
  onSuccess,
}: {
  orderId:     string
  fromStage:   ProductionStage
  toStage:     ProductionStage
  label:       string
  description: string
  onSuccess:   () => void
}) {
  const [submitting, setSubmitting] = useState(false)
  const [error,      setError]      = useState('')

  async function confirm() {
    setSubmitting(true); setError('')
    const res = await adminTransition(orderId, toStage, {})
    setSubmitting(false)
    if (res.ok) onSuccess()
    else setError(res.error ?? 'Unknown error')
  }

  return (
    <div className="border border-brand-green/20 bg-brand-green/5 rounded-xl p-4 space-y-2">
      <div className="flex items-center gap-2">
        <Truck size={13} className="text-brand-green" />
        <p className="text-xs font-semibold text-brand-green">{label}</p>
      </div>
      <p className="text-[11px] text-gray-600 leading-relaxed">{description}</p>
      {error && <p className="text-xs text-red-500">{error}</p>}
      <button
        onClick={confirm}
        disabled={submitting}
        className="btn-primary w-full text-xs flex items-center justify-center gap-1.5"
      >
        {submitting
          ? <Loader2 size={12} className="animate-spin" />
          : <><CheckCircle2 size={12} /> {label}</>
        }
      </button>
    </div>
  )
}

// ─── General stage override ───────────────────────────────────────────────────

function GeneralOverride({
  orderId,
  currentStage,
  onSuccess,
}: {
  orderId:      string
  currentStage: ProductionStage
  onSuccess:    () => void
}) {
  const [open,       setOpen]      = useState(false)
  const [toStage,    setToStage]   = useState<ProductionStage | ''>('')
  const [reason,     setReason]    = useState('')
  const [submitting, setSubmit]    = useState(false)
  const [error,      setError]     = useState('')

  const nextStages = TRANSITION_GRAPH[currentStage] ?? []
  if (nextStages.length === 0) return null

  async function submit() {
    if (!toStage) return
    setSubmit(true); setError('')
    const res = await adminTransition(orderId, toStage, reason ? { admin_reason: reason } : {})
    setSubmit(false)
    if (res.ok) { onSuccess(); setOpen(false) }
    else setError(res.error ?? 'Unknown error')
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-full text-xs text-gray-500 hover:text-gray-800 border border-slate-200 hover:border-slate-300 rounded-xl px-4 py-2.5 transition-colors flex items-center justify-center gap-1.5"
      >
        <ChevronDown size={12} /> Override Stage
      </button>
    )
  }

  return (
    <div className="border border-amber-200 bg-amber-50/30 rounded-xl p-4 space-y-3">
      <div className="flex items-center gap-2">
        <AlertTriangle size={13} className="text-amber-500" />
        <p className="text-xs font-semibold text-amber-800">Override Stage</p>
      </div>

      <select
        value={toStage}
        onChange={e => setToStage(e.target.value as ProductionStage)}
        className="input-field text-xs"
      >
        <option value="">Select target stage…</option>
        {nextStages.map(s => (
          <option key={s} value={s}>{STAGE_LABELS[s]}</option>
        ))}
      </select>

      <textarea
        className="textarea-field text-xs"
        rows={2}
        placeholder="Reason for override (optional but recommended)…"
        value={reason}
        onChange={e => setReason(e.target.value)}
      />

      {error && <p className="text-xs text-red-500">{error}</p>}

      <div className="flex gap-2">
        <button onClick={() => setOpen(false)} className="btn-secondary flex-1 text-xs" disabled={submitting}>
          Cancel
        </button>
        <button
          onClick={submit}
          disabled={!toStage || submitting}
          className="flex-1 text-xs px-4 py-2 rounded-lg font-medium bg-amber-500 hover:bg-amber-600 text-white transition-colors disabled:opacity-50"
        >
          {submitting ? <Loader2 size={12} className="animate-spin mx-auto" /> : 'Apply Override'}
        </button>
      </div>
    </div>
  )
}

// ─── Main panel ───────────────────────────────────────────────────────────────

export default function AdminStageOverride({ orderId, currentStage, onTransition }: Props) {
  if (!currentStage) return null

  const isTerminal = currentStage === 'DELIVERED' || currentStage === 'CANCELLED'
  if (isTerminal) return null

  return (
    <div className="space-y-3">
      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest">Admin Actions</p>

      {/* Quality check — GRACE inspects the supplier's photos and decides */}
      {currentStage === 'QUALITY_CHECK' && (
        <>
          <DeliveryConfirmAction
            orderId={orderId}
            fromStage="QUALITY_CHECK"
            toStage="AWAITING_FINAL_PAYMENT"
            label="Complete Quality Check — Pass"
            description="The product passed inspection. This advances the order and prompts the client for their final payment before shipment."
            onSuccess={onTransition}
          />
          <DeliveryConfirmAction
            orderId={orderId}
            fromStage="QUALITY_CHECK"
            toStage="BULK_PRODUCTION"
            label="Quality Check — Fail / Rework"
            description="The product did not pass inspection. Return it to bulk production for correction."
            onSuccess={onTransition}
          />
        </>
      )}

      {/* General override — always available for non-terminal stages */}
      <GeneralOverride
        orderId={orderId}
        currentStage={currentStage}
        onSuccess={onTransition}
      />
    </div>
  )
}
