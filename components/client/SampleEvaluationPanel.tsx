'use client'

/**
 * SampleEvaluationPanel
 *
 * Shown only when the order is at CLIENT_SAMPLE_EVALUATION — the single stage
 * where the client makes a business decision.
 *
 * Three decisions:
 *   Approve  → BULK_PRODUCTION   (authorise full production run)
 *   Revise   → REVISION_REQUIRED (factory reworks, sample loop restarts)
 *   Cancel   → CANCELLED         (permanent, requires confirmation)
 *
 * All logistics steps (confirming receipt, confirming delivery) are handled
 * by GRACE admins — clients are never asked to click logistical buttons.
 */

import { useState } from 'react'
import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  ChevronDown,
  ChevronUp,
  Loader2,
  Package,
} from 'lucide-react'
import { clientTransition } from '@/lib/clientPortal'
import type { ProductionStage } from '@/types/productionStages'
import type { OrderMedia } from '@/types/supplier'

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  orderId:      string
  stage:        ProductionStage
  media:        OrderMedia[]
  onTransition: () => void
}

type Decision = 'approve' | 'revise' | 'cancel' | null

// ─── Sample photo grid ────────────────────────────────────────────────────────

function SamplePhotoGrid({ media }: { media: OrderMedia[] }) {
  const [expanded, setExpanded] = useState(false)

  const photos = media.filter(m =>
    m.mime_type?.startsWith('image/') ||
    m.media_type === 'first_piece_review' ||
    m.media_type === 'revised_sample'
  )

  if (photos.length === 0) {
    return (
      <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl border border-slate-100">
        <Package size={14} className="text-gray-300 shrink-0" />
        <p className="text-xs text-gray-400">No photos uploaded yet.</p>
      </div>
    )
  }

  const visible = expanded ? photos : photos.slice(0, 3)
  const hidden  = photos.length - 3

  return (
    <div>
      <div className="grid grid-cols-3 gap-2">
        {visible.map((m, i) => (
          <a
            key={m.id}
            href={m.public_url}
            target="_blank"
            rel="noopener noreferrer"
            className="block relative group rounded-xl overflow-hidden bg-slate-100 aspect-square hover:opacity-90 transition-opacity"
          >
            <img src={m.public_url} alt={m.file_name} className="w-full h-full object-cover" />
            {!expanded && i === 2 && hidden > 0 && (
              <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                <span className="text-white text-sm font-semibold">+{hidden}</span>
              </div>
            )}
          </a>
        ))}
      </div>
      {photos.length > 3 && (
        <button
          onClick={() => setExpanded(e => !e)}
          className="mt-2 flex items-center gap-1 text-[11px] text-brand-green hover:text-brand-green/70 transition-colors"
        >
          {expanded ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
          {expanded ? 'Show less' : `Show all ${photos.length} photos`}
        </button>
      )}
    </div>
  )
}

// ─── Approval form ────────────────────────────────────────────────────────────

function ApprovalForm({ orderId, onTransition, onBack }: { orderId: string; onTransition: () => void; onBack: () => void }) {
  const [notes,      setNotes]  = useState('')
  const [submitting, setSubmit] = useState(false)
  const [error,      setError]  = useState('')

  async function submit() {
    setSubmit(true); setError('')
    const res = await clientTransition({ order_id: orderId, to_stage: 'AWAITING_PRODUCTION_DEPOSIT', metadata: { evaluation_notes: notes.trim() || undefined } })
    setSubmit(false)
    if (res.ok) onTransition()
    else setError(res.errors.join(', '))
  }

  return (
    <div className="border border-brand-green/30 rounded-xl p-4 bg-brand-green/5 space-y-3">
      <div className="flex items-start gap-2">
        <CheckCircle2 size={14} className="text-brand-green shrink-0 mt-0.5" />
        <div>
          <p className="text-xs font-semibold text-brand-green">Approve — Pay Production Deposit</p>
          <p className="text-[11px] text-gray-600 mt-0.5 leading-relaxed">
            Approve the sample and pay the production deposit to authorise the full production run. Any notes will be passed to the factory.
          </p>
        </div>
      </div>
      <textarea className="textarea-field text-xs" rows={2} placeholder="Optional notes for the factory…" value={notes} onChange={e => setNotes(e.target.value)} />
      {error && <p className="text-xs text-red-500">{error}</p>}
      <div className="flex gap-2">
        <button onClick={onBack} className="btn-secondary flex-1 text-xs" disabled={submitting}>Back</button>
        <button onClick={submit} disabled={submitting} className="btn-primary flex-1 text-xs flex items-center justify-center gap-1.5">
          {submitting ? <Loader2 size={12} className="animate-spin" /> : <><CheckCircle2 size={12} /> Approve & Continue</>}
        </button>
      </div>
    </div>
  )
}

// ─── Revision form ────────────────────────────────────────────────────────────

function RevisionForm({ orderId, onTransition, onBack }: { orderId: string; onTransition: () => void; onBack: () => void }) {
  const [notes,      setNotes]  = useState('')
  const [submitting, setSubmit] = useState(false)
  const [error,      setError]  = useState('')

  async function submit() {
    if (!notes.trim()) { setError('Please describe what needs to change.'); return }
    setSubmit(true); setError('')
    const res = await clientTransition({ order_id: orderId, to_stage: 'REVISION_REQUIRED', metadata: { revision_notes: notes.trim() } })
    setSubmit(false)
    if (res.ok) onTransition()
    else setError(res.errors.join(', '))
  }

  return (
    <div className="border border-amber-200 rounded-xl p-4 bg-amber-50/30 space-y-3">
      <div className="flex items-start gap-2">
        <AlertTriangle size={14} className="text-amber-500 shrink-0 mt-0.5" />
        <div>
          <p className="text-xs font-semibold text-amber-800">Request Revisions</p>
          <p className="text-[11px] text-amber-700 mt-0.5 leading-relaxed">
            Be specific. The factory will restart the sample based on these notes.
          </p>
        </div>
      </div>
      <textarea
        className="textarea-field text-xs" rows={4} autoFocus
        placeholder="e.g. The shoulder seam sits 1.5 cm too wide. The collar rib needs to be tighter…"
        value={notes} onChange={e => setNotes(e.target.value)}
      />
      {error && <p className="text-xs text-red-500">{error}</p>}
      <div className="flex gap-2">
        <button onClick={onBack} className="btn-secondary flex-1 text-xs" disabled={submitting}>Back</button>
        <button onClick={submit} disabled={!notes.trim() || submitting} className="flex-1 text-xs px-4 py-2 rounded-lg font-medium bg-amber-500 hover:bg-amber-600 text-white transition-colors disabled:opacity-50">
          {submitting ? <Loader2 size={12} className="animate-spin mx-auto" /> : 'Submit Revision Request'}
        </button>
      </div>
    </div>
  )
}

// ─── Cancellation form ────────────────────────────────────────────────────────

function CancellationForm({ orderId, onTransition, onBack }: { orderId: string; onTransition: () => void; onBack: () => void }) {
  const [reason,     setReason]    = useState('')
  const [confirmed,  setConfirmed] = useState(false)
  const [submitting, setSubmit]    = useState(false)
  const [error,      setError]     = useState('')

  async function submit() {
    if (!reason.trim()) { setError('Please provide a reason.'); return }
    if (!confirmed)     { setError('Please confirm you understand this cannot be undone.'); return }
    setSubmit(true); setError('')
    const res = await clientTransition({ order_id: orderId, to_stage: 'CANCELLED', metadata: { cancellation_reason: reason.trim() } })
    setSubmit(false)
    if (res.ok) onTransition()
    else setError(res.errors.join(', '))
  }

  return (
    <div className="border border-red-200 rounded-xl p-4 bg-red-50/30 space-y-3">
      <div className="flex items-start gap-2">
        <XCircle size={14} className="text-red-500 shrink-0 mt-0.5" />
        <div>
          <p className="text-xs font-semibold text-red-700">Cancel Order</p>
          <p className="text-[11px] text-red-600 mt-0.5">Permanent. The factory will be notified immediately.</p>
        </div>
      </div>
      <textarea className="textarea-field text-xs border-red-200" rows={3} autoFocus placeholder="Why are you cancelling this order?" value={reason} onChange={e => setReason(e.target.value)} />
      <label className="flex items-start gap-2.5 cursor-pointer">
        <input type="checkbox" className="mt-0.5 w-3.5 h-3.5 accent-red-500" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} />
        <span className="text-[11px] text-red-700 leading-relaxed">I understand this cancellation is permanent and the factory will stop work immediately.</span>
      </label>
      {error && <p className="text-xs text-red-500">{error}</p>}
      <div className="flex gap-2">
        <button onClick={onBack} className="btn-secondary flex-1 text-xs" disabled={submitting}>Back</button>
        <button onClick={submit} disabled={!reason.trim() || !confirmed || submitting} className="flex-1 text-xs px-4 py-2 rounded-lg font-medium bg-red-500 hover:bg-red-600 text-white transition-colors disabled:opacity-50">
          {submitting ? <Loader2 size={12} className="animate-spin mx-auto" /> : 'Cancel Order'}
        </button>
      </div>
    </div>
  )
}

// ─── Decision picker ──────────────────────────────────────────────────────────

function EvaluationDecisionStep({ orderId, media, onTransition }: { orderId: string; media: OrderMedia[]; onTransition: () => void }) {
  const [decision, setDecision] = useState<Decision>(null)

  if (decision === 'approve') return <ApprovalForm orderId={orderId} onTransition={onTransition} onBack={() => setDecision(null)} />
  if (decision === 'revise')  return <RevisionForm  orderId={orderId} onTransition={onTransition} onBack={() => setDecision(null)} />
  if (decision === 'cancel')  return <CancellationForm orderId={orderId} onTransition={onTransition} onBack={() => setDecision(null)} />

  return (
    <div className="space-y-4">
      <SamplePhotoGrid media={media} />

      <div className="space-y-2 pt-1">
        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest">Your Decision</p>

        <button onClick={() => setDecision('approve')} className="w-full flex items-center gap-3 p-3.5 rounded-xl border border-brand-green/30 bg-brand-green/5 hover:bg-brand-green/10 hover:border-brand-green/50 transition-all text-left group">
          <div className="w-8 h-8 rounded-xl bg-brand-green/10 flex items-center justify-center shrink-0 group-hover:bg-brand-green/20 transition-colors">
            <CheckCircle2 size={15} className="text-brand-green" />
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-900">Approve — Pay Production Deposit</p>
            <p className="text-[11px] text-gray-500 mt-0.5">Sample meets your standards. Pay the deposit to authorise the full run.</p>
          </div>
        </button>

        <button onClick={() => setDecision('revise')} className="w-full flex items-center gap-3 p-3.5 rounded-xl border border-amber-200 bg-amber-50/30 hover:bg-amber-50 hover:border-amber-300 transition-all text-left group">
          <div className="w-8 h-8 rounded-xl bg-amber-100 flex items-center justify-center shrink-0 group-hover:bg-amber-200 transition-colors">
            <AlertTriangle size={15} className="text-amber-600" />
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-900">Request Revisions</p>
            <p className="text-[11px] text-gray-500 mt-0.5">Something needs to change. Factory will rework the sample.</p>
          </div>
        </button>

        <button onClick={() => setDecision('cancel')} className="w-full flex items-center gap-3 p-3.5 rounded-xl border border-slate-200 hover:border-red-200 hover:bg-red-50/30 transition-all text-left group">
          <div className="w-8 h-8 rounded-xl bg-slate-100 group-hover:bg-red-100 flex items-center justify-center shrink-0 transition-colors">
            <XCircle size={15} className="text-gray-400 group-hover:text-red-500 transition-colors" />
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-900 group-hover:text-red-700 transition-colors">Cancel Order</p>
            <p className="text-[11px] text-gray-500 mt-0.5">Stop production. This cannot be undone.</p>
          </div>
        </button>
      </div>
    </div>
  )
}

// ─── Exported component ───────────────────────────────────────────────────────

/** Returns true only for the single stage where the client makes a decision. */
export function isSampleEvaluationStage(stage: ProductionStage | null): boolean {
  return stage === 'CLIENT_SAMPLE_EVALUATION'
}

export default function SampleEvaluationPanel({ orderId, stage, media, onTransition }: Props) {
  if (stage !== 'CLIENT_SAMPLE_EVALUATION') return null

  return (
    <div className="card border-brand-green/20">
      <div className="flex items-center gap-2 mb-4">
        <div className="w-6 h-6 rounded-lg bg-brand-green flex items-center justify-center shrink-0">
          <Package size={11} className="text-white" />
        </div>
        <p className="text-xs font-semibold text-gray-900">Sample Evaluation</p>
        <span className="ml-auto text-[10px] font-medium px-2 py-0.5 bg-brand-green/10 text-brand-green rounded-full">
          Your Decision
        </span>
      </div>
      <EvaluationDecisionStep orderId={orderId} media={media} onTransition={onTransition} />
    </div>
  )
}
