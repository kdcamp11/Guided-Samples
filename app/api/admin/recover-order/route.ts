/**
 * POST /api/admin/recover-order
 *
 * Manually recover a paid Stripe session that never created a DB order.
 * Pass { session_id: "cs_live_..." } in the request body.
 * Admin only — checks app_metadata.role === 'admin'.
 */
import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'
import { getRouteUser } from '@/lib/supabase-server'
import { ACTIVATION_FEE_CENTS, EXTRA_LOGO_FEE_CENTS, productionPriceCents } from '@/lib/pricing'
import { normalizeBreakdown, sumBreakdown } from '@/lib/sizes'
import { applyActivationUnlock } from '@/lib/aiCredits'

function isAdmin(user: { app_metadata?: Record<string, unknown> }): boolean {
  return user.app_metadata?.role === 'admin'
}

export async function POST(req: NextRequest) {
  const { user } = await getRouteUser(req)
  if (!user || !isAdmin(user as { app_metadata?: Record<string, unknown> })) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  // Accept either a session ID (cs_...) or an event ID (evt_...)
  const raw: string = body.session_id ?? ''
  if (!raw) return NextResponse.json({ error: 'Missing session_id' }, { status: 400 })

  const secretKey = process.env.STRIPE_SECRET_KEY
  if (!secretKey) return NextResponse.json({ error: 'Stripe not configured' }, { status: 500 })

  const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
  const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
  if (!sbUrl || !sbKey) return NextResponse.json({ error: 'DB not configured' }, { status: 500 })

  const sb = createClient(sbUrl, sbKey, { auth: { persistSession: false } })
  const stripe = new Stripe(secretKey)

  let session: Stripe.Checkout.Session
  try {
    if (raw.startsWith('evt_')) {
      // Resolve event → session
      const event = await stripe.events.retrieve(raw)
      if (event.type !== 'checkout.session.completed') {
        return NextResponse.json({ error: `Event type is "${event.type}", expected checkout.session.completed` }, { status: 422 })
      }
      const sessionId = (event.data.object as Stripe.Checkout.Session).id
      session = await stripe.checkout.sessions.retrieve(sessionId)
    } else {
      session = await stripe.checkout.sessions.retrieve(raw)
    }
  } catch {
    return NextResponse.json({ error: 'Not found in Stripe — check the ID and that you are using the correct live/test mode key' }, { status: 404 })
  }

  if (session.payment_status !== 'paid') {
    return NextResponse.json({ error: 'Session not paid', status: session.payment_status }, { status: 422 })
  }

  const meta = session.metadata ?? {}
  const { payment_type, design_order_id, user_id, garment_type, is_uniform, is_reversible, extra_logos, size_breakdown } = meta

  // Check for duplicate
  const { data: existing } = await sb
    .from('production_orders')
    .select('id')
    .eq('design_order_id', design_order_id ?? '')
    .limit(1)
  if (existing && existing.length > 0) {
    return NextResponse.json({ status: 'already_exists', order_id: existing[0].id })
  }

  const DEFAULT_SUPPLIER_EMAIL = process.env.DEFAULT_SUPPLIER_EMAIL ?? 'k.campjr@gmail.com'
  const DEFAULT_SUPPLIER_NAME  = process.env.DEFAULT_SUPPLIER_NAME  ?? 'Production Partner'
  const breakdown     = normalizeBreakdown(size_breakdown ? JSON.parse(size_breakdown) : null)
  const qty           = Math.max(1, sumBreakdown(breakdown))
  const extraLogosCount = parseInt(extra_logos ?? '0', 10) || 0
  const garmentPrice  = productionPriceCents(garment_type ?? '', is_uniform === 'true', is_reversible === 'true')

  const { data: techPack } = await sb.from('tech_packs').select('*').eq('project_id', design_order_id ?? '').single()

  // Resolve email via auth admin API
  let userEmail = ''
  try {
    const { data } = await sb.auth.admin.getUserById(user_id ?? '')
    userEmail = data.user?.email ?? ''
  } catch { /* ignore */ }

  if (payment_type === 'sample') {
    const { data: inserted, error } = await sb.from('production_orders').insert({
      design_order_id,
      user_id: user_id ?? '',
      user_email: userEmail,
      production_path: 'SAMPLE',
      production_stage: 'AWAITING_FIRST_PIECE',
      supplier_email: DEFAULT_SUPPLIER_EMAIL,
      supplier_name: DEFAULT_SUPPLIER_NAME,
      sample_fee_cents: session.amount_total,
      sample_stripe_session_id: session.id,
      sample_paid_at: new Date().toISOString(),
      activation_fee_cents: ACTIVATION_FEE_CENTS,
      garment_price_cents: garmentPrice,
      production_quantity: qty,
      extra_logo_count: extraLogosCount,
      extra_logo_fee_cents: extraLogosCount * EXTRA_LOGO_FEE_CENTS,
      tech_pack_snapshot: techPack ?? {},
      status: 'paid',
    }).select('id').single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    const aiSpendApplied = parseInt(meta.ai_spend_applied_cents ?? '0', 10)
    if (design_order_id && user_id) await applyActivationUnlock(user_id, design_order_id, aiSpendApplied)
    return NextResponse.json({ status: 'created', order_id: inserted?.id, payment_type, user_email: userEmail })
  }

  if (payment_type === 'direct_deposit') {
    const { data: inserted, error } = await sb.from('production_orders').insert({
      design_order_id,
      user_id: user_id ?? '',
      user_email: userEmail,
      production_path: 'DIRECT',
      production_stage: 'IN_PRODUCTION',
      supplier_email: DEFAULT_SUPPLIER_EMAIL,
      supplier_name: DEFAULT_SUPPLIER_NAME,
      deposit_stripe_session_id: session.id,
      deposit_paid_at: new Date().toISOString(),
      garment_price_cents: garmentPrice,
      production_quantity: qty,
      extra_logo_count: extraLogosCount,
      extra_logo_fee_cents: extraLogosCount * EXTRA_LOGO_FEE_CENTS,
      tech_pack_snapshot: techPack ?? {},
      status: 'deposit_paid',
    }).select('id').single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ status: 'created', order_id: inserted?.id, payment_type, user_email: userEmail })
  }

  return NextResponse.json({
    status: 'unrecognized_payment_type',
    payment_type,
    metadata: meta,
    note: 'Check the metadata above — payment_type must be "sample" or "direct_deposit"',
  })
}
