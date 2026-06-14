/**
 * POST /api/admin/transition
 *
 * GRACE admin stage override.  Admins can advance any order to any valid
 * next stage — they are not bound by supplier/client permission checks.
 * The transition engine still validates the graph edge and required metadata.
 *
 * Primary use-cases:
 *   SAMPLE_SHIPPED  → SAMPLE_DELIVERED  (confirm physical sample delivery)
 *   SAMPLE_DELIVERED → CLIENT_SAMPLE_EVALUATION (open for client review)
 *   SHIPPED         → DELIVERED         (confirm bulk delivery)
 *   Any stage       → CANCELLED         (escalation)
 */

import { NextRequest, NextResponse } from 'next/server'
import { getRouteUser } from '@/lib/supabase-server'
import { transitionStage, isValidStage } from '@/lib/workflowEngine'
import type { ProductionStage } from '@/types/productionStages'

function isAdmin(session: { app_metadata?: Record<string, unknown> }): boolean {
  return session.app_metadata?.role === 'admin'
}

export async function POST(req: NextRequest) {
  const { sb, user: session } = await getRouteUser(req)
  if (!sb) return NextResponse.json({ ok: false, error: 'Service unavailable' }, { status: 503 })
  if (!session) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  if (!isAdmin(session)) return NextResponse.json({ ok: false, error: 'Admin access required' }, { status: 403 })

  const body = await req.json() as {
    order_id: string
    to_stage: string
    metadata: Record<string, unknown>
  }

  const { order_id, to_stage, metadata = {} } = body

  if (!order_id) return NextResponse.json({ ok: false, error: 'order_id required' }, { status: 400 })
  if (!isValidStage(to_stage)) return NextResponse.json({ ok: false, error: `Invalid stage: ${to_stage}` }, { status: 400 })

  const result = await transitionStage(
    order_id,
    to_stage as ProductionStage,
    { ...metadata, admin_override: true },
    session.id,
    sb,
  )

  if (!result.ok) {
    const msg = result.errors.length > 0
      ? result.errors.map(e => e.message).join(' | ')
      : result.systemError
    return NextResponse.json({ ok: false, error: msg }, { status: 422 })
  }

  return NextResponse.json({ ok: true, order: result.order })
}
