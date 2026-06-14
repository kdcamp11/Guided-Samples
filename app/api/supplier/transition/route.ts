/**
 * POST /api/supplier/transition
 *
 * Server-side authority for all supplier stage transitions.
 * Enforces:
 *   1. Caller is authenticated
 *   2. Order exists and is assigned to the caller's email
 *   3. The requested transition is in SUPPLIER_CONTROLLED_TRANSITIONS
 *   4. Delegates the actual write to workflowEngine.transitionStage()
 *      which runs its own validation (graph edges, required metadata).
 *
 * Suppliers never call transitionStage() directly — this route is the
 * only path for supplier-initiated writes to production_stage.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getRouteUser } from '@/lib/supabase-server'
import { transitionStage } from '@/lib/workflowEngine'
import { isSupplierControlledTransition } from '@/types/supplier'
import { isValidStage } from '@/lib/workflowEngine'
import type { ProductionStage } from '@/types/productionStages'

export async function POST(req: NextRequest) {
  // ── 1. Auth ─────────────────────────────────────────────────────────────────
  const { sb: supabase, user: session } = await getRouteUser(req)
  if (!supabase) {
    return NextResponse.json({ error: 'Service unavailable' }, { status: 503 })
  }
  if (!session) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
  }

  const supplierEmail = session.email
  if (!supplierEmail) {
    return NextResponse.json({ error: 'Supplier email not found in session' }, { status: 401 })
  }

  // ── 2. Parse request ────────────────────────────────────────────────────────
  let body: { order_id?: string; to_stage?: string; metadata?: Record<string, unknown> }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { order_id, to_stage, metadata = {} } = body

  if (!order_id || typeof order_id !== 'string') {
    return NextResponse.json({ error: 'order_id is required' }, { status: 400 })
  }
  if (!to_stage || !isValidStage(to_stage)) {
    return NextResponse.json({ error: `"${to_stage}" is not a valid production stage` }, { status: 400 })
  }

  const toStage = to_stage as ProductionStage

  // ── 3. Fetch order and verify assignment ────────────────────────────────────
  // Use service-level select so we can compare supplier_email regardless of
  // the RLS policy on the session (belt-and-suspenders).
  const { data: order, error: fetchErr } = await supabase
    .from('production_orders')
    .select('id, production_stage, supplier_email')
    .eq('id', order_id)
    .single()

  if (fetchErr || !order) {
    return NextResponse.json({ error: 'Production order not found' }, { status: 404 })
  }

  // ── 4. Verify supplier assignment ───────────────────────────────────────────
  if ((order.supplier_email as string | null)?.toLowerCase() !== supplierEmail.toLowerCase()) {
    return NextResponse.json(
      { error: 'You are not assigned to this production order' },
      { status: 403 },
    )
  }

  // ── 5. Verify transition is supplier-controlled ─────────────────────────────
  const fromStage = order.production_stage as ProductionStage | null
  if (!fromStage) {
    return NextResponse.json(
      { error: 'Order has not entered the production workflow yet' },
      { status: 422 },
    )
  }

  if (!isSupplierControlledTransition(fromStage, toStage)) {
    return NextResponse.json(
      {
        error: `Suppliers are not authorised to transition from ${fromStage} to ${toStage}. This stage is controlled by the client or the system.`,
      },
      { status: 403 },
    )
  }

  // ── 6. Delegate to workflow engine ──────────────────────────────────────────
  const result = await transitionStage(order_id, toStage, metadata, session.id, supabase)

  if (!result.ok) {
    const messages = result.errors.map(e => e.message)
    return NextResponse.json({ error: messages.join(' | ') }, { status: 422 })
  }

  return NextResponse.json({ order: result.order })
}
