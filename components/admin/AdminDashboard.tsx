'use client'

import { useState, useEffect, useCallback } from 'react'
import { Package, Filter, RefreshCw, AlertTriangle, ChevronDown, ChevronUp, Loader2, CheckCircle2, XCircle, Plus } from 'lucide-react'
import { listAllOrders, getOrderStageCounts, type StageCount } from '@/lib/adminPortal'
import { STAGE_LABELS, type ProductionStage } from '@/types/productionStages'
import type { ProductionOrder } from '@/types/production'
import { createClient } from '@/lib/supabase'

const NEEDS_ACTION_STAGES = new Set<ProductionStage>(['SAMPLE_SHIPPED', 'SAMPLE_DELIVERED', 'SHIPPED'])

interface Props {
  onSelectOrder: (id: string) => void
}

interface RecoverResult {
  status: string
  order_id?: string
  payment_type?: string
  user_email?: string
  error?: string
  metadata?: Record<string, string>
  note?: string
}

export default function AdminDashboard({ onSelectOrder }: Props) {
  const [orders,      setOrders]      = useState<ProductionOrder[]>([])
  const [stageCounts, setStageCounts] = useState<StageCount[]>([])
  const [stageFilter, setStageFilter] = useState<ProductionStage | ''>('')
  const [search,      setSearch]      = useState('')
  const [loading,     setLoading]     = useState(true)

  // Recover missing orders
  const [recoverOpen,    setRecoverOpen]    = useState(false)
  const [sessionIds,     setSessionIds]     = useState('')
  const [recoverLoading, setRecoverLoading] = useState(false)
  const [recoverResults, setRecoverResults] = useState<{ id: string; result: RecoverResult }[]>([])

  async function handleRecover() {
    const ids = sessionIds.split(/[\n,\s]+/).map(s => s.trim()).filter(Boolean)
    if (!ids.length) return
    setRecoverLoading(true)
    setRecoverResults([])
    const sb = createClient()
    const token = sb ? (await sb.auth.getSession()).data.session?.access_token : null
    const results: { id: string; result: RecoverResult }[] = []
    for (const id of ids) {
      try {
        const res = await fetch('/api/admin/recover-order', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ session_id: id }),
        })
        const data: RecoverResult = await res.json()
        results.push({ id, result: data })
      } catch (e) {
        results.push({ id, result: { status: 'error', error: String(e) } })
      }
    }
    setRecoverResults(results)
    setRecoverLoading(false)
    // Refresh the order list if anything was created
    if (results.some(r => r.result.status === 'created')) load()
  }

  const load = useCallback(async () => {
    setLoading(true)
    const [fetched, counts] = await Promise.all([
      listAllOrders({ stage: stageFilter || undefined }),
      getOrderStageCounts(),
    ])
    setOrders(fetched)
    setStageCounts(counts)
    setLoading(false)
  }, [stageFilter])

  useEffect(() => { load() }, [load])

  const visible = orders.filter(o => {
    if (!search) return true
    const q = search.toLowerCase()
    const email = (o as unknown as Record<string, unknown>).user_email as string ?? ''
    return (
      o.id.toLowerCase().includes(q) ||
      email.toLowerCase().includes(q) ||
      (o.supplier_email ?? '').toLowerCase().includes(q)
    )
  })

  const totalCount = stageCounts.reduce((s, c) => s + c.count, 0)

  return (
    <div className="space-y-6">

      {/* Recover missing orders */}
      <div className="border border-amber-200 rounded-xl bg-amber-50 overflow-hidden">
        <button
          onClick={() => setRecoverOpen(o => !o)}
          className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold text-amber-800 hover:bg-amber-100 transition-colors"
        >
          <span className="flex items-center gap-2">
            <Plus size={14} />
            Recover missing paid orders
          </span>
          {recoverOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>

        {recoverOpen && (
          <div className="px-4 pb-4 space-y-3">
            <p className="text-xs text-amber-700 leading-relaxed">
              Paste Stripe <strong>session IDs</strong> (cs_live_…) <strong>or event IDs</strong> (evt_…) — one per line or comma-separated.
              Find them in your Stripe dashboard under Events → click a <code>checkout.session.completed</code> event → copy the Event ID or Session ID.
            </p>
            <textarea
              className="w-full text-xs font-mono rounded-lg border border-amber-200 bg-white px-3 py-2 focus:outline-none focus:border-amber-400 resize-none"
              rows={4}
              placeholder={"evt_1TjONZGgztsco1z3KRMXAyef\ncs_live_abc123"}
              value={sessionIds}
              onChange={e => setSessionIds(e.target.value)}
            />
            <button
              onClick={handleRecover}
              disabled={recoverLoading || !sessionIds.trim()}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold disabled:opacity-50 transition-colors"
            >
              {recoverLoading ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />}
              {recoverLoading ? 'Recovering…' : 'Recover Orders'}
            </button>

            {recoverResults.length > 0 && (
              <div className="space-y-2">
                {recoverResults.map(({ id, result }) => (
                  <div
                    key={id}
                    className={`flex items-start gap-2 rounded-lg px-3 py-2 text-xs ${
                      result.status === 'created' ? 'bg-green-50 border border-green-200' :
                      result.status === 'already_exists' ? 'bg-blue-50 border border-blue-200' :
                      'bg-red-50 border border-red-200'
                    }`}
                  >
                    {result.status === 'created'
                      ? <CheckCircle2 size={13} className="text-green-600 shrink-0 mt-0.5" />
                      : result.status === 'already_exists'
                      ? <CheckCircle2 size={13} className="text-blue-500 shrink-0 mt-0.5" />
                      : <XCircle size={13} className="text-red-500 shrink-0 mt-0.5" />}
                    <div className="min-w-0">
                      <p className="font-mono text-[10px] text-gray-500 truncate">{id}</p>
                      <p className={`font-semibold ${
                        result.status === 'created' ? 'text-green-700' :
                        result.status === 'already_exists' ? 'text-blue-600' :
                        'text-red-600'
                      }`}>
                        {result.status === 'created'
                          ? `Created — ${result.payment_type} · ${result.user_email}`
                          : result.status === 'already_exists'
                          ? `Already exists (order ${result.order_id?.slice(0, 8)})`
                          : result.error ?? result.status}
                      </p>
                      {result.status === 'unrecognized_payment_type' && (
                        <p className="text-gray-500 mt-0.5">
                          payment_type in metadata: <span className="font-mono">{String(result.payment_type ?? 'null')}</span>
                          {result.note && ` — ${result.note}`}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Stage stat pills */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setStageFilter('')}
          className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
            stageFilter === ''
              ? 'bg-[#0A0A0A] text-white border-[#0A0A0A]'
              : 'bg-white text-gray-600 border-slate-200 hover:border-slate-300'
          }`}
        >
          All ({totalCount})
        </button>
        {stageCounts
          .filter(c => c.stage !== null)
          .sort((a, b) => b.count - a.count)
          .map(({ stage, count }) => (
            <button
              key={stage}
              onClick={() => setStageFilter(stage === stageFilter ? '' : stage!)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors flex items-center gap-1 ${
                stageFilter === stage
                  ? 'bg-[#0A0A0A] text-white border-[#0A0A0A]'
                  : NEEDS_ACTION_STAGES.has(stage!)
                  ? 'bg-amber-50 text-amber-700 border-amber-300 hover:border-amber-400'
                  : 'bg-white text-gray-600 border-slate-200 hover:border-slate-300'
              }`}
            >
              {NEEDS_ACTION_STAGES.has(stage!) && <AlertTriangle size={10} />}
              {STAGE_LABELS[stage!]} ({count})
            </button>
          ))}
      </div>

      {/* Search + controls */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Filter size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search by order ID or email…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="input-field pl-9 text-sm"
          />
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="btn-secondary flex items-center gap-1.5 text-sm"
        >
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {/* Orders table */}
      <div className="card overflow-hidden p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50">
              <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-4 py-3">Order ID</th>
              <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-4 py-3">Client</th>
              <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-4 py-3">Supplier</th>
              <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-4 py-3">Stage</th>
              <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-4 py-3">Updated</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {loading && (
              <tr>
                <td colSpan={5} className="text-center text-gray-400 py-12 text-sm">Loading orders…</td>
              </tr>
            )}
            {!loading && visible.length === 0 && (
              <tr>
                <td colSpan={5} className="text-center text-gray-400 py-12 text-sm">No orders found</td>
              </tr>
            )}
            {!loading && visible.map(order => {
              const needsAction = order.production_stage !== null &&
                order.production_stage !== undefined &&
                NEEDS_ACTION_STAGES.has(order.production_stage)
              const userEmail = (order as unknown as Record<string, unknown>).user_email as string ?? '—'
              return (
                <tr
                  key={order.id}
                  onClick={() => onSelectOrder(order.id)}
                  className={`cursor-pointer hover:bg-slate-50 transition-colors ${needsAction ? 'bg-amber-50/40' : ''}`}
                >
                  <td className="px-4 py-3 font-mono text-xs text-gray-700">
                    <span className="flex items-center gap-2">
                      {needsAction && <AlertTriangle size={12} className="text-amber-500 shrink-0" />}
                      <Package size={12} className="text-gray-400 shrink-0" />
                      {order.id.slice(0, 8)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-600">{userEmail}</td>
                  <td className="px-4 py-3 text-xs text-gray-600">
                    {order.supplier_email ?? <span className="text-gray-300">unassigned</span>}
                  </td>
                  <td className="px-4 py-3">
                    {order.production_stage ? (
                      <span className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full font-medium ${
                        needsAction ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600'
                      }`}>
                        {STAGE_LABELS[order.production_stage]}
                      </span>
                    ) : (
                      <span className="text-xs text-gray-300">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-400">
                    {new Date(order.updated_at).toLocaleDateString('en-US', {
                      month: 'short', day: 'numeric', year: 'numeric',
                    })}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
