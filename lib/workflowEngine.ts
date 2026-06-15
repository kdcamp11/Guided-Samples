/**
 * Production Hub — Workflow Engine
 *
 * Single entry point for all production stage transitions.
 * Enforces the transition graph, validates required metadata,
 * writes the stage to the database, and appends an immutable
 * audit event — all in a single call.
 *
 * Architecture principle: production_stage is the one canonical field.
 * No other field on production_orders encodes stage information.
 * All portals read from production_stage and never write it directly —
 * they go through this engine.
 */

import { createClient } from './supabase'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { ProductionOrder } from '@/types/production'
import type {
  ProductionStage,
  TransitionValidationResult,
  TransitionValidationError,
  StageTransitionEvent,
} from '@/types/productionStages'
import {
  PRODUCTION_STAGES,
  TRANSITION_GRAPH,
  TRANSITION_METADATA_REQUIREMENTS,
  TERMINAL_STAGES,
  STAGE_LABELS,
} from '@/types/productionStages'

// ─── Pure validation (no I/O) ─────────────────────────────────────────────────

/**
 * Validates whether a stage value is a member of the known stage set.
 */
export function isValidStage(value: string): value is ProductionStage {
  return (PRODUCTION_STAGES as readonly string[]).includes(value)
}

/**
 * Pure function: validates a proposed transition and its metadata.
 * Returns either { valid: true } or { valid: false, errors: [...] }.
 *
 * Intentionally I/O-free so it can be called in both client and server
 * contexts (e.g. to pre-validate a form before submission).
 */
export function validateTransition(
  from: ProductionStage,
  to: string,
  metadata: Record<string, unknown> = {},
): TransitionValidationResult {
  const errors: TransitionValidationError[] = []

  // 1. Validate the target stage is a known value
  if (!isValidStage(to)) {
    errors.push({
      code: 'INVALID_STAGE',
      message: `"${to}" is not a recognised production stage.`,
      value: to,
    })
    return { valid: false, errors }
  }

  const toStage = to as ProductionStage

  // 2. Cannot leave a terminal stage
  if (TERMINAL_STAGES.has(from)) {
    errors.push({
      code: 'TERMINAL_STAGE',
      message: `Cannot transition from ${STAGE_LABELS[from]} — it is a terminal stage.`,
    })
  }

  // 3. Target must be in the allowed edges for from-stage
  const allowed = TRANSITION_GRAPH[from] ?? []
  if (!allowed.includes(toStage)) {
    errors.push({
      code: 'DISALLOWED_TRANSITION',
      message: `Transition from ${STAGE_LABELS[from]} to ${STAGE_LABELS[toStage]} is not permitted.`,
      from,
      to: toStage,
    })
  }

  // 4. Check required metadata fields for the target stage
  const requirements = TRANSITION_METADATA_REQUIREMENTS[toStage] ?? []
  for (const field of requirements) {
    if (!field.required) continue
    const value = metadata[field.key]
    if (value === undefined || value === null || value === '') {
      errors.push({
        code: 'MISSING_METADATA',
        message: `"${field.label}" is required to enter ${STAGE_LABELS[toStage]}.`,
        field: field.key,
      })
    }
  }

  return errors.length === 0 ? { valid: true } : { valid: false, errors }
}

/**
 * Returns the list of stages that the given stage can legally transition to.
 * Useful for building UI action menus.
 */
export function availableTransitions(from: ProductionStage): ProductionStage[] {
  return TRANSITION_GRAPH[from] ?? []
}

// ─── Database helpers ─────────────────────────────────────────────────────────

/**
 * Columns on production_orders that should be auto-populated when entering
 * certain stages.  Keeps timestamp logic co-located with the transition spec.
 */
function stageTimestampColumns(stage: ProductionStage): Record<string, string> {
  const now = new Date().toISOString()
  const map: Partial<Record<ProductionStage, Record<string, string>>> = {
    SAMPLE_SHIPPED:  { sample_shipped_at: now },
    SAMPLE_DELIVERED:{ sample_delivered_at: now },
    SHIPPED:         { shipped_at: now },
    DELIVERED:       { delivered_at: now },
  }
  return map[stage] ?? {}
}

// ─── Core transition function ─────────────────────────────────────────────────

export type TransitionResult =
  | { ok: true;  order: ProductionOrder; event: StageTransitionEvent }
  | { ok: false; errors: TransitionValidationError[]; systemError?: string }

/**
 * Transitions a production order to a new stage.
 *
 * Steps:
 *   1. Fetch the current order (fails fast if not found)
 *   2. Validate the transition (pure, no I/O)
 *   3. Apply any metadata side-effects to the order row (tracking numbers etc.)
 *   4. Update production_stage on the order row
 *   5. Append an immutable stage_transition event to production_order_events
 *
 * Steps 4 and 5 are not wrapped in a DB transaction — Supabase JS client
 * does not expose explicit transactions.  If step 5 fails, the stage is
 * already advanced; the event can be replayed.  For strict atomicity,
 * promote to a Supabase RPC (see supabase/migrations/README.md).
 *
 * @param orderId  - UUID of the production order
 * @param toStage  - Target stage
 * @param metadata - Contextual data required or enriching the transition
 * @param actorId  - Optional user ID or service identifier for the audit log
 */
export async function transitionStage(
  orderId: string,
  toStage: ProductionStage,
  metadata: Record<string, unknown> = {},
  actorId?: string,
  // Server routes (no browser) inject an authenticated client; the browser
  // client returned by createClient() is null server-side.
  client?: SupabaseClient,
  // production_orders has no user_email column, so callers that know the
  // client's email (e.g. the Stripe webhook) can supply it for notifications.
  clientEmailOverride?: string | null,
): Promise<TransitionResult> {
  const supabase = client ?? createClient()
  if (!supabase) {
    return {
      ok: false,
      errors: [],
      systemError: 'Supabase client unavailable',
    }
  }

  // ── 1. Fetch current order ──────────────────────────────────────────────────
  const { data: row, error: fetchErr } = await supabase
    .from('production_orders')
    .select('*')
    .eq('id', orderId)
    .single()

  if (fetchErr || !row) {
    return {
      ok: false,
      errors: [],
      systemError: `Production order ${orderId} not found`,
    }
  }

  const fromStage = row.production_stage as ProductionStage | null

  // ── 2. Validate ─────────────────────────────────────────────────────────────
  if (!fromStage) {
    return {
      ok: false,
      errors: [],
      systemError: 'Order has no production_stage set. Assign the initial stage via enterProductionWorkflow() first.',
    }
  }

  const validation = validateTransition(fromStage, toStage, metadata)
  if (!validation.valid) {
    return { ok: false, errors: validation.errors }
  }

  // ── 3. Build update payload ─────────────────────────────────────────────────
  // Hoist well-known metadata fields onto top-level columns for queryability.
  const columnUpdates: Record<string, unknown> = {
    production_stage: toStage,
    ...stageTimestampColumns(toStage),
  }
  if (metadata.tracking_number)    columnUpdates.tracking_number = metadata.tracking_number
  if (metadata.carrier)            columnUpdates.carrier         = metadata.carrier
  if (metadata.revision_notes)     columnUpdates.revision_notes  = metadata.revision_notes

  // ── 4. Persist stage change ─────────────────────────────────────────────────
  const { data: updatedRow, error: updateErr } = await supabase
    .from('production_orders')
    .update(columnUpdates)
    .eq('id', orderId)
    .select()
    .single()

  if (updateErr || !updatedRow) {
    return {
      ok: false,
      errors: [],
      systemError: `Failed to update production stage: ${updateErr?.message}`,
    }
  }

  // ── 5. Append audit event ───────────────────────────────────────────────────
  const event: StageTransitionEvent = {
    from_stage:      fromStage,
    to_stage:        toStage,
    actor_id:        actorId,
    metadata,
    transitioned_at: new Date().toISOString(),
  }

  const { error: eventErr } = await supabase
    .from('production_order_events')
    .insert({
      production_order_id: orderId,
      event_type:          'stage_transition',
      metadata:            event,
    })

  if (eventErr) {
    // Log but do not fail — the stage update succeeded
    console.error('workflowEngine: audit event write failed', eventErr)
  }

  // ── 6. Fire notifications (non-blocking) ────────────────────────────────────
  const { triggerNotifications } = await import('@/lib/notifications')
  triggerNotifications({
    orderId,
    toStage,
    metadata,
    clientEmail:   clientEmailOverride ?? ((row as Record<string, unknown>).user_email as string | null),
    supplierEmail: (row as Record<string, unknown>).supplier_email as string | null,
    client:        supabase as unknown as import('@supabase/supabase-js').SupabaseClient,
  }).catch(err => console.error('workflowEngine: notification trigger failed', err))

  // Map updated DB row to ProductionOrder shape (reuse existing mapper pattern)
  const order = rowToProductionOrder(updatedRow as Record<string, unknown>)
  return { ok: true, order, event }
}

// ─── Initial stage assignment ─────────────────────────────────────────────────

/**
 * Sets the first production stage (PRODUCTION_FILES_RECEIVED) on a paid order.
 * Called by the Stripe webhook handler after payment confirmation, not by any
 * portal UI.
 *
 * Preconditions enforced here:
 *   - Order exists
 *   - status === 'paid'
 *   - production_stage is currently null (not already entered)
 */
export async function enterProductionWorkflow(
  orderId: string,
  actorId?: string,
): Promise<TransitionResult> {
  const supabase = createClient()
  if (!supabase) {
    return { ok: false, errors: [], systemError: 'Supabase client unavailable' }
  }

  const { data: row, error } = await supabase
    .from('production_orders')
    .select('id, status, production_stage, user_id, design_order_id')
    .eq('id', orderId)
    .single()

  if (error || !row) {
    return { ok: false, errors: [], systemError: `Order ${orderId} not found` }
  }

  if (row.status !== 'paid') {
    return {
      ok: false,
      errors: [{
        code: 'DISALLOWED_TRANSITION',
        message: 'Order must be in paid status before entering production workflow.',
        from: row.production_stage as ProductionStage,
        to: 'PRODUCTION_FILES_RECEIVED',
      }],
    }
  }

  if (row.production_stage !== null) {
    return {
      ok: false,
      errors: [],
      systemError: `Order is already in production stage: ${row.production_stage}`,
    }
  }

  const initialStage: ProductionStage = 'PRODUCTION_FILES_RECEIVED'
  const now = new Date().toISOString()

  const { data: updatedRow, error: updateErr } = await supabase
    .from('production_orders')
    .update({ production_stage: initialStage, production_started_at: now })
    .eq('id', orderId)
    .select()
    .single()

  if (updateErr || !updatedRow) {
    return {
      ok: false,
      errors: [],
      systemError: `Failed to enter production workflow: ${updateErr?.message}`,
    }
  }

  const event: StageTransitionEvent = {
    from_stage:      null,
    to_stage:        initialStage,
    actor_id:        actorId,
    metadata:        { trigger: 'payment_confirmed' },
    transitioned_at: now,
  }

  await supabase.from('production_order_events').insert({
    production_order_id: orderId,
    event_type:          'stage_transition',
    metadata:            event,
  })

  return {
    ok: true,
    order: rowToProductionOrder(updatedRow as Record<string, unknown>),
    event,
  }
}

// ─── Bulk query helpers ───────────────────────────────────────────────────────

/**
 * Returns all stage transition events for an order in chronological order.
 * Filters to only stage_transition event_type entries.
 */
export async function getStageHistory(
  orderId: string,
): Promise<StageTransitionEvent[]> {
  const supabase = createClient()
  if (!supabase) return []

  const { data, error } = await supabase
    .from('production_order_events')
    .select('metadata, created_at')
    .eq('production_order_id', orderId)
    .eq('event_type', 'stage_transition')
    .order('created_at', { ascending: true })

  if (error || !data) return []
  return data.map((row: { metadata: unknown }) => row.metadata as StageTransitionEvent)
}

/**
 * Returns all production orders currently at a given stage.
 * Useful for factory dashboards and internal operations views.
 */
export async function listOrdersByStage(
  stage: ProductionStage,
): Promise<ProductionOrder[]> {
  const supabase = createClient()
  if (!supabase) return []

  const { data, error } = await supabase
    .from('production_orders')
    .select('*')
    .eq('production_stage', stage)
    .order('updated_at', { ascending: true }) // oldest-first: most urgent first

  if (error || !data) return []
  return (data as Record<string, unknown>[]).map(rowToProductionOrder)
}

// ─── Row mapper ───────────────────────────────────────────────────────────────
// Duplicated from productionOrders.ts to avoid a circular import.
// If the ProductionOrder shape changes, update both.

import type {
  ProductionOrderStatus,
  ProductionOrderPricing,
  TechPackSnapshot,
} from '@/types/production'

function rowToProductionOrder(row: Record<string, unknown>): ProductionOrder { // eslint-disable-line @typescript-eslint/no-explicit-any
  return {
    id:                    row.id                    as string,
    design_order_id:       row.design_order_id       as string,
    user_id:               row.user_id               as string,
    status:                row.status                as ProductionOrderStatus,
    production_stage:      row.production_stage      as ProductionStage | null,
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
    sample_shipped_at:     row.sample_shipped_at     as string | null,
    sample_delivered_at:   row.sample_delivered_at   as string | null,
    production_started_at: row.production_started_at as string | null,
    shipped_at:            row.shipped_at            as string | null,
    delivered_at:          row.delivered_at          as string | null,
    production_path:           (row.production_path           as 'SAMPLE' | 'DIRECT' | null) ?? null,
    sample_fee_cents:          (row.sample_fee_cents          as number | null) ?? null,
    sample_stripe_session_id:  (row.sample_stripe_session_id  as string | null) ?? null,
    sample_paid_at:            (row.sample_paid_at            as string | null) ?? null,
    deposit_amount_cents:      (row.deposit_amount_cents      as number | null) ?? null,
    deposit_stripe_session_id: (row.deposit_stripe_session_id as string | null) ?? null,
    deposit_paid_at:           (row.deposit_paid_at           as string | null) ?? null,
    final_amount_cents:        (row.final_amount_cents        as number | null) ?? null,
    final_stripe_session_id:   (row.final_stripe_session_id   as string | null) ?? null,
    final_paid_at:             (row.final_paid_at             as string | null) ?? null,
  }
}
