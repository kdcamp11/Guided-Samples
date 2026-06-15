'use client'

import { useState } from 'react'
import { CreditCard, Loader2, ShieldCheck, Package, Minus, Plus } from 'lucide-react'
import {
  MIN_PRODUCTION_QUANTITY,
  MAX_PRODUCTION_QUANTITY,
  bulkSubtotalCents,
  depositCents,
  clampQuantity,
} from '@/lib/pricing'

interface Props {
  orderId:           string
  unitPriceCents:    number
  extraLogoFeeCents: number
  initialQuantity:   number
  onSuccess:         () => void
}

function money(cents: number) {
  return (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' })
}

export default function DepositPaymentPanel({
  orderId,
  unitPriceCents,
  extraLogoFeeCents,
  initialQuantity,
}: Props) {
  const [quantity, setQuantity] = useState(clampQuantity(initialQuantity || 1))
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState('')

  const subtotal = bulkSubtotalCents(unitPriceCents, extraLogoFeeCents, quantity)
  const deposit  = depositCents(subtotal)
  const perPiece = unitPriceCents + extraLogoFeeCents

  function adjust(delta: number) {
    setQuantity(q => clampQuantity(q + delta))
  }

  async function handlePay() {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/checkout/production-deposit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order_id: orderId, quantity }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Checkout failed')
      window.location.href = data.url
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Payment setup failed. Please try again.')
      setLoading(false)
    }
  }

  return (
    <div className="card border-amber-200/50">
      <div className="flex items-center gap-2 mb-4">
        <div className="w-6 h-6 rounded-lg bg-amber-500 flex items-center justify-center shrink-0">
          <Package size={11} className="text-white" />
        </div>
        <p className="text-xs font-semibold text-gray-900">Production Deposit Required</p>
        <span className="ml-auto text-[10px] font-medium px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full">
          Action Required
        </span>
      </div>

      <p className="text-[11px] text-gray-600 leading-relaxed mb-4">
        Your sample is approved. Choose how many pieces to manufacture, then pay the
        50% production deposit to authorize your factory to begin the full bulk run.
      </p>

      {/* Quantity selector */}
      <div className="border border-slate-100 rounded-xl p-3 mb-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-gray-900">Production Quantity</p>
            <p className="text-[10px] text-gray-400 mt-0.5">{money(perPiece)} per piece · {MIN_PRODUCTION_QUANTITY} pc minimum</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => adjust(-1)}
              disabled={quantity <= MIN_PRODUCTION_QUANTITY}
              className="w-7 h-7 rounded-lg border border-slate-200 flex items-center justify-center text-gray-600 hover:bg-slate-50 disabled:opacity-40 transition-colors"
              aria-label="Decrease quantity"
            >
              <Minus size={13} />
            </button>
            <input
              type="number"
              min={MIN_PRODUCTION_QUANTITY}
              max={MAX_PRODUCTION_QUANTITY}
              value={quantity}
              onChange={e => setQuantity(clampQuantity(e.target.value))}
              className="w-16 text-center text-sm font-semibold text-gray-900 border border-slate-200 rounded-lg py-1 focus:outline-none focus:border-brand-green"
            />
            <button
              onClick={() => adjust(1)}
              disabled={quantity >= MAX_PRODUCTION_QUANTITY}
              className="w-7 h-7 rounded-lg border border-slate-200 flex items-center justify-center text-gray-600 hover:bg-slate-50 disabled:opacity-40 transition-colors"
              aria-label="Increase quantity"
            >
              <Plus size={13} />
            </button>
          </div>
        </div>
      </div>

      {/* Cost breakdown */}
      <div className="border border-slate-100 rounded-xl p-3 mb-4 space-y-1.5">
        <div className="flex justify-between items-center text-xs text-gray-600">
          <span>Production Subtotal ({quantity} pc{quantity > 1 ? 's' : ''})</span>
          <span>{money(subtotal)}</span>
        </div>
        <div className="flex justify-between items-center border-t border-slate-100 pt-1.5">
          <span className="text-xs font-semibold text-gray-900">Deposit Due Today (50%)</span>
          <span className="text-sm font-semibold text-gray-900">{money(deposit)}</span>
        </div>
        <p className="text-[10px] text-gray-400">
          Remaining {money(subtotal - deposit)} due after quality check, before shipment
        </p>
      </div>

      {error && <p className="text-xs text-red-500 mb-3">{error}</p>}

      <button
        onClick={handlePay}
        disabled={loading}
        className="btn-primary w-full flex items-center justify-center gap-2 py-2.5"
      >
        {loading ? <Loader2 size={13} className="animate-spin"/> : <CreditCard size={13}/>}
        {loading ? 'Redirecting…' : `Pay ${money(deposit)} Deposit & Start Production`}
      </button>

      <div className="flex items-center justify-center gap-1.5 text-[10px] text-gray-400 mt-2">
        <ShieldCheck size={11}/>
        Secure checkout via Stripe
      </div>
    </div>
  )
}
