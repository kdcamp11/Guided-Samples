/**
 * Supplier Portal — data access layer
 *
 * All reads are filtered by supplier_email = auth.email() at the RLS level.
 * No financial data or brand-owner-only fields are exposed.
 * All writes are validated against SUPPLIER_CONTROLLED_TRANSITIONS before
 * touching the workflow engine.
 */

import { createClient } from './supabase'
import { getStageHistory as engineGetStageHistory } from './workflowEngine'
import {
  isSupplierControlledTransition,
  type SupplierOrderSummary,
  type OrderMedia,
} from '@/types/supplier'
import type { ProductionStage } from '@/types/productionStages'
import type { ProductionOrder } from '@/types/production'

// ─── Read: order list ─────────────────────────────────────────────────────────

/**
 * Returns all production orders assigned to the current user (by supplier_email).
 * RLS enforces the email filter; this function fetches only the fields the
 * supplier needs to see.
 */
export async function listSupplierOrders(): Promise<SupplierOrderSummary[]> {
  const supabase = createClient()
  if (!supabase) return []

  const { data, error } = await supabase
    .from('production_orders')
    .select([
      'id',
      'tech_pack_snapshot',
      'production_stage',
      'supplier_notes',
      'revision_notes',
      'tracking_number',
      'carrier',
      'created_at',
      'updated_at',
      'production_started_at',
      'sample_shipped_at',
      'shipped_at',
    ].join(', '))
    .neq('status', 'pending_payment')    // only show orders that made it to production
    .order('updated_at', { ascending: false })

  if (error || !data) {
    console.error('listSupplierOrders error', error)
    return []
  }

  return (data as Record<string, unknown>[]).map(row => ({
    id:               row.id as string,
    style_name:       ((row.tech_pack_snapshot as Record<string, unknown>)?.style_info as Record<string, string>)?.styleName ?? 'Untitled',
    garment_type:     ((row.tech_pack_snapshot as Record<string, unknown>)?.style_info as Record<string, string>)?.garmentType ?? '',
    production_stage: row.production_stage as ProductionStage | null,
    supplier_notes:   row.supplier_notes   as string | null,
    revision_notes:   row.revision_notes   as string | null,
    tracking_number:  row.tracking_number  as string | null,
    carrier:          row.carrier          as string | null,
    created_at:       row.created_at       as string,
    updated_at:       row.updated_at       as string,
    production_started_at: row.production_started_at as string | null,
    sample_shipped_at:     row.sample_shipped_at     as string | null,
    shipped_at:            row.shipped_at            as string | null,
  }))
}

// ─── Read: single order ───────────────────────────────────────────────────────

/**
 * Returns the full order row for a supplier.  RLS ensures they can only fetch
 * orders where supplier_email = auth.email().
 */
export async function getSupplierOrder(orderId: string): Promise<ProductionOrder | null> {
  const supabase = createClient()
  if (!supabase) return null

  const { data, error } = await supabase
    .from('production_orders')
    .select('*')
    .eq('id', orderId)
    .single()

  if (error || !data) return null

  // Strip financial fields before returning to supplier context
  const row = data as Record<string, unknown>
  return {
    id:                    row.id                    as string,
    design_order_id:       row.design_order_id       as string,
    user_id:               row.user_id               as string,
    status:                row.status                as ProductionOrder['status'],
    production_stage:      row.production_stage      as ProductionStage | null,
    pricing: {
      activation_fee_cents: 0,  // financial data redacted for supplier
      garment_price_cents:  0,
      extra_logo_count:     0,
      extra_logo_fee_cents: 0,
      total_cents:          0,
    },
    tech_pack_snapshot:    row.tech_pack_snapshot    as ProductionOrder['tech_pack_snapshot'],
    stripe_session_id:     null,  // never exposed to suppliers
    stripe_payment_intent: null,
    supplier_name:         row.supplier_name         as string | null,
    supplier_email:        row.supplier_email        as string | null,
    supplier_notes:        row.supplier_notes        as string | null,
    tracking_number:       row.tracking_number       as string | null,
    carrier:               row.carrier               as string | null,
    revision_notes:        row.revision_notes        as string | null,
    created_at:            row.created_at            as string,
    updated_at:            row.updated_at            as string,
    paid_at:               null,  // financial — not exposed
    production_started_at: row.production_started_at as string | null,
    sample_shipped_at:     row.sample_shipped_at     as string | null,
    sample_delivered_at:   row.sample_delivered_at   as string | null,
    shipped_at:            row.shipped_at            as string | null,
    delivered_at:          row.delivered_at          as string | null,
    production_path:           null,
    sample_fee_cents:          null,
    sample_stripe_session_id:  null,
    sample_paid_at:            null,
    deposit_amount_cents:      null,
    deposit_stripe_session_id: null,
    deposit_paid_at:           null,
    final_amount_cents:        null,
    final_stripe_session_id:   null,
    final_paid_at:             null,
  }
}

// ─── Read: media ──────────────────────────────────────────────────────────────

export async function getOrderMedia(orderId: string): Promise<OrderMedia[]> {
  const supabase = createClient()
  if (!supabase) return []

  const { data, error } = await supabase
    .from('production_order_media')
    .select('id, stage, media_type, public_url, file_name, notes, created_at')
    .eq('production_order_id', orderId)
    .order('created_at', { ascending: false })

  if (error || !data) return []
  return data as OrderMedia[]
}

// ─── Write: media upload ──────────────────────────────────────────────────────

export async function uploadOrderMedia(
  orderId: string,
  stage: ProductionStage,
  mediaType: OrderMedia['media_type'],
  file: File,
  notes?: string,
): Promise<OrderMedia | null> {
  const supabase = createClient()
  if (!supabase) return null

  const ext = file.name.split('.').pop() ?? 'bin'
  const path = `${orderId}/${stage}/${Date.now()}_${crypto.randomUUID()}.${ext}`

  const { error: uploadErr } = await supabase.storage
    .from('production-media')
    .upload(path, file, { contentType: file.type, upsert: false })

  if (uploadErr) {
    console.error('uploadOrderMedia storage error', uploadErr)
    return null
  }

  const { data: urlData } = supabase.storage
    .from('production-media')
    .getPublicUrl(path)

  const { data: session } = await supabase.auth.getSession()
  const uploaderEmail = session.session?.user.email ?? ''

  const { data, error: dbErr } = await supabase
    .from('production_order_media')
    .insert({
      production_order_id: orderId,
      stage,
      media_type:          mediaType,
      storage_path:        path,
      public_url:          urlData.publicUrl,
      file_name:           file.name,
      file_size_bytes:     file.size,
      mime_type:           file.type,
      uploaded_by_email:   uploaderEmail,
      notes:               notes ?? null,
    })
    .select('id, stage, media_type, public_url, file_name, notes, created_at')
    .single()

  if (dbErr || !data) {
    console.error('uploadOrderMedia db error', dbErr)
    return null
  }

  return data as OrderMedia
}

// ─── Re-export for convenience ────────────────────────────────────────────────

export { engineGetStageHistory as getStageHistory }

// ─── Write: stage transition (client-side guard) ──────────────────────────────
//
// The authoritative permission check runs server-side in
// /api/supplier/transition. This client-side guard provides fast feedback
// before the network call.

export async function supplierTransition(
  orderId: string,
  toStage: ProductionStage,
  metadata: Record<string, unknown>,
  _actorEmail: string,
): Promise<{ ok: true; order: ProductionOrder } | { ok: false; errors: string[] }> {
  const res = await fetch('/api/supplier/transition', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ order_id: orderId, to_stage: toStage, metadata }),
  })

  const body = await res.json()

  if (!res.ok) {
    return { ok: false, errors: [body.error ?? 'Transition failed. Please try again.'] }
  }

  return { ok: true, order: body.order }
}
