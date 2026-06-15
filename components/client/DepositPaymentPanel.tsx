'use client'

import { useState } from 'react'
import { CreditCard, Loader2, ShieldCheck, Package } from 'lucide-react'

interface Props {
  orderId:       string
  depositAmount: number
  onSuccess:     () => void
}

export default function DepositPaymentPanel({ orderId, depositAmount }: Props) {
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState('')

  const formatted = (depositAmount / 100).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
  })

  async function handlePay() {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/checkout/production-deposit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order_id: orderId }),
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
        Your sample is approved. Pay the 50% production deposit to authorize your factory to begin the full bulk production run.
      </p>

      <div className="border border-slate-100 rounded-xl p-3 mb-4">
        <div className="flex justify-between items-center">
          <span className="text-xs text-gray-600">Production Deposit (50%)</span>
          <span className="text-sm font-semibold text-gray-900">{formatted}</span>
        </div>
        <p className="text-[10px] text-gray-400 mt-1">The remaining balance is due after quality check, before shipment</p>
      </div>

      {error && <p className="text-xs text-red-500 mb-3">{error}</p>}

      <button
        onClick={handlePay}
        disabled={loading}
        className="btn-primary w-full flex items-center justify-center gap-2 py-2.5"
      >
        {loading ? <Loader2 size={13} className="animate-spin"/> : <CreditCard size={13}/>}
        {loading ? 'Redirecting…' : 'Pay Deposit & Start Production'}
      </button>

      <div className="flex items-center justify-center gap-1.5 text-[10px] text-gray-400 mt-2">
        <ShieldCheck size={11}/>
        Secure checkout via Stripe
      </div>
    </div>
  )
}
