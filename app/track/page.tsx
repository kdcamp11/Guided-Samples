'use client'

import { useState, useEffect } from 'react'
import { Package } from 'lucide-react'
import { useAuth } from '@/lib/auth'
import SignIn from '@/components/SignIn'
import ClientProductionTracker from '@/components/client/ClientProductionTracker'
import ClientOrderDetail from '@/components/client/ClientOrderDetail'

export default function TrackPage() {
  const { user, loading, signOut } = useAuth()
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null)

  // After a successful Stripe payment, the user lands here with ?payment=X&session_id=Y.
  // Call the verify endpoint so the order is saved even if the webhook fired late.
  useEffect(() => {
    if (!user) return
    const params = new URLSearchParams(window.location.search)
    const sessionId = params.get('session_id')
    const payment = params.get('payment')
    if (!sessionId || !payment?.endsWith('_success')) return
    fetch(`/api/checkout/verify?session_id=${sessionId}`)
      .catch(() => {}) // silent — webhook is the primary path
    // Clean up the URL so refreshing doesn't re-trigger
    window.history.replaceState({}, '', '/track')
  }, [user])

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-brand-green flex items-center justify-center">
            <Package size={18} className="text-white" />
          </div>
          <div className="w-5 h-5 border-2 border-brand-green border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    )
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="w-full max-w-sm">
          <div className="text-center mb-8">
            <div className="w-10 h-10 rounded-xl bg-brand-green mx-auto flex items-center justify-center mb-3">
              <Package size={18} className="text-white" />
            </div>
            <h1 className="text-lg font-bold text-gray-900">Production Tracker</h1>
            <p className="text-sm text-gray-500 mt-1">Sign in to track your orders</p>
          </div>
          <SignIn />
        </div>
      </div>
    )
  }

  if (selectedOrderId) {
    return (
      <ClientOrderDetail
        orderId={selectedOrderId}
        onBack={() => setSelectedOrderId(null)}
      />
    )
  }

  return (
    <ClientProductionTracker
      userEmail={user.email}
      onSelectOrder={setSelectedOrderId}
      onSignOut={signOut}
    />
  )
}
