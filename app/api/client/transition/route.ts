import { NextRequest, NextResponse } from 'next/server'
import { getRouteUser } from '@/lib/supabase-server'
import { transitionStage } from '@/lib/workflowEngine'
import { isClientControlledTransition } from '@/types/client'
import type { ProductionStage } from '@/types/productionStages'

export async function POST(req: NextRequest) {
  const { sb: supabase, user: session } = await getRouteUser(req)
  if (!supabase) {
    return NextResponse.json({ ok: false, errors: ['Service unavailable'] }, { status: 503 })
  }
  if (!session) {
    return NextResponse.json({ ok: false, errors: ['Unauthorized'] }, { status: 401 })
  }

  const body = await req.json()
  const { order_id, to_stage, metadata } = body as {
    order_id: string
    to_stage: ProductionStage
    metadata: Record<string, unknown>
  }

  const { data: order, error: fetchErr } = await supabase
    .from('production_orders')
    .select('id, user_id, production_stage')
    .eq('id', order_id)
    .single()

  if (fetchErr || !order) {
    return NextResponse.json({ ok: false, errors: ['Order not found'] }, { status: 404 })
  }

  if (order.user_id !== session.id) {
    return NextResponse.json({ ok: false, errors: ['Forbidden'] }, { status: 403 })
  }

  const fromStage = order.production_stage as ProductionStage | null
  if (!fromStage || !isClientControlledTransition(fromStage, to_stage)) {
    return NextResponse.json({ ok: false, errors: ['Transition not permitted'] }, { status: 403 })
  }

  // Clients may only request one revision on the first-piece photo review.
  // Check the audit log for any prior FIRST_PIECE_REVIEW → FIRST_PIECE_IN_PRODUCTION event.
  if (fromStage === 'FIRST_PIECE_REVIEW' && to_stage === 'FIRST_PIECE_IN_PRODUCTION') {
    const { data: events } = await supabase
      .from('production_order_events')
      .select('metadata')
      .eq('production_order_id', order_id)
      .eq('event_type', 'stage_transition')

    const alreadyRevised = (events ?? []).some((e: { metadata: unknown }) => {
      const m = e.metadata as Record<string, unknown>
      return m.from_stage === 'FIRST_PIECE_REVIEW' && m.to_stage === 'FIRST_PIECE_IN_PRODUCTION'
    })

    if (alreadyRevised) {
      return NextResponse.json(
        { ok: false, errors: ['You have already requested one change on this sample. Please approve or close the project.'] },
        { status: 403 },
      )
    }
  }

  const result = await transitionStage(order_id, to_stage, metadata, session.id, supabase)
  if (!result.ok) {
    const messages = result.errors.map(e => e.message)
    return NextResponse.json({ ok: false, errors: messages }, { status: 422 })
  }

  const { data: updated } = await supabase
    .from('production_orders')
    .select('*')
    .eq('id', order_id)
    .single()

  return NextResponse.json({ ok: true, order: updated })
}
