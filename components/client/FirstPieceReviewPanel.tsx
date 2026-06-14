'use client'

/**
 * FirstPieceReviewPanel
 *
 * Shown at FIRST_PIECE_REVIEW — the client reviews factory photos/video
 * of the first piece before the physical sample ships.
 *
 * Two decisions:
 *   Approve  → SAMPLE_SHIPPED   (factory ships the physical sample)
 *   Revise   → FIRST_PIECE_IN_PRODUCTION (factory reworks and re-submits)
 */

import { useState } from 'react'
import { CheckCircle2, AlertTriangle, ChevronDown, ChevronUp, Loader2, Camera } from 'lucide-react'
import { clientTransition } from '@/lib/clientPortal'
import type { ProductionStage } from '@/types/productionStages'
import type { OrderMedia } from '@/types/supplier'

interface Props {
  orderId:      string
  stage:        ProductionStage
  media:        OrderMedia[]
  onTransition: () => void
}

type Decision = 'approve' | 'revise' | null

function MediaGrid({ media }: { media: OrderMedia[] }) {
  const [expanded, setExpanded] = useState(false)

  const items = media.filter(m =>
    m.media_type === 'first_piece_review' ||
    m.mime_type?.startsWith('image/') ||
    m.mime_type?.startsWith('video/')
  )

  if (items.length === 0) {
    return (
      <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl border border-slate-100">
        <Camera size={14} className="text-gray-300 shrink-0" />
        <p className="text-xs text-gray-400">Photos not uploaded yet. The factory will share them shortly.</p>
      </div>
    )
  }

  const visible = expanded ? items : items.slice(0, 4)
  const hidden  = items.length - 4

  return (
    <div>
      <div className="grid grid-cols-2 gap-2">
        {visible.map((m, i) => (
          <a
            key={m.id}
            href={m.public_url}
            target="_blank"
            rel="noopener noreferrer"
            className="block relative rounded-xl overflow-hidden bg-slate-100 aspect-square hover:opacity-90 transition-opacity"
          >
            {m.mime_type?.startsWith('video/') ? (
              <video src={m.public_url} className="w-full h-full object-cover" />
            ) : (
              <img src={m.public_url} alt={m.file_name} className="w-full h-full object-cover" />
            )}
            {!expanded && i === 3 && hidden > 0 && (
              <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                <span className="text-white text-sm font-semibold">+{hidden}</span>
              </div>
            )}
          </a>
        ))}
      </div>
      {items.length > 4 && (
        <button
          onClick={() => setExpanded(e => !e)}
          className="mt-2 flex items-center gap-1 text-[11px] text-brand-green hover:text-brand-green/70 transition-colors"
        >
          {expanded ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
          {expanded ? 'Show less' : `Show all ${items.length} photos`}
        </button>
      )}
    </div>
  )
}

function ApproveForm({ orderId, onTransition, onBack }: { orderId: string; onTransition: () => void; onBack: () => void }) {
  const [notes,      setNotes]  = useState('')
  const [submitting, setSubmit] = useState(false)
  const [error,      setError]  = useState('')

  async function submit() {
    setSubmit(true); setError('')
    const res = await clientTransition({
      order_id: orderId,
      to_stage: 'SAMPLE_SHIPPED',
      metadata: { approval_notes: notes.trim() || undefined },
    })
    setSubmit(false)
    if (res.ok) onTransition()
    else setError(res.errors.join(', '))
  }

  return (
    <div className="border border-brand-green/30 rounded-xl p-4 bg-brand-green/5 space-y-3">
      <div className="flex items-start gap-2">
        <CheckCircle2 size={14} className="text-brand-green shrink-0 mt-0.5" />
        <div>
          <p className="text-xs font-semibold text-brand-green">Approve — Ship the Sample</p>
          <p className="text-[11px] text-gray-600 mt-0.5 leading-relaxed">
            The factory will ship the physical sample to GRACE. You'll get to hold it before bulk production begins.
          </p>
        </div>
      </div>
      <textarea
        className="textarea-field text-xs"
        rows={2}
        placeholder="Optional notes for the factory…"
        value={notes}
        onChange={e => setNotes(e.target.value)}
      />
      {error && <p className="text-xs text-red-500">{error}</p>}
      <div className="flex gap-2">
        <button onClick={onBack} className="btn-secondary flex-1 text-xs" disabled={submitting}>Back</button>
        <button onClick={submit} disabled={submitting} className="btn-primary flex-1 text-xs flex items-center justify-center gap-1.5">
          {submitting ? <Loader2 size={12} className="animate-spin" /> : <><CheckCircle2 size={12} /> Approve & Ship</>}
        </button>
      </div>
    </div>
  )
}

function ReviseForm({ orderId, onTransition, onBack }: { orderId: string; onTransition: () => void; onBack: () => void }) {
  const [notes,      setNotes]  = useState('')
  const [submitting, setSubmit] = useState(false)
  const [error,      setError]  = useState('')

  async function submit() {
    if (!notes.trim()) { setError('Please describe what needs to change.'); return }
    setSubmit(true); setError('')
    const res = await clientTransition({
      order_id: orderId,
      to_stage: 'FIRST_PIECE_IN_PRODUCTION',
      metadata: { revision_notes: notes.trim() },
    })
    setSubmit(false)
    if (res.ok) onTransition()
    else setError(res.errors.join(', '))
  }

  return (
    <div className="border border-amber-200 rounded-xl p-4 bg-amber-50/30 space-y-3">
      <div className="flex items-start gap-2">
        <AlertTriangle size={14} className="text-amber-500 shrink-0 mt-0.5" />
        <div>
          <p className="text-xs font-semibold text-amber-800">Request Changes</p>
          <p className="text-[11px] text-amber-700 mt-0.5 leading-relaxed">
            Be specific. The factory will revise and share updated photos for your approval.
          </p>
        </div>
      </div>
      <textarea
        className="textarea-field text-xs"
        rows={4}
        autoFocus
        placeholder="e.g. The shoulder seam sits 1.5 cm too wide. The collar rib needs to be tighter…"
        value={notes}
        onChange={e => setNotes(e.target.value)}
      />
      {error && <p className="text-xs text-red-500">{error}</p>}
      <div className="flex gap-2">
        <button onClick={onBack} className="btn-secondary flex-1 text-xs" disabled={submitting}>Back</button>
        <button onClick={submit} disabled={!notes.trim() || submitting} className="flex-1 text-xs px-4 py-2 rounded-lg font-medium bg-amber-500 hover:bg-amber-600 text-white transition-colors disabled:opacity-50">
          {submitting ? <Loader2 size={12} className="animate-spin mx-auto" /> : 'Request Changes'}
        </button>
      </div>
    </div>
  )
}

function DecisionStep({ orderId, media, onTransition }: { orderId: string; media: OrderMedia[]; onTransition: () => void }) {
  const [decision, setDecision] = useState<Decision>(null)

  if (decision === 'approve') return <ApproveForm orderId={orderId} onTransition={onTransition} onBack={() => setDecision(null)} />
  if (decision === 'revise')  return <ReviseForm  orderId={orderId} onTransition={onTransition} onBack={() => setDecision(null)} />

  return (
    <div className="space-y-4">
      <MediaGrid media={media} />

      <div className="space-y-2 pt-1">
        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest">Your Decision</p>

        <button
          onClick={() => setDecision('approve')}
          className="w-full flex items-center gap-3 p-3.5 rounded-xl border border-brand-green/30 bg-brand-green/5 hover:bg-brand-green/10 hover:border-brand-green/50 transition-all text-left group"
        >
          <div className="w-8 h-8 rounded-xl bg-brand-green/10 flex items-center justify-center shrink-0 group-hover:bg-brand-green/20 transition-colors">
            <CheckCircle2 size={15} className="text-brand-green" />
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-900">Approve — Ship the Sample</p>
            <p className="text-[11px] text-gray-500 mt-0.5">Looks good. Send the physical sample.</p>
          </div>
        </button>

        <button
          onClick={() => setDecision('revise')}
          className="w-full flex items-center gap-3 p-3.5 rounded-xl border border-amber-200 bg-amber-50/30 hover:bg-amber-50 hover:border-amber-300 transition-all text-left group"
        >
          <div className="w-8 h-8 rounded-xl bg-amber-100 flex items-center justify-center shrink-0 group-hover:bg-amber-200 transition-colors">
            <AlertTriangle size={15} className="text-amber-600" />
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-900">Request Changes</p>
            <p className="text-[11px] text-gray-500 mt-0.5">Something needs fixing before the sample ships.</p>
          </div>
        </button>
      </div>
    </div>
  )
}

export function isFirstPieceReviewStage(stage: ProductionStage | null): boolean {
  return stage === 'FIRST_PIECE_REVIEW'
}

export default function FirstPieceReviewPanel({ orderId, stage, media, onTransition }: Props) {
  if (stage !== 'FIRST_PIECE_REVIEW') return null

  return (
    <div className="card border-amber-200/50">
      <div className="flex items-center gap-2 mb-4">
        <div className="w-6 h-6 rounded-lg bg-amber-500 flex items-center justify-center shrink-0">
          <Camera size={11} className="text-white" />
        </div>
        <p className="text-xs font-semibold text-gray-900">Review First Sample</p>
        <span className="ml-auto text-[10px] font-medium px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full">
          Your Decision
        </span>
      </div>
      <DecisionStep orderId={orderId} media={media} onTransition={onTransition} />
    </div>
  )
}
