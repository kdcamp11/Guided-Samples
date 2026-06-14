'use client'

import { useState, useEffect, useCallback } from 'react'
import { ArrowLeft, RefreshCw, Loader2, Truck, Package, ChevronDown, ChevronUp } from 'lucide-react'
import { useAuth } from '@/lib/auth'
import type { ProductionStage } from '@/types/productionStages'
import { getClientOrder, getOrderMediaForClient, getStageHistory } from '@/lib/clientPortal'
import { useRealtimeOrder } from '@/lib/useRealtimeOrder'
import { useStageToasts, StageToastContainer } from '@/components/StageToast'
import {
  CLIENT_STAGE_LABELS,
  CLIENT_STAGE_MESSAGES,
  STAGE_RESPONSIBLE,
  RESPONSIBLE_LABELS,
} from '@/lib/clientStagePresentation'
import type { ProductionOrder } from '@/types/production'
import type { OrderMedia } from '@/types/supplier'
import type { StageTransitionEvent } from '@/types/productionStages'
import ClientTimeline from './ClientTimeline'
import ClientDecisionPanel from './ClientDecisionPanel'
import SampleEvaluationPanel, { isSampleEvaluationStage } from './SampleEvaluationPanel'
import FirstPieceReviewPanel, { isFirstPieceReviewStage } from './FirstPieceReviewPanel'
import MediaGallery from './MediaGallery'

interface Props {
  orderId: string
  onBack:  () => void
}

function formatDate(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

// ─── Hero status card ─────────────────────────────────────────────────────────

function StatusHero({ order }: { order: ProductionOrder }) {
  const stage = order.production_stage
  if (!stage) return null

  const isCancelled  = stage === 'CANCELLED'
  const isDelivered  = stage === 'DELIVERED'
  const isRevision   = stage === 'REVISION_REQUIRED'
  const responsible  = STAGE_RESPONSIBLE[stage]
  const resp         = RESPONSIBLE_LABELS[responsible]
  const label        = CLIENT_STAGE_LABELS[stage]
  const message      = CLIENT_STAGE_MESSAGES[stage]

  return (
    <div className={`rounded-2xl p-5 mb-5 ${
      isDelivered  ? 'bg-green-50 border border-green-100' :
      isCancelled  ? 'bg-red-50 border border-red-100' :
      isRevision   ? 'bg-amber-50 border border-amber-100' :
      responsible === 'you'
        ? 'bg-amber-50 border border-amber-100'
        : 'bg-brand-green/5 border border-brand-green/15'
    }`}>
      {/* Who's responsible */}
      <div className="flex items-center gap-1.5 mb-3">
        <span className={`w-2 h-2 rounded-full shrink-0 ${resp.dot}`} />
        <p className={`text-[11px] font-semibold uppercase tracking-wider ${resp.color}`}>
          {resp.label}
        </p>
      </div>

      {/* Current status */}
      <p className={`text-xl font-bold leading-tight mb-1 ${
        isCancelled ? 'text-red-700' :
        isRevision  ? 'text-amber-800' :
        responsible === 'you' ? 'text-amber-900' :
        'text-gray-900'
      }`}>
        {label}
      </p>
      <p className={`text-sm leading-relaxed ${
        isCancelled ? 'text-red-600' :
        isRevision  ? 'text-amber-700' :
        'text-gray-600'
      }`}>
        {message}
      </p>

      {/* Revision notes */}
      {isRevision && order.revision_notes && (
        <div className="mt-3 p-3 bg-white/70 rounded-lg border border-amber-100">
          <p className="text-[11px] font-semibold text-amber-700 mb-1">Your Requested Changes</p>
          <p className="text-xs text-amber-800 leading-relaxed">{order.revision_notes}</p>
        </div>
      )}
    </div>
  )
}

// ─── Tracking card ─────────────────────────────────────────────────────────────

function TrackingCard({ order }: { order: ProductionOrder }) {
  if (!order.tracking_number && !order.carrier) return null
  return (
    <div className="card mb-4">
      <div className="flex items-center gap-2 mb-3">
        <Truck size={14} className="text-brand-green" />
        <p className="text-xs font-semibold text-gray-900">Tracking</p>
      </div>
      <div className="space-y-2 text-xs">
        {order.carrier && (
          <div className="flex justify-between">
            <span className="text-gray-500">Carrier</span>
            <span className="text-gray-800 font-medium">{order.carrier}</span>
          </div>
        )}
        {order.tracking_number && (
          <div className="flex justify-between">
            <span className="text-gray-500">Tracking Number</span>
            <span className="text-gray-800 font-mono text-[11px]">{order.tracking_number}</span>
          </div>
        )}
        {order.sample_shipped_at && (
          <div className="flex justify-between">
            <span className="text-gray-500">Sample Shipped</span>
            <span className="text-gray-700">{formatDate(order.sample_shipped_at)}</span>
          </div>
        )}
        {order.shipped_at && (
          <div className="flex justify-between">
            <span className="text-gray-500">Order Shipped</span>
            <span className="text-gray-700">{formatDate(order.shipped_at)}</span>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Collapsible order details ─────────────────────────────────────────────────

function OrderDetailsCollapsible({ order }: { order: ProductionOrder }) {
  const [open, setOpen] = useState(false)
  const si = order.tech_pack_snapshot?.style_info
  if (!si) return null

  const details = [
    ['Style Name',   si.styleName],
    ['SKU',          si.sku],
    ['Garment Type', si.garmentType],
    ['Gender',       si.gender],
    ['Size Range',   si.sizeRange],
    ['Season',       si.season],
    ['Revision',     si.revision],
  ].filter(([, v]) => v) as [string, string][]

  if (details.length === 0) return null

  return (
    <div className="card mb-4">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between"
      >
        <div className="flex items-center gap-2">
          <Package size={13} className="text-gray-400" />
          <p className="text-xs font-semibold text-gray-700">Order Details</p>
        </div>
        {open
          ? <ChevronUp size={13} className="text-gray-400" />
          : <ChevronDown size={13} className="text-gray-400" />
        }
      </button>
      {open && (
        <div className="mt-3 pt-3 border-t border-slate-100 grid grid-cols-2 gap-x-6 gap-y-2 text-xs">
          {details.map(([k, v]) => (
            <div key={k} className="flex justify-between gap-2">
              <span className="text-gray-400 shrink-0">{k}</span>
              <span className="text-gray-700 text-right">{v}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function ClientOrderDetail({ orderId, onBack }: Props) {
  const { user }                        = useAuth()
  const [order,   setOrder]   = useState<ProductionOrder | null>(null)
  const [media,   setMedia]   = useState<OrderMedia[]>([])
  const [history, setHistory] = useState<StageTransitionEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState('')

  const { toasts, notify, dismiss } = useStageToasts()

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    const [ord, med, hist] = await Promise.all([
      getClientOrder(orderId),
      getOrderMediaForClient(orderId),
      getStageHistory(orderId),
    ])
    if (!ord) {
      setError('Order not found.')
    } else {
      setOrder(ord)
      setMedia(med)
      setHistory(hist)
    }
    setLoading(false)
  }, [orderId])

  useEffect(() => { load() }, [load])

  useRealtimeOrder({
    orderId,
    onOrderChange: load,
    onNewEvent:    (event) => notify(event, user?.id),
  })

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 size={28} className="animate-spin text-brand-green" />
      </div>
    )
  }

  if (error || !order) {
    return (
      <div className="p-6">
        <button onClick={onBack} className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-700 mb-6">
          <ArrowLeft size={14} /> Back
        </button>
        <div className="card text-center py-12">
          <p className="text-sm text-red-500">{error || 'Order unavailable.'}</p>
        </div>
      </div>
    )
  }

  const si    = order.tech_pack_snapshot?.style_info
  const stage = order.production_stage

  // Show tracking when the sample or order is in transit or delivered
  const showTracking = !!(
    order.tracking_number ||
    order.carrier ||
    order.sample_shipped_at ||
    order.shipped_at
  )

  // Show media only when it's relevant (after first piece is done)
  const showMedia = media.length > 0 && stage !== 'PRODUCTION_FILES_RECEIVED'

  return (
    <div className="min-h-screen bg-gray-50">
      <StageToastContainer toasts={toasts} onDismiss={dismiss} />

      {/* Sticky header */}
      <header className="sticky top-0 z-10 bg-white border-b border-slate-200 px-5 py-3 flex items-center justify-between">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-900 transition-colors"
        >
          <ArrowLeft size={13} /> All Orders
        </button>
        <p className="text-xs font-semibold text-gray-700 absolute left-1/2 -translate-x-1/2">
          {si?.styleName ?? 'Order'}
        </p>
        <button
          onClick={load}
          className="p-1.5 rounded-lg hover:bg-slate-100 text-gray-400 hover:text-gray-700 transition-colors"
        >
          <RefreshCw size={13} />
        </button>
      </header>

      <div className="max-w-2xl mx-auto px-4 py-6">

        {/* Hero status */}
        <StatusHero order={order} />

        {/* Two-column on large screens */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-5">

          {/* Left: actions + media + collapsible details */}
          <div className="space-y-4 order-2 lg:order-1">

            {/* First-piece media review (client approves before sample ships) */}
            {isFirstPieceReviewStage(stage) && (
              <FirstPieceReviewPanel
                orderId={orderId}
                stage={stage!}
                media={media}
                history={history}
                onTransition={load}
              />
            )}

            {/* Physical sample evaluation */}
            {isSampleEvaluationStage(stage) && (
              <SampleEvaluationPanel
                orderId={orderId}
                stage={stage!}
                media={media}
                onTransition={load}
              />
            )}

            {/* Other client actions */}
            {!isFirstPieceReviewStage(stage) && !isSampleEvaluationStage(stage) && (
              <ClientDecisionPanel
                orderId={orderId}
                currentStage={stage}
                onTransition={load}
              />
            )}

            {/* Tracking (surface prominently when available) */}
            {showTracking && <TrackingCard order={order} />}

            {/* Production photos — only when visible to client */}
            {showMedia && (
              <div>
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-2 px-0.5">
                  Production Photos
                </p>
                <MediaGallery media={media} />
              </div>
            )}

            {/* Order details — collapsed by default to reduce noise */}
            <OrderDetailsCollapsible order={order} />
          </div>

          {/* Right: timeline */}
          <div className="order-1 lg:order-2">
            <ClientTimeline currentStage={stage} history={history} />
          </div>
        </div>
      </div>
    </div>
  )
}
