'use client'

import { ArrowLeft } from 'lucide-react'
import { useRouter } from 'next/navigation'
import NotificationPreferences from '@/components/NotificationPreferences'

export default function SupplierSettingsPage() {
  const router = useRouter()
  return (
    <div className="min-h-screen bg-gray-50 px-4 py-8 max-w-lg mx-auto">
      <button
        onClick={() => router.back()}
        className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-700 mb-6"
      >
        <ArrowLeft size={13} /> Back
      </button>
      <h1 className="text-lg font-bold text-gray-900 mb-4">Settings</h1>
      <NotificationPreferences />
    </div>
  )
}
