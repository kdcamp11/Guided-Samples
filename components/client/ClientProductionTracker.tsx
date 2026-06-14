'use client'

import { useState, useEffect } from 'react'
import { Package, ChevronRight, Clock, Loader2, AlertCircle, RefreshCw, LogOut } from 'lucide-react'
import { STAGE_LABELS, stageProgress, type ProductionStage } from '@/types/productionStages'
import { clientCanAct } from '@/types/client'
import { listClientOrders } from '@/lib/clientPortal'
import { useRealtimeOrderList } from '@/lib/useRealtimeOrder'
import NotificationBell from '@/components/NotificationBell'
import type { ProductionOrder } from '@/types/production'

interface Props {
  userEmail:     string
  onSelectOrder: (orderId: string) => void
  onSignOut:     () => void
}

function formatDate(iso: string) {
  const d = new Date(iso)
  const diffH = (Date.now() - d.getTime()) / 3_600_000
  if (diffH < 1)  return 'Just now'
  if (diffH < 24) return `${Math.floor(diffH)}h ago`
  if (diffH < 48) return 'Yesterday'
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function StagePill({ stage }: { stage: ProductionStage | null }) {
  if (!stage) return <span className="text-[11px] text-gray-400">Pending</span>
  const needsAction = clientCanAct(stage)
  const isDelivered = stage === 'DELIVERED'
  const isCancelled = stage === 'CANCELLED'
  const isRevision  = stage === 'REVISION_REQUIRED'

  return (
    <span className={`inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full ${
      isDelivered ? 'bg-green-50 text-green-600' :
      isCancelled ? 'bg-red-50 text-red-500' :
      isRevision  ? 'bg-amber-50 text-amber-600' :
      needsAction ? 'bg-brand-green/10 text-brand-green' :
      'bg-slate-50 text-slate-500'
    }`}>
      {needsAction && <span className="w-1 h-1 rounded-full bg-brand-green animate-pulse" />}
      {STAGE_LABELS[stage]}
    </span>
  )
}

function OrderCard({ order, onSelect }: { order: ProductionOrder; onSelect: () => void }) {
  const progress    = stageProgress(order.production_stage ?? 'PRODUCTION_FILES_RECEIVED')
  const needsAction = clientCanAct(order.production_stage)
  const si          = order.tech_pack_snapshot?.style_info

  return (
    <button
      onClick={onSelect}
      className={`card w-full text-left hover:border-brand-green/30 hover:shadow-sm transition-all group ${
        needsAction ? 'border-brand-green/20' : ''
      }`}
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2.5">
          <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
            needsAction ? 'bg-brand-green/10' : 'bg-slate-100'
          }`}>
            <Package size={14} className={needsAction ? 'text-brand-green' : 'text-gray-400'} />
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-900 leading-tight">
              {si?.styleName ?? 'Untitled'}
            </p>
            <p className="text-[11px] text-gray-500">{si?.garmentType ?? '—'}</p>
          </div>
        </div>
        <ChevronRight size={15} className="text-gray-300 group-hover:text-brand-green transition-colors mt-1 shrink-0" />
      </div>

      <div className="w-full h-1 bg-slate-100 rounded-full mb-3">
        <div
          className={`h-full rounded-full transition-all ${
            order.production_stage === 'CANCELLED' ? 'bg-red-300' : 'bg-brand-green'
          }`}
          style={{ width: `${progress * 100}%` }}
        />
      </div>

      <div className="flex items-center justify-between">
        <StagePill stage={order.production_stage} />
        <span className="text-[10px] text-gray-400 flex items-center gap-1">
          <Clock size={9} />
          {formatDate(order.updated_at)}
        </span>
      </div>

      {needsAction && (
        <div className="mt-2.5 text-[11px] font-medium text-brand-green bg-brand-green/5 rounded-lg px-2.5 py-1.5">
          Your review needed
        </div>
      )}
    </button>
  )
}

export default function ClientProductionTracker({ userEmail, onSelectOrder, onSignOut }: Props) {
  const [orders,  setOrders]  = useState<ProductionOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState('')

  const load = async () => {
    setLoading(true)
    setError('')
    const data = await listClientOrders()
    if (data === null) {
      setError('Failed to load orders.')
    } else {
      setOrders(data)
    }
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  // Refresh list whenever any order changes (supplier actions, etc.)
  useRealtimeOrderList(load)

  const actionNeeded = orders.filter(o => clientCanAct(o.production_stage))
  const inProgress   = orders.filter(o => !clientCanAct(o.production_stage) && o.production_stage !== 'DELIVERED' && o.production_stage !== 'CANCELLED')
  const completed    = orders.filter(o => o.production_stage === 'DELIVERED' || o.production_stage === 'CANCELLED')

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="sticky top-0 z-10 bg-white border-b border-slate-200 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 rounded-lg bg-brand-green flex items-center justify-center">
            <Package size={13} className="text-white" />
          </div>
          <p className="text-sm font-bold text-gray-900">Production Tracker</p>
        </div>
        <div className="flex items-center gap-2">
          <NotificationBell userEmail={userEmail} />
          <button onClick={load} className="p-1.5 rounded-lg hover:bg-slate-100 text-gray-400 transition-colors">
            <RefreshCw size={13} />
          </button>
          <button
            onClick={onSignOut}
            className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-900 transition-colors px-2 py-1.5 rounded-lg hover:bg-slate-100"
          >
            <LogOut size={12} /> Sign out
          </button>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 py-8">
        <div className="mb-6">
          <h1 className="text-xl font-bold text-gray-900">Your Production Orders</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {loading ? 'Loading…' : `${orders.length} order${orders.length !== 1 ? 's' : ''}`}
          </p>
        </div>

        {loading && (
          <div className="flex justify-center py-20">
            <Loader2 size={28} className="animate-spin text-brand-green" />
          </div>
        )}

        {error && !loading && (
          <div className="card flex items-center gap-3 text-red-500 mb-4">
            <AlertCircle size={16} className="shrink-0" />
            <p className="text-sm">{error}</p>
          </div>
        )}

        {!loading && orders.length === 0 && !error && (
          <div className="card text-center py-16">
            <Package size={32} className="mx-auto text-gray-200 mb-3" />
            <p className="text-sm font-medium text-gray-500">No production orders yet</p>
            <p className="text-xs text-gray-400 mt-1">Orders appear here after your tech pack is approved and paid.</p>
          </div>
        )}

        {actionNeeded.length > 0 && (
          <section className="mb-6">
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-3">
              Your Review Needed ({actionNeeded.length})
            </h2>
            <div className="space-y-3">
              {actionNeeded.map(o => (
                <OrderCard key={o.id} order={o} onSelect={() => onSelectOrder(o.id)} />
              ))}
            </div>
          </section>
        )}

        {inProgress.length > 0 && (
          <section className="mb-6">
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-3">
              In Production ({inProgress.length})
            </h2>
            <div className="space-y-3">
              {inProgress.map(o => (
                <OrderCard key={o.id} order={o} onSelect={() => onSelectOrder(o.id)} />
              ))}
            </div>
          </section>
        )}

        {completed.length > 0 && (
          <section>
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-3">
              Completed ({completed.length})
            </h2>
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
