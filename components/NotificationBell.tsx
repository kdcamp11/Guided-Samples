'use client'

/**
 * NotificationBell
 *
 * Bell icon with unread badge that opens a notification center dropdown.
 * Subscribes to Supabase Realtime so new notifications appear immediately
 * without a page refresh.
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import { Bell, Check, CheckCheck, Package, Loader2, Settings } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { listNotifications, markAllRead, markRead } from '@/lib/notifications'
import type { InAppNotification, NotificationType } from '@/lib/notifications'

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diffMs / 60000)
  if (m < 1)  return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

// ─── Icon per type ────────────────────────────────────────────────────────────

const TYPE_COLORS: Record<NotificationType, string> = {
  first_piece_ready:    'bg-brand-green/10 text-brand-green',
  first_piece_revision: 'bg-amber-100 text-amber-600',
  revision_requested:   'bg-amber-100 text-amber-600',
  sample_shipped:     'bg-blue-50 text-blue-500',
  sample_delivered:   'bg-blue-50 text-blue-600',
  bulk_approved:      'bg-brand-green/10 text-brand-green',
  tracking_uploaded:  'bg-blue-50 text-blue-500',
  order_delivered:    'bg-green-100 text-green-600',
  order_cancelled:    'bg-red-50 text-red-500',
  qc_passed:          'bg-brand-green/10 text-brand-green',
  order_packed:       'bg-brand-green/10 text-brand-green',
}

// ─── Single notification row ──────────────────────────────────────────────────

function NotificationRow({
  n,
  onRead,
}: {
  n:      InAppNotification
  onRead: (id: string) => void
}) {
  return (
    <button
      onClick={() => !n.is_read && onRead(n.id)}
      className={`w-full text-left px-4 py-3 hover:bg-slate-50 transition-colors border-b border-slate-100 last:border-0 ${
        n.is_read ? 'opacity-60' : ''
      }`}
    >
      <div className="flex items-start gap-3">
        <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${
          TYPE_COLORS[n.type] ?? 'bg-slate-100 text-gray-400'
        }`}>
          <Package size={12} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <p className={`text-xs font-semibold leading-tight ${n.is_read ? 'text-gray-500' : 'text-gray-900'}`}>
              {n.title}
            </p>
            {!n.is_read && (
              <span className="w-1.5 h-1.5 rounded-full bg-brand-green shrink-0 mt-1" />
            )}
          </div>
          <p className="text-[11px] text-gray-500 mt-0.5 leading-relaxed line-clamp-2">{n.body}</p>
          <p className="text-[10px] text-gray-400 mt-1">
            {timeAgo(n.created_at)}
          </p>
        </div>
      </div>
    </button>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

interface Props {
  /** Pass user email so realtime filter works */
  userEmail:    string
  /** Link to the settings page — defaults to relative ./settings */
  settingsHref?: string
}

export default function NotificationBell({ userEmail, settingsHref = './settings' }: Props) {
  const [open,          setOpen]          = useState(false)
  const [notifications, setNotifications] = useState<InAppNotification[]>([])
  const [loading,       setLoading]       = useState(true)
  const panelRef = useRef<HTMLDivElement>(null)

  const unreadCount = notifications.filter(n => !n.is_read).length

  const load = useCallback(async () => {
    setLoading(true)
    const data = await listNotifications(40)
    setNotifications(data)
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  // Realtime: new notifications arrive live
  useEffect(() => {
    const sb = createClient()
    if (!sb) return
    const channel = sb
      .channel(`notifications-${userEmail}`)
      .on(
        'postgres_changes',
        {
          event:  'INSERT',
          schema: 'public',
          table:  'notifications',
          filter: `recipient_email=eq.${userEmail}`,
        },
        () => { load() },
      )
      .subscribe()
    return () => { sb.removeChannel(channel) }
  }, [userEmail, load])

  // Close on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    if (open) document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  async function handleMarkAllRead() {
    await markAllRead()
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })))
  }

  async function handleMarkRead(id: string) {
    await markRead(id)
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n))
  }

  return (
    <div className="relative" ref={panelRef}>
      <button
        onClick={() => setOpen(o => !o)}
        className="relative p-1.5 rounded-lg hover:bg-slate-100 text-gray-400 hover:text-gray-700 transition-colors"
        aria-label="Notifications"
      >
        <Bell size={15} />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-brand-green text-white text-[9px] font-bold flex items-center justify-center leading-none">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-white border border-slate-200 rounded-2xl shadow-xl z-50 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
            <p className="text-xs font-semibold text-gray-900">Notifications</p>
            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllRead}
                className="flex items-center gap-1 text-[11px] text-brand-green hover:text-brand-green/70 transition-colors"
              >
                <CheckCheck size={11} />
                Mark all read
              </button>
            )}
          </div>

          {/* List */}
          <div className="max-h-96 overflow-y-auto">
            {loading ? (
              <div className="flex justify-center py-8">
                <Loader2 size={18} className="animate-spin text-gray-300" />
              </div>
            ) : notifications.length === 0 ? (
              <div className="text-center py-10 px-4">
                <Bell size={24} className="mx-auto text-gray-200 mb-2" />
                <p className="text-xs text-gray-400">No notifications yet</p>
              </div>
            ) : (
              notifications.map(n => (
                <NotificationRow key={n.id} n={n} onRead={handleMarkRead} />
              ))
            )}
          </div>

          <div className="px-4 py-2.5 border-t border-slate-100 flex items-center justify-between">
            <p className="text-[10px] text-gray-400">
              {unreadCount === 0
                ? <span className="flex items-center gap-1"><Check size={10} /> All caught up</span>
                : `${unreadCount} unread`
              }
            </p>
            <a
              href={settingsHref}
              className="flex items-center gap-1 text-[11px] text-gray-400 hover:text-gray-700 transition-colors"
              onClick={() => setOpen(false)}
            >
              <Settings size={10} /> Preferences
            </a>
          </div>
        </div>
      )}
    </div>
  )
}
