/**
 * POST /api/admin/note
 *
 * Appends an internal GRACE admin note to the order's audit log.
 * Notes are stored as production_order_events with event_type = 'admin_note'.
 * They are visible to admins only, never to clients or suppliers.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createRouteClient } from '@/lib/supabase'

function isAdmin(session: { user: { app_metadata?: Record<string, unknown> } }): boolean {
  return session.user.app_metadata?.role === 'admin'
}

export async function POST(req: NextRequest) {
  const sb = createRouteClient()
  if (!sb) return NextResponse.json({ ok: false, error: 'Service unavailable' }, { status: 503 })

  const { data: { session } } = await sb.auth.getSession()
  if (!session)          return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  if (!isAdmin(session)) return NextResponse.json({ ok: false, error: 'Admin access required' }, { status: 403 })

  const { order_id, note } = await req.json() as { order_id: string; note: string }

  if (!order_id || !note?.trim()) {
    return NextResponse.json({ ok: false, error: 'order_id and note are required' }, { status: 400 })
  }

  const { error } = await sb.from('production_order_events').insert({
    production_order_id: order_id,
    event_type:          'admin_note',
    metadata: {
      note:           note.trim(),
      admin_id:       session.user.id,
      admin_email:    session.user.email,
      transitioned_at: new Date().toISOString(),
    },
  })

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
