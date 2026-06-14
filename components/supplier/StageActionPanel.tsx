'use client'

import { useState, useRef } from 'react'
import { Upload, Loader2, AlertCircle, CheckCircle2, X, FileImage } from 'lucide-react'
import { STAGE_LABELS, STAGE_DESCRIPTIONS, type ProductionStage } from '@/types/productionStages'
import {
  getSupplierActions,
  supplierIsWaiting,
  type SupplierAction,
  type SupplierMediaType,
} from '@/types/supplier'
import { supplierTransition, uploadOrderMedia } from '@/lib/supplierPortal'
import type { OrderMedia } from '@/types/supplier'

interface Props {
  orderId:       string
  currentStage:  ProductionStage | null
  supplierEmail: string
  revisionNotes?: string | null
  onTransition:  () => void   // callback to refresh parent after success
}

const WAITING_MESSAGES: Partial<Record<ProductionStage, string>> = {
  FIRST_PIECE_REVIEW:       'The client is reviewing your photos. Once approved, ship the physical sample.',
  SAMPLE_SHIPPED:           'The sample is in transit. GRACE will confirm delivery.',
  SAMPLE_DELIVERED:         'GRACE has confirmed delivery. Awaiting client evaluation.',
  CLIENT_SAMPLE_EVALUATION: 'Awaiting the client\'s decision on the physical sample.',
  SHIPPED:                  'The bulk order is in transit. GRACE will confirm delivery.',
  DELIVERED:                'This order has been delivered. No further actions required.',
  CANCELLED:                'This production order has been cancelled.',
}

// ─── Single action form ───────────────────────────────────────────────────────

function ActionForm({
  action,
  orderId,
  supplierEmail,
  onSuccess,
  onTransitionStart,
}: {
  action:             SupplierAction
  orderId:            string
  supplierEmail:      string
  onSuccess:          () => void
  onTransitionStart?: () => void
}) {
  const [fields, setFields]         = useState<Record<string, string>>({})
  const [mediaFiles, setMediaFiles] = useState<File[]>([])
  const [uploading, setUploading]   = useState(false)
  const [error, setError]           = useState('')
  const [success, setSuccess]       = useState(false)
  const fileRef                     = useRef<HTMLInputElement>(null)

  const setField = (key: string, value: string) =>
    setFields(f => ({ ...f, [key]: value }))

  const removeFile = (idx: number) =>
    setMediaFiles(f => f.filter((_, i) => i !== idx))

  const handleSubmit = async () => {
    setError('')

    // Client-side required field check
    for (const f of action.requiredFields) {
      if (!fields[f.key]?.trim()) {
        setError(`"${f.label}" is required.`)
        return
      }
    }

    if (action.requiresMedia && mediaFiles.length === 0) {
      setError('Please attach at least one photo or file.')
      return
    }

    setUploading(true)
    onTransitionStart?.()

    try {
      // Upload media first
      const uploadedIds: string[] = []
      for (const file of mediaFiles) {
        const media = await uploadOrderMedia(
          orderId,
          action.toStage,
          action.mediaType as SupplierMediaType ?? 'other',
          file,
        )
        if (media) uploadedIds.push(media.id)
      }

      // Transition stage
      const result = await supplierTransition(
        orderId,
        action.toStage,
        { ...fields, media_ids: uploadedIds },
        supplierEmail,
      )

      if (!result.ok) {
        setError(result.errors.join(' '))
        return
      }

      setSuccess(true)
      setTimeout(() => onSuccess(), 800)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong. Please try again.')
    } finally {
      setUploading(false)
    }
  }

  if (success) {
    return (
      <div className="flex items-center gap-3 p-4 bg-green-50 rounded-xl border border-green-100">
        <CheckCircle2 size={20} className="text-brand-green shrink-0" />
        <div>
          <p className="text-sm font-semibold text-gray-900">Stage updated</p>
          <p className="text-xs text-gray-500 mt-0.5">
            Moved to {STAGE_LABELS[action.toStage]}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className={`card ${action.variant === 'warning' ? 'border-amber-200 bg-amber-50/30' : ''}`}>
      <p className="text-xs font-semibold text-gray-900 mb-1">{action.label}</p>
      <p className="text-[11px] text-gray-500 mb-4 leading-relaxed">{action.description}</p>

      {/* Dynamic fields */}
      {action.requiredFields.map(field => (
        <div key={field.key} className="mb-3">
          <label className="text-[11px] text-gray-500 mb-1 block">{field.label} <span className="text-red-400">*</span></label>
          {field.type === 'textarea' ? (
            <textarea
              className="textarea-field text-xs"
              rows={3}
              placeholder={field.placeholder}
              value={fields[field.key] ?? ''}
              onChange={e => setField(field.key, e.target.value)}
            />
          ) : (
            <input
              type={field.type}
              className="input-field text-xs py-2"
              placeholder={field.placeholder}
              value={fields[field.key] ?? ''}
              onChange={e => setField(field.key, e.target.value)}
            />
          )}
        </div>
      ))}

      {/* Media upload */}
      {action.requiresMedia && (
        <div className="mb-4">
          <label className="text-[11px] text-gray-500 mb-1.5 block">
            Attach Photos / Files {action.requiresMedia && <span className="text-red-400">*</span>}
          </label>

          {mediaFiles.length > 0 && (
            <div className="space-y-1.5 mb-2">
              {mediaFiles.map((f, i) => (
                <div key={i} className="flex items-center gap-2 bg-slate-50 rounded-lg px-3 py-1.5">
                  <FileImage size={12} className="text-gray-400 shrink-0" />
                  <span className="text-xs text-gray-600 truncate flex-1">{f.name}</span>
                  <span className="text-[10px] text-gray-400">{(f.size / 1024).toFixed(0)} KB</span>
                  <button onClick={() => removeFile(i)} className="text-gray-300 hover:text-red-400 transition-colors">
                    <X size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}

          <button
            onClick={() => fileRef.current?.click()}
            className="w-full border-2 border-dashed border-slate-200 hover:border-brand-green/40 rounded-xl p-4 flex flex-col items-center gap-2 text-gray-400 hover:text-brand-green transition-colors"
          >
            <Upload size={18} />
            <span className="text-xs">Click to upload photos or PDF</span>
            <span className="text-[10px]">JPG, PNG, PDF up to 20 MB</span>
          </button>
          <input
            ref={fileRef}
            type="file"
            multiple
            accept="image/*,.pdf"
            className="hidden"
            onChange={e => {
              const files = Array.from(e.target.files ?? [])
              setMediaFiles(f => [...f, ...files])
              e.target.value = ''
            }}
          />
        </div>
      )}

      {error && (
        <div className="flex items-start gap-2 mb-3 text-red-500">
          <AlertCircle size={13} className="mt-0.5 shrink-0" />
          <p className="text-xs">{error}</p>
        </div>
      )}

      <button
        onClick={handleSubmit}
        disabled={uploading}
        className={`w-full flex items-center justify-center gap-2 font-medium py-2.5 px-4 rounded-xl transition-colors text-sm ${
          action.variant === 'warning'
            ? 'bg-amber-500 hover:bg-amber-600 text-white'
            : 'btn-primary'
        }`}
      >
        {uploading ? <Loader2 size={14} className="animate-spin" /> : null}
        {uploading ? 'Submitting…' : action.label}
      </button>
    </div>
  )
}

// ─── Action panel ─────────────────────────────────────────────────────────────

export default function StageActionPanel({ orderId, currentStage, supplierEmail, revisionNotes, onTransition }: Props) {
  const [isTransitioning, setIsTransitioning] = useState(false)
  const actions = getSupplierActions(currentStage)
  const isWaiting = supplierIsWaiting(currentStage)

  // Waiting on client or system
  if (isWaiting && currentStage) {
    const msg = WAITING_MESSAGES[currentStage]
    const isTerminal = currentStage === 'DELIVERED' || currentStage === 'CANCELLED'

    return (
      <div className="card">
        <div className="flex items-start gap-3">
          <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
            isTerminal ? 'bg-slate-100' : 'bg-brand-green/10'
          }`}>
            {currentStage === 'DELIVERED' ? (
              <CheckCircle2 size={16} className="text-brand-green" />
            ) : currentStage === 'CANCELLED' ? (
              <AlertCircle size={16} className="text-red-400" />
            ) : (
              <div className="w-3 h-3 rounded-full border-2 border-brand-green border-t-transparent animate-spin" />
            )}
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-900">
              {isTerminal ? STAGE_LABELS[currentStage] : 'Waiting for client'}
            </p>
            <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">
              {msg ?? STAGE_DESCRIPTIONS[currentStage]}
            </p>
          </div>
        </div>
      </div>
    )
  }

  // No stage set yet
  if (!currentStage || actions.length === 0) {
    return (
      <div className="card">
        <p className="text-xs text-gray-400 text-center py-4">
          No actions available for the current stage.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest">
        Your Actions
      </p>

      {/* Revision notes from client — shown prominently when revision is required */}
      {currentStage === 'REVISION_REQUIRED' && (
        <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl space-y-2">
          <div className="flex items-center gap-1.5">
            <AlertCircle size={12} className="text-amber-500 shrink-0" />
            <p className="text-[11px] font-semibold text-amber-800">Client Revision Notes</p>
          </div>
          {revisionNotes ? (
            <p className="text-xs text-amber-800 leading-relaxed">{revisionNotes}</p>
          ) : (
            <p className="text-xs text-amber-600 italic">No revision notes provided.</p>
          )}
          <p className="text-[10px] text-amber-600 pt-1 border-t border-amber-100">
            Address these points before restarting the sample workflow.
          </p>
        </div>
      )}

      {isTransitioning && (
        <div className="flex items-center gap-2 p-3 bg-brand-green/5 rounded-lg mb-2">
          <Loader2 size={12} className="animate-spin text-brand-green" />
          <p className="text-xs text-brand-green font-medium">Updating stage…</p>
        </div>
      )}
      {actions.map(action => (
        <ActionForm
          key={action.id}
          action={action}
          orderId={orderId}
          supplierEmail={supplierEmail}
          onSuccess={() => { setIsTransitioning(false); onTransition() }}
          onTransitionStart={() => setIsTransitioning(true)}
        />
      ))}
    </div>
  )
}
