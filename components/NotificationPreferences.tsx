'use client'

/**
 * NotificationPreferences
 *
 * Settings panel for per-user notification preferences.
 * Shows a global email toggle and per-event overrides.
 */

import { useState, useEffect } from 'react'
import { Mail, Check, Loader2 } from 'lucide-react'
import { getPreferences, savePreferences } from '@/lib/notifications'
import type { NotificationPreferences, NotificationType } from '@/lib/notifications'

const ALL_TYPES: Array<{ type: NotificationType; label: string; description: string }> = [
  { type: 'first_piece_ready',  label: 'First Piece Ready',       description: 'When the factory completes the first sample' },
  { type: 'revision_requested', label: 'Revision Requested',      description: 'When the client requests sample changes' },
  { type: 'sample_shipped',     label: 'Sample Shipped',          description: 'When the sample is dispatched to you' },
  { type: 'sample_delivered',   label: 'Sample Delivered',        description: 'When the sample arrives at your location' },
  { type: 'bulk_approved',      label: 'Bulk Production Approved', description: 'When the client approves the sample' },
  { type: 'qc_passed',          label: 'QC in Progress',          description: 'When goods enter quality inspection' },
  { type: 'order_packed',       label: 'Order Packed',            description: 'When goods are packed for shipment' },
  { type: 'tracking_uploaded',  label: 'Tracking Uploaded',       description: 'When bulk shipment tracking is available' },
  { type: 'order_delivered',    label: 'Order Delivered',         description: 'When the order is confirmed delivered' },
  { type: 'order_cancelled',    label: 'Order Cancelled',         description: 'When an order is cancelled' },
]

function Toggle({
  checked,
  onChange,
  disabled,
}: {
  checked:  boolean
  onChange: (v: boolean) => void
  disabled?: boolean
}) {
  return (
    <button
      onClick={() => !disabled && onChange(!checked)}
      disabled={disabled}
      className={`relative inline-flex w-9 h-5 rounded-full transition-colors shrink-0 ${
        checked ? 'bg-brand-green' : 'bg-slate-200'
      } ${disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}
    >
      <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow-sm transition-transform ${
        checked ? 'translate-x-4' : 'translate-x-0'
      }`} />
    </button>
  )
}

export default function NotificationPreferences() {
  const [prefs,   setPrefs]   = useState<NotificationPreferences>({ email_enabled: true, email_overrides: {} })
  const [loading, setLoading] = useState(true)
  const [saving,  setSaving]  = useState(false)
  const [saved,   setSaved]   = useState(false)

  useEffect(() => {
    getPreferences().then(p => { setPrefs(p); setLoading(false) })
  }, [])

  async function save() {
    setSaving(true)
    setSaved(false)
    try {
      await savePreferences(prefs)
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } finally {
      setSaving(false)
    }
  }

  function setOverride(type: NotificationType, value: boolean) {
    setPrefs(p => ({
      ...p,
      email_overrides: { ...p.email_overrides, [type]: value },
    }))
  }

  function getEffectiveEmail(type: NotificationType): boolean {
    if (type in prefs.email_overrides) return !!prefs.email_overrides[type]
    return prefs.email_enabled
  }

  if (loading) {
    return (
      <div className="card flex items-center justify-center py-8">
        <Loader2 size={18} className="animate-spin text-gray-300" />
      </div>
    )
  }

  return (
    <div className="card space-y-5">
      <div>
        <p className="text-xs font-semibold text-gray-900 mb-0.5">Notification Preferences</p>
        <p className="text-[11px] text-gray-400">Control which production events trigger emails.</p>
      </div>

      {/* Global email toggle */}
      <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl">
        <div className="flex items-center gap-2.5">
          <Mail size={14} className="text-gray-500" />
          <div>
            <p className="text-xs font-medium text-gray-800">Email Notifications</p>
            <p className="text-[11px] text-gray-400">Master switch for all email alerts</p>
          </div>
        </div>
        <Toggle
          checked={prefs.email_enabled}
          onChange={v => setPrefs(p => ({ ...p, email_enabled: v }))}
        />
      </div>

      {/* Per-type overrides */}
      <div className="space-y-0 divide-y divide-slate-100">
        {ALL_TYPES.map(({ type, label, description }) => {
          const effective = getEffectiveEmail(type)
          const isOverridden = type in prefs.email_overrides
          return (
            <div key={type} className="flex items-center justify-between py-3 gap-3">
              <div className="min-w-0">
                <p className="text-xs font-medium text-gray-800 leading-tight">{label}</p>
                <p className="text-[11px] text-gray-400 mt-0.5">{description}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {isOverridden && (
                  <button
                    onClick={() => {
                      const next = { ...prefs.email_overrides }
                      delete next[type]
                      setPrefs(p => ({ ...p, email_overrides: next }))
                    }}
                    className="text-[10px] text-gray-400 hover:text-gray-600 underline"
                  >
                    reset
                  </button>
                )}
                <Toggle checked={effective} onChange={v => setOverride(type, v)} />
              </div>
            </div>
          )
        })}
      </div>

      <button
        onClick={save}
        disabled={saving}
        className="btn-primary w-full flex items-center justify-center gap-2 text-xs"
      >
        {saving ? (
          <><Loader2 size={12} className="animate-spin" /> Saving…</>
        ) : saved ? (
          <><Check size={12} /> Saved</>
        ) : (
          'Save Preferences'
        )}
      </button>
    </div>
  )
}
