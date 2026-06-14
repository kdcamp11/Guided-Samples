/**
 * Production Hub — core type definitions
 *
 * These types describe the Production Order lifecycle that begins after a
 * Design Studio project reaches Tech Pack Approved (phase 6+).
 *
 * The Design Studio data model (AppState, TechPackData, Project) is never
 * mutated by the Production Hub — it only reads from it.
 */

// ─── Status lifecycle ─────────────────────────────────────────────────────────

/**
 * Ordered status progression for a production order.
 * Transitions are one-directional except for `cancelled`.
 *
 *   pending_payment → paid → in_production → quality_check → shipped → delivered
 *                                                                   ↘ cancelled (from any active state)
 */
export type ProductionOrderStatus =
  | 'pending_payment'  // Created; awaiting Stripe payment confirmation
  | 'paid'             // Payment confirmed; ready to send to factory
  | 'in_production'    // Factory has acknowledged and begun manufacturing
  | 'quality_check'    // Finished goods under inspection before shipment
  | 'shipped'          // Dispatched; tracking number available
  | 'delivered'        // Received by brand owner / confirmed
  | 'cancelled'        // Voided at any pre-delivery state

export const PRODUCTION_ORDER_STATUS_LABELS: Record<ProductionOrderStatus, string> = {
  pending_payment: 'Pending Payment',
  paid:            'Paid',
  in_production:   'In Production',
  quality_check:   'Quality Check',
  shipped:         'Shipped',
  delivered:       'Delivered',
  cancelled:       'Cancelled',
}

/** Statuses that allow the order to still be cancelled */
export const CANCELLABLE_STATUSES: ProductionOrderStatus[] = [
  'pending_payment',
  'paid',
  'in_production',
]

/** Terminal statuses — no further transitions allowed */
export const TERMINAL_STATUSES: ProductionOrderStatus[] = ['delivered', 'cancelled']

// ─── Pricing snapshot ─────────────────────────────────────────────────────────

/**
 * Immutable snapshot of the pricing applied at checkout time.
 * Stored inside the production_order row so that garment price changes
 * never retroactively affect existing orders.
 */
export type ProductionOrderPricing = {
  activation_fee_cents: number      // Always 10000 ($100.00)
  garment_price_cents:  number      // Per-garment-type price at order time
  extra_logo_count:     number      // Number of additional logo placements (beyond first)
  extra_logo_fee_cents: number      // extra_logo_count × 400
  total_cents:          number      // Sum of all line items
}

// ─── Tech Pack snapshot ───────────────────────────────────────────────────────

/**
 * Immutable copy of TechPackData captured at the moment the production
 * order is created.  The live tech_packs row may be edited by the designer
 * afterwards, but the factory works from this frozen snapshot.
 */
export type TechPackSnapshot = {
  style_info:   Record<string, string>
  measurements: Record<string, number[]>
  pantones:     { color: string; name: string }[]
  placements:   { location: string; description: string }[]
}

// ─── Production Order ─────────────────────────────────────────────────────────

/**
 * Full production order as returned from the database.
 */
export type ProductionOrder = {
  id:                    string
  design_order_id:       string           // FK → public.projects.id  (immutable after creation)
  user_id:               string           // FK → auth.users.id
  status:                ProductionOrderStatus

  /** Snapshot of pricing at checkout time */
  pricing:               ProductionOrderPricing

  /** Frozen copy of the tech pack used for this production run */
  tech_pack_snapshot:    TechPackSnapshot

  /** Stripe identifiers — populated after payment */
  stripe_session_id:     string | null
  stripe_payment_intent: string | null

  /** Supplier / logistics tracking */
  supplier_name:         string | null
  supplier_email:        string | null
  supplier_notes:        string | null
  tracking_number:       string | null
  carrier:               string | null

  /** Timestamps */
  created_at:  string
  updated_at:  string
  paid_at:     string | null
  shipped_at:  string | null
  delivered_at: string | null
}

// ─── Production Order Event (audit log) ──────────────────────────────────────

export type ProductionOrderEventType =
  | 'order_created'
  | 'payment_confirmed'
  | 'sent_to_factory'
  | 'production_started'
  | 'quality_check_passed'
  | 'quality_check_failed'
  | 'order_shipped'
  | 'order_delivered'
  | 'order_cancelled'
  | 'note_added'
  | 'status_overridden'

export type ProductionOrderEvent = {
  id:                  string
  production_order_id: string
  event_type:          ProductionOrderEventType
  /** Free-form metadata: stripe IDs, tracking info, notes, actor, etc. */
  metadata:            Record<string, unknown>
  created_at:          string
}

// ─── Service layer params ─────────────────────────────────────────────────────

/**
 * Parameters required to create a production order from a completed design order.
 * The service resolves design_order_id → tech_pack_snapshot internally.
 */
export type CreateProductionOrderParams = {
  design_order_id:  string   // Must reference a project with phase_reached >= 6 and an existing tech pack
  user_id:          string
  garment_type:     string
  extra_logo_count: number
  supplier_notes?:  string
}

/**
 * Result returned by createProductionOrder().
 */
export type CreateProductionOrderResult =
  | { ok: true;  order: ProductionOrder }
  | { ok: false; error: ProductionOrderError }

export type ProductionOrderError =
  | 'design_order_not_found'
  | 'tech_pack_not_found'
  | 'tech_pack_not_approved'   // phase_reached < 6
  | 'design_order_locked'      // already has a production order
  | 'database_error'
  | 'client_unavailable'       // Supabase client not initialised (SSR / missing env)
