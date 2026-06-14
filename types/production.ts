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

export type ProductionOrderStatus =
  | 'pending_payment'
  | 'paid'
  | 'in_production'
  | 'quality_check'
  | 'shipped'
  | 'delivered'
  | 'cancelled'

export const PRODUCTION_ORDER_STATUS_LABELS: Record<ProductionOrderStatus, string> = {
  pending_payment: 'Pending Payment',
  paid:            'Paid',
  in_production:   'In Production',
  quality_check:   'Quality Check',
  shipped:         'Shipped',
  delivered:       'Delivered',
  cancelled:       'Cancelled',
}

export const CANCELLABLE_STATUSES: ProductionOrderStatus[] = [
  'pending_payment',
  'paid',
  'in_production',
]

export const TERMINAL_STATUSES: ProductionOrderStatus[] = ['delivered', 'cancelled']

// ─── Pricing snapshot ─────────────────────────────────────────────────────────

export type ProductionOrderPricing = {
  activation_fee_cents: number
  garment_price_cents:  number
  extra_logo_count:     number
  extra_logo_fee_cents: number
  total_cents:          number
}

// ─── Tech Pack snapshot ───────────────────────────────────────────────────────

export type TechPackSnapshot = {
  style_info:   Record<string, string>
  measurements: Record<string, number[]>
  pantones:     { color: string; name: string }[]
  placements:   { location: string; description: string }[]
}

// ─── Production Order ─────────────────────────────────────────────────────────

export type ProductionOrder = {
  id:                    string
  design_order_id:       string
  user_id:               string

  status:                ProductionOrderStatus

  production_stage:      import('./productionStages').ProductionStage | null

  pricing:               ProductionOrderPricing

  tech_pack_snapshot:    TechPackSnapshot

  stripe_session_id:     string | null
  stripe_payment_intent: string | null

  supplier_name:         string | null
  supplier_email:        string | null
  supplier_notes:        string | null
  tracking_number:       string | null
  carrier:               string | null

  revision_notes:        string | null

  // Dual production path fields
  production_path:              'SAMPLE' | 'DIRECT' | null
  sample_fee_cents:             number | null
  sample_stripe_session_id:     string | null
  sample_paid_at:               string | null
  deposit_amount_cents:         number | null
  deposit_stripe_session_id:    string | null
  deposit_paid_at:              string | null
  final_amount_cents:           number | null
  final_stripe_session_id:      string | null
  final_paid_at:                string | null

  created_at:            string
  updated_at:            string
  paid_at:               string | null
  production_started_at: string | null
  sample_shipped_at:     string | null
  sample_delivered_at:   string | null
  shipped_at:            string | null
  delivered_at:          string | null
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
  metadata:            Record<string, unknown>
  created_at:          string
}

// ─── Service layer params ─────────────────────────────────────────────────────

export type CreateProductionOrderParams = {
  design_order_id:  string
  user_id:          string
  garment_type:     string
  extra_logo_count: number
  supplier_notes?:  string
}

export type CreateProductionOrderResult =
  | { ok: true;  order: ProductionOrder }
  | { ok: false; error: ProductionOrderError }

export type ProductionOrderError =
  | 'design_order_not_found'
  | 'tech_pack_not_found'
  | 'tech_pack_not_approved'
  | 'design_order_locked'
  | 'database_error'
  | 'client_unavailable'
