/**
 * POST /api/admin/reassign
 *
 * Reassigns a production order to a different supplier email.
 * Logs the change to the audit trail as an 'admin_reassign' event.
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

  const { order_id, supplier_email } = await req.json() as {
    order_id:       string
    supplier_email: string
  }

  if (!order_id || !supplier_email?.trim()) {
    return NextResponse.json({ ok: false, error: 'order_id and supplier_email required' }, { status: 400 })
  }

  // Fetch current value for audit record
  const { data: existing } = await sb
    .from('production_orders')
    .select('supplier_email')
    .eq('id', order_id)
    .single()

  const { error: updateErr } = await sb
    .from('production_orders')
    .update({ supplier_email: supplier_email.trim().toLowerCase() })
    .eq('id', order_id)

  if (updateErr) return NextResponse.json({ ok: false, error: updateErr.message }, { status: 500 })

  // Audit log
  await sb.from('production_order_events').insert({
    production_order_id: order_id,
    event_type:          'admin_reassign',
    metadata: {
      from_supplier:   existing?.supplier_email ?? null,
      to_supplier:     supplier_email.trim().toLowerCase(),
      admin_id:        session.user.id,
      admin_email:     session.user.email,
      transitioned_at: new Date().toISOString(),
    },
  })

  return NextResponse.json({ ok: true })
}
