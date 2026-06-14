'use client'

import { useState } from 'react'
import { CheckCircle2, AlertTriangle, XCircle, Loader2 } from 'lucide-react'
import { getClientActions, clientIsWaiting, type ClientAction } from '@/types/client'
import { clientTransition } from '@/lib/clientPortal'
import type { ProductionStage } from '@/types/productionStages'
import { STAGE_DESCRIPTIONS } from '@/types/productionStages'

interface Props {
  orderId:      string
  currentStage: ProductionStage | null
  onTransition: () => void
}

function ActionIcon({ variant }: { variant: ClientAction['variant'] }) {
  if (variant === 'primary') return <CheckCircle2 size={14} className="text-brand-green" />
  if (variant === 'danger')  return <XCircle size={14} className="text-red-500" />
  return <AlertTriangle size={14} className="text-amber-500" />
}

function ActionForm({
  action,
  orderId,
  onSuccess,
}: {
  action:    ClientAction
  orderId:   string
  onSuccess: () => void
}) {
  const [fields,      setFields]      = useState<Record<string, string>>({})
  const [confirming,  setConfirming]  = useState(false)
  const [submitting,  setSubmitting]  = useState(false)
  const [error,       setError]       = useState('')

  const allFilled = action.requiredFields.every(f => {
    const val = fields[f.key]?.trim() ?? ''
    return f.label.toLowerCase().includes('optional') || val.length > 0
  })

  async function submit() {
    setSubmitting(true)
    setError('')
    const res = await clientTransition({
      order_id: orderId,
      to_stage: action.toStage,
      metadata: fields,
    })
    setSubmitting(false)
    if (res.ok) {
      onSuccess()
    } else {
      setError(res.errors.join(', '))
    }
  }

  if (confirming && action.confirmMessage) {
    return (
      <div className="border border-slate-200 rounded-xl p-4 space-y-3">
        <p className="text-xs font-semibold text-gray-700">{action.label}</p>
        <p className="text-xs text-gray-500">{action.confirmMessage}</p>
        {error && <p className="text-xs text-red-500">{error}</p>}
        <div className="flex gap-2">
          <button
            onClick={() => setConfirming(false)}
            className="btn-secondary text-xs flex-1"
            disabled={submitting}
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={submitting}
            className={`flex-1 text-xs px-4 py-2 rounded-lg font-medium transition-colors ${
              action.variant === 'danger'
                ? 'bg-red-500 hover:bg-red-600 text-white'
                : 'btn-primary'
            }`}
          >
            {submitting ? <Loader2 size={13} className="animate-spin mx-auto" /> : 'Confirm'}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="border border-slate-200 rounded-xl p-4 space-y-3">
      <div className="flex items-start gap-2.5">
        <ActionIcon variant={action.variant} />
        <div>
          <p className="text-xs font-semibold text-gray-800 leading-tight">{action.label}</p>
          <p className="text-[11px] text-gray-500 mt-0.5">{action.description}</p>
        </div>
      </div>

      {action.requiredFields.map(field => (
        <div key={field.key}>
          <label className="block text-[11px] font-medium text-gray-500 mb-1">{field.label}</label>
          {field.type === 'textarea' ? (
            <textarea
              className="textarea-field text-xs"
              rows={3}
              placeholder={field.placeholder}
              value={fields[field.key] ?? ''}
              onChange={e => setFields(p => ({ ...p, [field.key]: e.target.value }))}
            />
          ) : (
            <input
              className="input-field text-xs"
              placeholder={field.placeholder}
              value={fields[field.key] ?? ''}
              onChange={e => setFields(p => ({ ...p, [field.key]: e.target.value }))}
            />
          )}
        </div>
      ))}

      {error && <p className="text-xs text-red-500">{error}</p>}

      <button
        onClick={action.confirmMessage ? () => setConfirming(true) : submit}
        disabled={!allFilled || submitting}
        className={`w-full text-xs px-4 py-2.5 rounded-lg font-medium transition-colors disabled:opacity-50 ${
          action.variant === 'danger'
            ? 'bg-red-500 hover:bg-red-600 text-white'
            : action.variant === 'secondary'
            ? 'btn-secondary'
            : 'btn-primary'
        }`}
      >
        {submitting ? <Loader2 size={13} className="animate-spin mx-auto" /> : action.label}
      </button>
    </div>
  )
}

export default function ClientDecisionPanel({ orderId, currentStage, onTransition }: Props) {
  const actions  = getClientActions(currentStage)
  const waiting  = clientIsWaiting(currentStage)
  const terminal = currentStage === 'DELIVERED' || currentStage === 'CANCELLED'

  if (terminal) return null

  if (waiting) {
    return (
      <div className="card border-slate-200">
        <p className="text-xs font-semibold text-gray-700 mb-1">Factory is working</p>
        <p className="text-[11px] text-gray-500 leading-relaxed">
          {currentStage ? STAGE_DESCRIPTIONS[currentStage] : 'Awaiting production start.'}
        </p>
      </div>
    )
  }

  if (actions.length === 0) return null

  return (
    <div className="space-y-3">
      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest">Your Action Required</p>
      {actions.map(action => (
        <ActionForm
          key={action.id}
          action={action}
          orderId={orderId}
          onSuccess={onTransition}
        />
      ))}
    </div>
  )
}
