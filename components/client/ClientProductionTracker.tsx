'use client'

import { useState, useEffect, useRef } from 'react'
import { Package, ChevronRight, Loader2, AlertCircle, RefreshCw, LogOut, Settings, CheckCircle2 } from 'lucide-react'
import { clientCanAct } from '@/types/client'
import { listClientOrders } from '@/lib/clientPortal'
import { useRealtimeOrderList } from '@/lib/useRealtimeOrder'
import NotificationBell from '@/components/NotificationBell'
import {
  CLIENT_STAGE_LABELS,
  STAGE_RESPONSIBLE,
  RESPONSIBLE_LABELS,
  clientProgress,
} from '@/lib/clientStagePresentation'
import type { ProductionOrder } from '@/types/production'
import type { ProductionStage } from '@/types/productionStages'

interface Props {
  userEmail:     string
  onSelectOrder: (orderId: string) => void
  onSignOut:     () => void
}

function timeAgo(iso: string): string {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (m < 1)  return 'Just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

// ─── Order card ───────────────────────────────────────────────────────────────

function OrderCard({ order, onSelect }: { order: ProductionOrder; onSelect: () => void }) {
  const stage       = order.production_stage as ProductionStage | null
  const progress    = clientProgress(stage)
  const needsAction = clientCanAct(stage)
  const si          = order.tech_pack_snapshot?.style_info

  const label       = stage ? CLIENT_STAGE_LABELS[stage] : 'Getting started'
  const responsible = stage ? STAGE_RESPONSIBLE[stage] : 'factory'
  const resp        = RESPONSIBLE_LABELS[responsible]

  const isCancelled = stage === 'CANCELLED'
  const isDelivered = stage === 'DELIVERED'
  const isTerminal  = isCancelled || isDelivered

  return (
    <button
      onClick={onSelect}
      className={`w-full text-left bg-white rounded-2xl border transition-all hover:shadow-md hover:-translate-y-px active:translate-y-0 ${
        needsAction
          ? 'border-amber-200 shadow-sm shadow-amber-100/50'
          : isDelivered
          ? 'border-green-100'
          : isCancelled
          ? 'border-red-100 opacity-70'
          : 'border-slate-200'
      }`}
    >
      {/* Top: name + chevron */}
      <div className="flex items-start justify-between gap-3 px-4 pt-4 pb-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
            isDelivered  ? 'bg-green-100' :
            isCancelled  ? 'bg-red-50' :
            needsAction  ? 'bg-amber-100' :
            'bg-brand-green/10'
          }`}>
            <Package size={15} className={
              isDelivered  ? 'text-green-600' :
              isCancelled  ? 'text-red-400' :
              needsAction  ? 'text-amber-600' :
              'text-brand-green'
            } />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold text-gray-900 truncate leading-tight">
              {si?.styleName ?? 'Untitled'}
            </p>
            <p className="text-[11px] text-gray-400 mt-0.5">{si?.garmentType ?? '—'}</p>
          </div>
        </div>
        <ChevronRight size={15} className="text-gray-300 mt-1 shrink-0" />
      </div>

      {/* Progress bar */}
      {!isTerminal && (
        <div className="px-4 mb-3">
          <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-brand-green rounded-full transition-all duration-500"
              style={{ width: `${progress * 100}%` }}
            />
          </div>
        </div>
      )}

      {/* Bottom: status + time */}
      <div className={`flex items-center justify-between px-4 pb-4 ${isTerminal ? 'mt-1' : ''}`}>
        <div className="flex items-center gap-1.5">
          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${resp.dot}`} />
          <p className={`text-xs font-semibold ${resp.color}`}>{label}</p>
        </div>
        <p className="text-[10px] text-gray-400">{timeAgo(order.updated_at)}</p>
      </div>

      {/* Action needed banner */}
      {needsAction && (
        <div className="mx-4 mb-4 px-3 py-2 bg-amber-50 border border-amber-100 rounded-xl">
          <p className="text-[11px] font-semibold text-amber-700">👆 Your decision needed</p>
        </div>
      )}
    </button>
  )
}

// ─── Main dashboard ───────────────────────────────────────────────────────────

// Map the Stripe success redirect to a friendly confirmation message.
function paidContext(): { paid: boolean; label: string } {
  if (typeof window === 'undefined') return { paid: false, label: '' }
  const p = new URLSearchParams(window.location.search).get('payment') ?? ''
  switch (p) {
    case 'sample_success':  return { paid: true, label: 'Sample order confirmed' }
    case 'direct_success':  return { paid: true, label: 'Production order confirmed' }
    case 'deposit_success': return { paid: true, label: 'Production deposit confirmed' }
    case 'final_success':   return { paid: true, label: 'Final payment confirmed' }
    default:                return { paid: false, label: '' }
  }
}

export default function ClientProductionTracker({ userEmail, onSelectOrder, onSignOut }: Props) {
  const [orders,  setOrders]  = useState<ProductionOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState('')
  const [paid]                = useState(paidContext)
  const [confirming, setConfirming] = useState(paid.paid)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const load = async () => {
    setLoading(true)
    setError('')
    const data = await listClientOrders()
    if (data === null) setError('Failed to load orders.')
    else setOrders(data)
    setLoading(false)
  }

  useEffect(() => { load() }, [])
  useRealtimeOrderList(load)

  // After a Stripe redirect the webhook may take a moment to create/update the
  // order. Poll briefly until it shows up, then stop and clean the URL.
  useEffect(() => {
    if (!paid.paid) return
    let elapsed = 0
    pollRef.current = setInterval(async () => {
      elapsed += 2500
      const data = await listClientOrders()
      if (data && data.length > 0) {
        setOrders(data)
        setConfirming(false)
        if (pollRef.current) clearInterval(pollRef.current)
      } else if (elapsed >= 20000) {
        setConfirming(false)
        if (pollRef.current) clearInterval(pollRef.current)
      }
    }, 2500)
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [paid.paid])

  const actionNeeded = orders.filter(o => clientCanAct(o.production_stage))
  const inProgress   = orders.filter(o =>
    !clientCanAct(o.production_stage) &&
    o.production_stage !== 'DELIVERED' &&
    o.production_stage !== 'CANCELLED'
  )
  const completed = orders.filter(o =>
    o.production_stage === 'DELIVERED' || o.production_stage === 'CANCELLED'
  )

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-white border-b border-slate-200 px-5 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-brand-green flex items-center justify-center">
            <Package size={13} className="text-white" />
          </div>
          <p className="text-sm font-bold text-gray-900">My Orders</p>
        </div>
        <div className="flex items-center gap-1.5">
          <NotificationBell userEmail={userEmail} settingsHref="/track/settings" />
          <button onClick={load} className="p-1.5 rounded-lg hover:bg-slate-100 text-gray-400 transition-colors">
            <RefreshCw size={13} />
          </button>
          <a href="/track/settings" className="p-1.5 rounded-lg hover:bg-slate-100 text-gray-400 transition-colors">
            <Settings size={13} />
          </a>
          <button
            onClick={onSignOut}
            className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-900 transition-colors px-2 py-1.5 rounded-lg hover:bg-slate-100"
          >
            <LogOut size={12} /> Sign out
          </button>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 py-6">

        {/* Page heading */}
        <div className="mb-5">
          <h1 className="text-xl font-bold text-gray-900">Your Production Orders</h1>
          {!loading && (
            <p className="text-sm text-gray-500 mt-0.5">
              {orders.length === 0
                ? 'No orders yet'
                : `${orders.length} order${orders.length !== 1 ? 's' : ''}`}
            </p>
          )}
        </div>

        {/* Payment confirmation banner */}
        {paid.paid && (
          <div className="mb-5 bg-green-50 border border-green-100 rounded-2xl px-4 py-3 flex items-center gap-3">
            {confirming ? (
              <Loader2 size={18} className="animate-spin text-brand-green shrink-0" />
            ) : (
              <CheckCircle2 size={18} className="text-brand-green shrink-0" />
            )}
            <div>
              <p className="text-sm font-semibold text-gray-900">{paid.label}</p>
              <p className="text-xs text-gray-500 mt-0.5">
                {confirming
                  ? 'Payment received — setting up your order…'
                  : 'Your order is below. We’ll keep this page updated as it progresses.'}
              </p>
            </div>
          </div>
        )}

        {loading && (
          <div className="flex justify-center py-20">
            <Loader2 size={28} className="animate-spin text-brand-green" />
          </div>
        )}

        {error && !loading && (
          <div className="bg-white rounded-2xl border border-red-100 px-4 py-3 flex items-center gap-3 mb-4">
            <AlertCircle size={15} className="text-red-400 shrink-0" />
            <p className="text-sm text-red-500">{error}</p>
          </div>
        )}

        {!loading && orders.length === 0 && !error && (
          <div className="bg-white rounded-2xl border border-slate-200 text-center py-16 px-6">
            <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-3">
              <Package size={20} className="text-gray-300" />
            </div>
            <p className="text-sm font-semibold text-gray-700">No production orders yet</p>
            <p className="text-xs text-gray-400 mt-1 leading-relaxed">
              Orders appear here after your tech pack is approved and payment is confirmed.
            </p>
          </div>
        )}

        {/* Your action needed */}
        {actionNeeded.length > 0 && (
          <section className="mb-5">
            <p className="text-[10px] font-semibold text-amber-600 uppercase tracking-widest mb-2.5">
              Your Decision Needed ({actionNeeded.length})
            </p>
            <div className="space-y-3">
              {actionNeeded.map(o => (
                <OrderCard key={o.id} order={o} onSelect={() => onSelectOrder(o.id)} />
              ))}
            </div>
          </section>
        )}

        {/* In progress */}
        {inProgress.length > 0 && (
          <section className="mb-5">
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-2.5">
              In Progress ({inProgress.length})
            </p>
            <div className="space-y-3">
              {inProgress.map(o => (
                <OrderCard key={o.id} order={o} onSelect={() => onSelectOrder(o.id)} />
              ))}
            </div>
          </section>
        )}

        {/* Completed */}
        {completed.length > 0 && (
          <section>
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-2.5">
              Completed ({completed.length})
            </p>
            <div className="space-y-3">
              {completed.map(o => (
                <OrderCard key={o.id} order={o} onSelect={() => onSelectOrder(o.id)} />
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  )
}
