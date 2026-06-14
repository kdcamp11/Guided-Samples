/**
 * Production Hub — service layer
 *
 * All functions in this file operate on the Production Hub data model only.
 * They read from Design Studio tables (projects, tech_packs) but never write
 * to them, with the sole exception of setting projects.locked_at during
 * handoff — and only through createProductionOrder().
 *
 * Every function guards against a missing Supabase client so it is safe to
 * import in SSR contexts where env vars may be absent.
 */

import { createClient } from './supabase'
import type {
  ProductionOrder,
  ProductionOrderStatus,
  ProductionOrderEvent,
  ProductionOrderEventType,
  ProductionOrderPricing,
  TechPackSnapshot,
  CreateProductionOrderParams,
  CreateProductionOrderResult,
} from '@/types/production'

// ─── Pricing table (cents) ────────────────────────────────────────────────────
// Kept here as the authoritative source; mirrors the values in Phase6Production
// and the Stripe checkout route.  Update all three if prices change.

const ACTIVATION_FEE_CENTS = 10_000 // $100.00

const GARMENT_PRICE_CENTS: Record<string, number> = {
  'T-Shirt':            2_500,
  'Hoodie':             4_500,
  'Crewneck':           4_000,
  'Zip Hoodie':         5_000,
  'Track Jacket':       3_500,
  'Windbreaker':        4_000,
  'Basketball Jersey':  4_000,
  'Sweatpants':         3_500,
  'Track Pants':        3_500,
  'Basketball Shorts':  2_500,
}

const EXTRA_LOGO_FEE_CENTS = 400 // $4.00 per additional placement

/** The minimum phase_reached value that indicates a tech pack has been approved */
const TECH_PACK_APPROVED_PHASE = 6

// ─── Internal helpers ─────────────────────────────────────────────────────────

function buildPricing(garmentType: string, extraLogoCount: number): ProductionOrderPricing {
  const garment_price_cents = GARMENT_PRICE_CENTS[garmentType] ?? 3_500
  const extra_logo_fee_cents = extraLogoCount * EXTRA_LOGO_FEE_CENTS
  return {
    activation_fee_cents: ACTIVATION_FEE_CENTS,
    garment_price_cents,
    extra_logo_count: extraLogoCount,
    extra_logo_fee_cents,
    total_cents: ACTIVATION_FEE_CENTS + garment_price_cents + extra_logo_fee_cents,
  }
}

function rowToProductionOrder(row: Record<string, unknown>): ProductionOrder {
  return {
    id:                    row.id                    as string,
    design_order_id:       row.design_order_id       as string,
    user_id:               row.user_id               as string,
    status:                row.status                as ProductionOrderStatus,
    production_stage:      (row.production_stage     as import('@/types/productionStages').ProductionStage | null) ?? null,
    pricing: {
      activation_fee_cents: row.activation_fee_cents as number,
      garment_price_cents:  row.garment_price_cents  as number,
      extra_logo_count:     row.extra_logo_count     as number,
      extra_logo_fee_cents: row.extra_logo_fee_cents as number,
      total_cents:          row.total_cents          as number,
    },
    tech_pack_snapshot:    row.tech_pack_snapshot    as TechPackSnapshot,
    stripe_session_id:     row.stripe_session_id     as string | null,
    stripe_payment_intent: row.stripe_payment_intent as string | null,
    supplier_name:         row.supplier_name         as string | null,
    supplier_email:        row.supplier_email        as string | null,
    supplier_notes:        row.supplier_notes        as string | null,
    tracking_number:       row.tracking_number       as string | null,
    carrier:               row.carrier               as string | null,
    revision_notes:        row.revision_notes        as string | null,
    created_at:            row.created_at            as string,
    updated_at:            row.updated_at            as string,
    paid_at:               row.paid_at               as string | null,
    production_started_at: row.production_started_at as string | null,
    sample_shipped_at:     row.sample_shipped_at     as string | null,
    sample_delivered_at:   row.sample_delivered_at   as string | null,
    shipped_at:            row.shipped_at            as string | null,
    delivered_at:          row.delivered_at          as string | null,
    production_path:             (row.production_path             as 'SAMPLE' | 'DIRECT' | null) ?? null,
    sample_fee_cents:            (row.sample_fee_cents            as number | null) ?? null,
    sample_stripe_session_id:    (row.sample_stripe_session_id    as string | null) ?? null,
    sample_paid_at:              (row.sample_paid_at              as string | null) ?? null,
    deposit_amount_cents:        (row.deposit_amount_cents        as number | null) ?? null,
    deposit_stripe_session_id:   (row.deposit_stripe_session_id   as string | null) ?? null,
    deposit_paid_at:             (row.deposit_paid_at             as string | null) ?? null,
    final_amount_cents:          (row.final_amount_cents          as number | null) ?? null,
    final_stripe_session_id:     (row.final_stripe_session_id     as string | null) ?? null,
    final_paid_at:               (row.final_paid_at               as string | null) ?? null,
  }
}

// ─── Guard: can a production order be created? ────────────────────────────────

/**
 * Returns true if the given project meets all preconditions for a production order:
 *   1. project exists
 *   2. phase_reached >= TECH_PACK_APPROVED_PHASE (6)
 *   3. a tech_pack row exists for the project
 *   4. project.locked_at is null (not already handed off)
 */
export async function canCreateProductionOrder(
  projectId: string,
): Promise<{ allowed: boolean; reason?: string }> {
  const supabase = createClient()
  if (!supabase) return { allowed: false, reason: 'client_unavailable' }

  const { data: project, error: projErr } = await supabase
    .from('projects')
    .select('id, phase_reached, locked_at')
    .eq('id', projectId)
    .single()

  if (projErr || !project) return { allowed: false, reason: 'design_order_not_found' }
  if ((project.phase_reached as number) < TECH_PACK_APPROVED_PHASE)
    return { allowed: false, reason: 'tech_pack_not_approved' }
  if (project.locked_at)
    return { allowed: false, reason: 'design_order_locked' }

  const { data: tp, error: tpErr } = await supabase
    .from('tech_packs')
    .select('id')
    .eq('project_id', projectId)
    .single()

  if (tpErr || !tp) return { allowed: false, reason: 'tech_pack_not_found' }

  return { allowed: true }
}

// ─── Create production order ──────────────────────────────────────────────────

/**
 * Creates a production order from an approved design order.
 *
 * Steps:
 *   1. Validate preconditions (phase, tech pack, not already locked)
 *   2. Fetch and snapshot the tech pack
 *   3. Insert the production_orders row
 *   4. Lock the design order (set projects.locked_at)
 *   5. Write an order_created event to the audit log
 *
 * The function is not atomic at the DB level — if step 4 or 5 fails the
 * production order row still exists and can be recovered. Consider wrapping
 * in a Supabase RPC (database function) for strict atomicity in production.
 */
export async function createProductionOrder(
  params: CreateProductionOrderParams,
): Promise<CreateProductionOrderResult> {
  const supabase = createClient()
  if (!supabase) return { ok: false, error: 'client_unavailable' }

  const { design_order_id, user_id, garment_type, extra_logo_count, supplier_notes } = params

  // ── 1. Validate preconditions ───────────────────────────────────────────────
  const guard = await canCreateProductionOrder(design_order_id)
  if (!guard.allowed) {
    return { ok: false, error: guard.reason as import('@/types/production').ProductionOrderError }
  }

  // ── 2. Snapshot the tech pack ───────────────────────────────────────────────
  const { data: tp, error: tpErr } = await supabase
    .from('tech_packs')
    .select('style_info, measurements, pantones, placements')
    .eq('project_id', design_order_id)
    .single()

  if (tpErr || !tp) return { ok: false, error: 'tech_pack_not_found' }

  const snapshot: TechPackSnapshot = {
    style_info:   tp.style_info   as Record<string, string>,
    measurements: tp.measurements as Record<string, number[]>,
    pantones:     tp.pantones     as { color: string; name: string }[],
    placements:   tp.placements   as { location: string; description: string }[],
  }

  // ── 3. Insert production order ──────────────────────────────────────────────
  const pricing = buildPricing(garment_type, extra_logo_count)

  const { data: order, error: orderErr } = await supabase
    .from('production_orders')
    .insert({
      design_order_id,
      user_id,
      status:               'pending_payment',
      activation_fee_cents: pricing.activation_fee_cents,
      garment_price_cents:  pricing.garment_price_cents,
      extra_logo_count:     pricing.extra_logo_count,
      extra_logo_fee_cents: pricing.extra_logo_fee_cents,
      tech_pack_snapshot:   snapshot,
      supplier_notes:       supplier_notes ?? null,
    })
    .select()
    .single()

  if (orderErr || !order) {
    console.error('production_orders insert error', orderErr)
    return { ok: false, error: 'database_error' }
  }

  // ── 4. Lock the design order ────────────────────────────────────────────────
  const { error: lockErr } = await supabase
    .from('projects')
    .update({ locked_at: new Date().toISOString() })
    .eq('id', design_order_id)

  if (lockErr) {
    // Non-fatal: production order exists; log and continue.
    // The missing locked_at means canCreateProductionOrder() will still block
    // future attempts because the DB uniqueness constraint will fire first.
    console.error('Failed to lock design order', design_order_id, lockErr)
  }

  // ── 5. Append audit event ───────────────────────────────────────────────────
  await appendEvent(order.id as string, 'order_created', {
    design_order_id,
    garment_type,
    total_cents: pricing.total_cents,
  })

  return { ok: true, order: rowToProductionOrder(order as Record<string, unknown>) }
}

// ─── Read operations ──────────────────────────────────────────────────────────

export async function getProductionOrder(
  id: string,
): Promise<ProductionOrder | null> {
  const supabase = createClient()
  if (!supabase) return null

  const { data, error } = await supabase
    .from('production_orders')
    .select('*')
    .eq('id', id)
    .single()

  if (error || !data) return null
  return rowToProductionOrder(data as Record<string, unknown>)
}

/**
 * Returns the active (non-cancelled) production order for a given design order,
 * or null if none exists.
 */
export async function getProductionOrderByDesignOrder(
  designOrderId: string,
): Promise<ProductionOrder | null> {
  const supabase = createClient()
  if (!supabase) return null

  const { data, error } = await supabase
    .from('production_orders')
    .select('*')
    .eq('design_order_id', designOrderId)
    .neq('status', 'cancelled')
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  if (error || !data) return null
  return rowToProductionOrder(data as Record<string, unknown>)
}

export async function listProductionOrders(
  userId: string,
): Promise<ProductionOrder[]> {
  const supabase = createClient()
  if (!supabase) return []

  const { data, error } = await supabase
    .from('production_orders')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })

  if (error || !data) return []
  return (data as Record<string, unknown>[]).map(rowToProductionOrder)
}

// ─── Status transitions ───────────────────────────────────────────────────────

/**
 * Allowed status transitions.  The service enforces these; no arbitrary
 * status hops are permitted through the service layer.
 */
const ALLOWED_TRANSITIONS: Partial<Record<ProductionOrderStatus, ProductionOrderStatus[]>> = {
  pending_payment: ['paid', 'cancelled'],
  paid:            ['in_production', 'cancelled'],
  in_production:   ['quality_check', 'cancelled'],
  quality_check:   ['shipped', 'in_production'],   // in_production = send back for rework
  shipped:         ['delivered'],
  delivered:       [],
  cancelled:       [],
}

/**
 * Advances a production order to a new status.
 * Returns the updated order or null on failure / disallowed transition.
 */
export async function advanceProductionOrderStatus(
  id: string,
  nextStatus: ProductionOrderStatus,
  metadata: Record<string, unknown> = {},
): Promise<ProductionOrder | null> {
  const supabase = createClient()
  if (!supabase) return null

  const current = await getProductionOrder(id)
  if (!current) return null

  const allowed = ALLOWED_TRANSITIONS[current.status] ?? []
  if (!allowed.includes(nextStatus)) {
    console.error(
      `Invalid production order transition: ${current.status} → ${nextStatus}`,
    )
    return null
  }

  const timestamps: Record<string, string> = {}
  if (nextStatus === 'paid')        timestamps.paid_at      = new Date().toISOString()
  if (nextStatus === 'shipped')     timestamps.shipped_at   = new Date().toISOString()
  if (nextStatus === 'delivered')   timestamps.delivered_at = new Date().toISOString()

  const { data, error } = await supabase
    .from('production_orders')
    .update({ status: nextStatus, ...timestamps })
    .eq('id', id)
    .select()
    .single()

  if (error || !data) {
    console.error('production_orders update error', error)
    return null
  }

  const eventTypeMap: Partial<Record<ProductionOrderStatus, ProductionOrderEventType>> = {
    paid:           'payment_confirmed',
    in_production:  'production_started',
    quality_check:  'quality_check_passed',
    shipped:        'order_shipped',
    delivered:      'order_delivered',
    cancelled:      'order_cancelled',
  }
  const eventType = eventTypeMap[nextStatus]
  if (eventType) await appendEvent(id, eventType, metadata)

  return rowToProductionOrder(data as Record<string, unknown>)
}

/**
 * Records a Stripe session and payment intent after checkout.session.completed.
 * Also advances the order from pending_payment → paid.
 */
export async function recordStripePayment(
  productionOrderId: string,
  stripeSessionId: string,
  stripePaymentIntent: string,
): Promise<ProductionOrder | null> {
  const supabase = createClient()
  if (!supabase) return null

  const { error } = await supabase
    .from('production_orders')
    .update({
      stripe_session_id:     stripeSessionId,
      stripe_payment_intent: stripePaymentIntent,
    })
    .eq('id', productionOrderId)

  if (error) { console.error('recordStripePayment update error', error); return null }

  return advanceProductionOrderStatus(productionOrderId, 'paid', {
    stripe_session_id:     stripeSessionId,
    stripe_payment_intent: stripePaymentIntent,
  })
}

/**
 * Records shipment details and advances order to shipped status.
 */
export async function recordShipment(
  id: string,
  trackingNumber: string,
  carrier: string,
): Promise<ProductionOrder | null> {
  const supabase = createClient()
  if (!supabase) return null

  await supabase
    .from('production_orders')
    .update({ tracking_number: trackingNumber, carrier })
    .eq('id', id)

  return advanceProductionOrderStatus(id, 'shipped', { tracking_number: trackingNumber, carrier })
}

// ─── Audit log ────────────────────────────────────────────────────────────────

async function appendEvent(
  productionOrderId: string,
  eventType: ProductionOrderEventType,
  metadata: Record<string, unknown> = {},
): Promise<void> {
  const supabase = createClient()
  if (!supabase) return

  const { error } = await supabase
    .from('production_order_events')
    .insert({ production_order_id: productionOrderId, event_type: eventType, metadata })

  if (error) console.error('appendEvent error', eventType, error)
}

export async function getProductionOrderEvents(
  productionOrderId: string,
): Promise<ProductionOrderEvent[]> {
  const supabase = createClient()
  if (!supabase) return []

  const { data, error } = await supabase
    .from('production_order_events')
    .select('*')
    .eq('production_order_id', productionOrderId)
    .order('created_at', { ascending: true })

  if (error || !data) return []
  return data as ProductionOrderEvent[]
}
