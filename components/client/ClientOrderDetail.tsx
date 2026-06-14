'use client'

import { useState, useEffect, useCallback } from 'react'
import { ArrowLeft, Package, RefreshCw, Loader2 } from 'lucide-react'
import { STAGE_LABELS, STAGE_DESCRIPTIONS, type ProductionStage } from '@/types/productionStages'
import { getClientOrder, getOrderMediaForClient, getStageHistory } from '@/lib/clientPortal'
import { createClient } from '@/lib/supabase'
import type { ProductionOrder } from '@/types/production'
import type { OrderMedia } from '@/types/supplier'
import type { StageTransitionEvent } from '@/types/productionStages'
import ClientTimeline from './ClientTimeline'
import ClientDecisionPanel from './ClientDecisionPanel'
import MediaGallery from './MediaGallery'

interface Props {
  orderId: string
  onBack:  () => void
}

function StageBadge({ stage }: { stage: ProductionStage | null }) {
  if (!stage) return null
  const isDelivered  = stage === 'DELIVERED'
  const isCancelled  = stage === 'CANCELLED'
  const isRevision   = stage === 'REVISION_REQUIRED'
  const needsAction  = !isDelivered && !isCancelled && !isRevision

  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1 rounded-full ${
      isDelivered ? 'bg-green-100 text-green-700' :
      isCancelled ? 'bg-red-100 text-red-600' :
      isRevision  ? 'bg-amber-100 text-amber-700' :
      'bg-brand-green/10 text-brand-green'
    }`}>
      <span className={`w-1.5 h-1.5 rounded-full ${
        isDelivered ? 'bg-green-500' :
        isCancelled ? 'bg-red-400' :
        isRevision  ? 'bg-amber-500' :
        needsAction ? 'bg-brand-green animate-pulse' :
        'bg-brand-green'
      }`} />
      {STAGE_LABELS[stage]}
    </span>
  )
}

function formatDate(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function ClientOrderDetail({ orderId, onBack }: Props) {
  const [order,   setOrder]   = useState<ProductionOrder | null>(null)
  const [media,   setMedia]   = useState<OrderMedia[]>([])
  const [history, setHistory] = useState<StageTransitionEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState('')

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

  // Real-time subscription
  useEffect(() => {
    const sb = createClient()
    if (!sb) return
    const channel = sb
      .channel(`order-${orderId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'production_orders', filter: `id=eq.${orderId}` },
        () => { load() },
      )
      .subscribe()
    return () => { sb.removeChannel(channel) }
  }, [orderId, load])

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

  const tp = order.tech_pack_snapshot
  const si = tp?.style_info

  return (
    <div className="p-6 w-full">
      <div className="mb-5 flex items-start justify-between">
        <div>
          <button onClick={onBack} className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-700 transition-colors mb-2">
            <ArrowLeft size={13} /> All orders
          </button>
          <h1 className="text-xl font-bold text-gray-900">{si?.styleName ?? 'Untitled'}</h1>
          <div className="flex items-center gap-3 mt-1.5">
            <StageBadge stage={order.production_stage} />
            {si?.garmentType && <span className="text-xs text-gray-400">{si.garmentType}</span>}
          </div>
        </div>
        <button
          onClick={load}
          className="p-2 rounded-lg hover:bg-slate-100 text-gray-400 hover:text-gray-700 transition-colors"
          title="Refresh"
        >
          <RefreshCw size={14} />
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-5">
        {/* Left column */}
        <div className="space-y-4">

          {/* Current stage info */}
          {order.production_stage && (
            <div className={`card ${
              order.production_stage === 'REVISION_REQUIRED'
                ? 'border-amber-200 bg-amber-50/40'
                : 'border-brand-green/20 bg-brand-green/5'
            }`}>
              <p className={`text-xs font-semibold mb-1 ${
                order.production_stage === 'REVISION_REQUIRED' ? 'text-amber-700' : 'text-brand-green'
              }`}>
                {STAGE_LABELS[order.production_stage]}
              </p>
              <p className="text-xs text-gray-600 leading-relaxed">
                {STAGE_DESCRIPTIONS[order.production_stage]}
              </p>
              {order.revision_notes && order.production_stage === 'REVISION_REQUIRED' && (
                <div className="mt-3 p-3 bg-white border border-amber-100 rounded-lg">
                  <p className="text-[11px] font-semibold text-amber-700 mb-1">Your Revision Notes</p>
                  <p className="text-xs text-amber-800 leading-relaxed">{order.revision_notes}</p>
                </div>
              )}
            </div>
          )}

          {/* Media gallery */}
          <MediaGallery media={media} />

          {/* Tech pack snapshot */}
          {si && (
            <div className="card">
              <div className="flex items-center gap-2 mb-4">
                <Package size={14} className="text-brand-green" />
                <p className="text-xs font-semibold text-gray-900">Order Details</p>
                <span className="text-[10px] text-gray-400 ml-auto">Locked at production start</span>
              </div>
              <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-xs">
                {([
                  ['Style Name',   si.styleName],
                  ['SKU',          si.sku],
                  ['Garment Type', si.garmentType],
                  ['Gender',       si.gender],
                  ['Size Range',   si.sizeRange],
                  ['Season',       si.season],
                ] as [string, string | undefined][]).filter(([, v]) => v).map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-2">
                    <span className="text-gray-400 shrink-0">{k}</span>
                    <span className="text-gray-700 text-right">{v}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Logistics */}
          {(order.tracking_number || order.carrier || order.sample_shipped_at || order.shipped_at) && (
            <div className="card">
              <p className="text-xs font-semibold text-gray-900 mb-3">Shipping & Logistics</p>
              <div className="space-y-2 text-xs">
                {order.tracking_number && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">Tracking Number</span>
                    <span className="text-gray-700 font-mono">{order.tracking_number}</span>
                  </div>
                )}
                {order.carrier && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">Carrier</span>
                    <span className="text-gray-700">{order.carrier}</span>
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
                    <span className="text-gray-500">Bulk Shipped</span>
                    <span className="text-gray-700">{formatDate(order.shipped_at)}</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Right column */}
        <div className="space-y-4">
          <ClientTimeline currentStage={order.production_stage} history={history} />
          <ClientDecisionPanel
            orderId={orderId}
            currentStage={order.production_stage}
            onTransition={load}
          />
        </div>
      </div>
    </div>
  )
}
