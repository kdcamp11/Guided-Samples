import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { getRouteUser } from '@/lib/supabase-server'
import { createClient } from '@supabase/supabase-js'
import { ACTIVATION_FEE_CENTS, EXTRA_LOGO_FEE_CENTS, productionPriceCents } from '@/lib/pricing'
import { normalizeBreakdown, sumBreakdown } from '@/lib/sizes'
import { applyActivationUnlock } from '@/lib/aiCredits'

// Called from the /track success page to ensure the order is saved even if
// the Stripe webhook fires late or fails. Safe to call multiple times —
// it's a no-op if the order already exists.
export async function GET(req: NextRequest) {
  const sessionId = req.nextUrl.searchParams.get('session_id')
  if (!sessionId) return NextResponse.json({ error: 'Missing session_id' }, { status: 400 })

  const secretKey = process.env.STRIPE_SECRET_KEY
  if (!secretKey) return NextResponse.json({ error: 'Not configured' }, { status: 500 })

  const { sb: clientSb, user } = await getRouteUser(req)
  if (!clientSb || !user) {
    console.error('[verify] Unauthorized — no user from token')
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Always use service-role so inserts bypass RLS (same as webhook)
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
  if (!url || !key) {
    console.error('[verify] Missing SUPABASE_SERVICE_ROLE_KEY — cannot create order')
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 })
  }
  const sb = createClient(url, key, { auth: { persistSession: false } })

  const stripe = new Stripe(secretKey)
  let session: Stripe.Checkout.Session
  try {
    session = await stripe.checkout.sessions.retrieve(sessionId)
  } catch (e) {
    console.error('[verify] Stripe session fetch failed:', e)
    return NextResponse.json({ error: 'Session not found' }, { status: 404 })
  }

  console.log('[verify] session', sessionId, 'payment_status:', session.payment_status, 'metadata:', session.metadata)

  if (session.payment_status !== 'paid') {
    return NextResponse.json({ status: 'unpaid', payment_status: session.payment_status })
  }

  const meta = session.metadata ?? {}
  const { payment_type, design_order_id, user_id, garment_type, is_uniform, is_reversible, extra_logos, size_breakdown } = meta

  if (!payment_type) {
    console.error('[verify] metadata missing payment_type — full metadata:', meta)
    return NextResponse.json({ error: 'missing_payment_type', metadata: meta }, { status: 422 })
  }

  if (!design_order_id) {
    console.error('[verify] metadata missing design_order_id')
    return NextResponse.json({ error: 'missing_design_order_id', metadata: meta }, { status: 422 })
  }

  // Check if the order already exists (webhook may have already created it)
  const { data: existing } = await sb
    .from('production_orders')
    .select('id')
    .eq('design_order_id', design_order_id)
    .limit(1)

  if (existing && existing.length > 0) {
    return NextResponse.json({ status: 'ok', already_existed: true, order_id: existing[0].id })
  }

  // Order doesn't exist yet — create it as a fallback
  const DEFAULT_SUPPLIER_EMAIL = process.env.DEFAULT_SUPPLIER_EMAIL ?? 'k.campjr@gmail.com'
  const DEFAULT_SUPPLIER_NAME = process.env.DEFAULT_SUPPLIER_NAME ?? 'Production Partner'
  const breakdown = normalizeBreakdown(size_breakdown ? JSON.parse(size_breakdown) : null)
  const qty = Math.max(1, sumBreakdown(breakdown))
  const extraLogosCount = parseInt(extra_logos ?? '0', 10) || 0
  const garmentPrice = productionPriceCents(garment_type ?? '', is_uniform === 'true', is_reversible === 'true')

  const { data: techPack } = await sb.from('tech_packs').select('*').eq('project_id', design_order_id ?? '').single()

  // Lookup email from profiles
  const { data: profile } = await sb.from('profiles').select('email').eq('id', user_id ?? user.id).single()
  const userEmail = profile?.email ?? user.email ?? ''

  if (payment_type === 'sample') {
    const { error } = await sb.from('production_orders').insert({
      design_order_id,
      user_id: user_id ?? user.id,
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
      size_breakdown: breakdown,
      extra_logo_count: extraLogosCount,
      extra_logo_fee_cents: extraLogosCount * EXTRA_LOGO_FEE_CENTS,
      tech_pack_snapshot: techPack ?? {},
      status: 'paid',
    })
    if (error) {
      console.error('[verify] sample insert failed:', error)
      return NextResponse.json({ status: 'error', error: error.message }, { status: 500 })
    }
    const aiSpendApplied = parseInt(meta.ai_spend_applied_cents ?? '0', 10)
    if (design_order_id && (user_id ?? user.id)) {
      await applyActivationUnlock(user_id ?? user.id, design_order_id, aiSpendApplied)
    }
    console.log('[verify] sample order created for user', user_id ?? user.id)
    return NextResponse.json({ status: 'created' })
  }

  if (payment_type === 'direct_deposit') {
    const { error } = await sb.from('production_orders').insert({
      design_order_id,
      user_id: user_id ?? user.id,
      user_email: userEmail,
      production_path: 'DIRECT',
      production_stage: 'IN_PRODUCTION',
      supplier_email: DEFAULT_SUPPLIER_EMAIL,
      supplier_name: DEFAULT_SUPPLIER_NAME,
      deposit_stripe_session_id: session.id,
      deposit_paid_at: new Date().toISOString(),
      garment_price_cents: garmentPrice,
      production_quantity: qty,
      size_breakdown: breakdown,
      extra_logo_count: extraLogosCount,
      extra_logo_fee_cents: extraLogosCount * EXTRA_LOGO_FEE_CENTS,
      tech_pack_snapshot: techPack ?? {},
      status: 'deposit_paid',
    })
    return NextResponse.json({ status: error ? 'error' : 'created', error: error?.message })
  }

  return NextResponse.json({ status: 'ok', payment_type })
}
