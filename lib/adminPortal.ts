/**
 * Admin Portal — data access layer
 *
 * Admins are GRACE staff.  They can see ALL production orders regardless of
 * client or supplier assignment.  RLS grants them access via the is_admin()
 * function that checks app_metadata.role = 'admin' in the JWT.
 *
 * All mutations go through the workflow engine — admins never bypass validation.
 */

import { createClient } from '@/lib/supabase'
import type { ProductionOrder } from '@/types/production'
import type { OrderMedia } from '@/types/supplier'
import type { StageTransitionEvent } from '@/types/productionStages'
import type { ProductionStage } from '@/types/productionStages'

// ─── Auth check ───────────────────────────────────────────────────────────────

export async function isAdmin(): Promise<boolean> {
  const sb = createClient()
  if (!sb) return false
  const { data: { session } } = await sb.auth.getSession()
  if (!session) return false
  const role = (session.user.app_metadata as Record<string, unknown>)?.role
  return role === 'admin'
}

// ─── Order queries ────────────────────────────────────────────────────────────

export async function listAllOrders(opts?: {
  stage?: ProductionStage
  limit?: number
}): Promise<ProductionOrder[]> {
  const sb = createClient()
  if (!sb) return []
  let q = sb
    .from('production_orders')
    .select('*')
    .order('updated_at', { ascending: false })
    .limit(opts?.limit ?? 200)
  if (opts?.stage) q = q.eq('production_stage', opts.stage)
  const { data, error } = await q
  if (error) { console.error('adminPortal.listAllOrders', error); return [] }
  return (data ?? []) as ProductionOrder[]
}

export async function getAdminOrder(orderId: string): Promise<ProductionOrder | null> {
  const sb = createClient()
  if (!sb) return null
  const { data, error } = await sb
    .from('production_orders')
    .select('*')
    .eq('id', orderId)
    .single()
  if (error) { console.error('adminPortal.getAdminOrder', error); return null }
  return data as ProductionOrder
}

export async function getAdminOrderMedia(orderId: string): Promise<OrderMedia[]> {
  const sb = createClient()
  if (!sb) return []
  const { data } = await sb
    .from('production_order_media')
    .select('id, stage, media_type, public_url, file_name, mime_type, notes, created_at')
    .eq('production_order_id', orderId)
    .order('created_at', { ascending: true })
  return (data ?? []) as OrderMedia[]
}

export async function getAdminOrderHistory(orderId: string): Promise<StageTransitionEvent[]> {
  const sb = createClient()
  if (!sb) return []
  const { data } = await sb
    .from('production_order_events')
    .select('metadata, created_at, event_type')
    .eq('production_order_id', orderId)
    .order('created_at', { ascending: true })
  if (!data) return []
  return data.map((row: { metadata: unknown; created_at: string; event_type: string }) => ({
    ...(row.metadata as StageTransitionEvent),
    // For admin_note events, synthesise a display event
    _event_type: row.event_type,
    transitioned_at: (row.metadata as StageTransitionEvent)?.transitioned_at ?? (row.created_at as string),
  })) as StageTransitionEvent[]
}

// ─── Stage stats for dashboard ────────────────────────────────────────────────

export type StageCount = { stage: ProductionStage | null; count: number }

export async function getOrderStageCounts(): Promise<StageCount[]> {
  const sb = createClient()
  if (!sb) return []
  const { data } = await sb
    .from('production_orders')
    .select('production_stage')
  if (!data) return []
  const counts: Record<string, number> = {}
  for (const row of data) {
    const s = (row.production_stage as string) ?? 'null'
    counts[s] = (counts[s] ?? 0) + 1
  }
  return Object.entries(counts).map(([stage, count]) => ({
    stage: stage === 'null' ? null : stage as ProductionStage,
    count,
  }))
}

// ─── Supplier reassignment ────────────────────────────────────────────────────

export async function reassignSupplier(
  orderId:      string,
  newEmail:     string,
  adminEmail:   string,
): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch('/api/admin/reassign', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ order_id: orderId, supplier_email: newEmail, admin_email: adminEmail }),
  })
  return res.json()
}

// ─── Admin note ───────────────────────────────────────────────────────────────

export async function addAdminNote(
  orderId: string,
  note:    string,
): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch('/api/admin/note', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ order_id: orderId, note }),
  })
  return res.json()
}

// ─── Admin transition ─────────────────────────────────────────────────────────

export async function adminTransition(
  orderId:  string,
  toStage:  ProductionStage,
  metadata: Record<string, unknown> = {},
): Promise<{ ok: boolean; error?: string }> {
  const sb = createClient()
  const token = sb
    ? (await sb.auth.getSession()).data.session?.access_token
    : null

  const res = await fetch('/api/admin/transition', {
    method:  'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body:    JSON.stringify({ order_id: orderId, to_stage: toStage, metadata }),
  })
  return res.json()
}
