import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'

// The webhook runs as trusted server code with no user session. It MUST use the
// service-role key to bypass row-level security — the anon key would be blocked
// by the "auth.uid() = user_id" policy (auth.uid() is null here), silently
// dropping every insert/update.
function createWebhookClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
  if (!url || !key) {
    console.error('[stripe-webhook] Missing env vars:', { hasUrl: !!url, hasServiceKey: !!key })
    return null
  }
  return createClient(url, key, { auth: { persistSession: false } })
}

// Single-supplier setup: every production order is auto-assigned to the one
// supplier we work with. Override via DEFAULT_SUPPLIER_EMAIL / _NAME env vars.
const DEFAULT_SUPPLIER_EMAIL = process.env.DEFAULT_SUPPLIER_EMAIL ?? 'k.campjr@gmail.com'
const DEFAULT_SUPPLIER_NAME = process.env.DEFAULT_SUPPLIER_NAME ?? 'Production Partner'

const GARMENT_PRICES: Record<string, number> = {
  'T-Shirt': 2500, 'Hoodie': 4500, 'Sweatshirt': 3500,
  'Polo': 3000, 'Tank Top': 2000, 'Jacket': 6000,
}

export async function POST(req: NextRequest) {
  const secretKey = process.env.STRIPE_SECRET_KEY
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET
  if (!secretKey) return NextResponse.json({ error: 'Not configured' }, { status: 500 })

  const stripe = new Stripe(secretKey)
  const body = await req.text()
  const sig = req.headers.get('stripe-signature') ?? ''

  let event: Stripe.Event
  try {
    event = webhookSecret
      ? stripe.webhooks.constructEvent(body, sig, webhookSecret)
      : JSON.parse(body)
  } catch (err) {
    console.error('[stripe-webhook] signature verification failed:',
      err instanceof Error ? err.message : err,
      '| hasSecret:', !!webhookSecret, '| hasSig:', !!sig)
    return NextResponse.json({ error: 'Webhook signature verification failed' }, { status: 400 })
  }

  if (event.type !== 'checkout.session.completed') {
    return NextResponse.json({ received: true })
  }

  const session = event.data.object as Stripe.Checkout.Session
  const meta = session.metadata ?? {}
  const { payment_type } = meta

  if (payment_type === 'sample') {
    await handleSamplePayment(session, meta)
  } else if (payment_type === 'direct_deposit') {
    await handleDirectDeposit(session, meta)
  } else if (payment_type === 'production_deposit') {
    await handleProductionDeposit(session, meta)
  } else if (payment_type === 'final_payment') {
    await handleFinalPayment(session, meta)
  } else {
    await handleLegacy(session, meta)
  }

  return NextResponse.json({ received: true })
}

async function handleSamplePayment(
  session: Stripe.Checkout.Session,
  meta: Record<string, string>,
) {
  const sb = createWebhookClient()
  if (!sb) return

  const { design_order_id, user_id, garment_type, extra_logos } = meta
  const extraLogosCount = parseInt(extra_logos ?? '0', 10) || 0
  const garmentPrice = GARMENT_PRICES[garment_type] ?? 3500

  const { data: techPack } = await sb
    .from('tech_packs')
    .select('*')
    .eq('project_id', design_order_id)
    .single()

  const { error: insertError } = await sb.from('production_orders').insert({
    design_order_id,
    user_id,
    production_path: 'SAMPLE',
    production_stage: 'AWAITING_FIRST_PIECE',
    supplier_email: DEFAULT_SUPPLIER_EMAIL,
    supplier_name: DEFAULT_SUPPLIER_NAME,
    sample_fee_cents: session.amount_total,
    sample_stripe_session_id: session.id,
    sample_paid_at: new Date().toISOString(),
    activation_fee_cents: 10000,
    garment_price_cents: garmentPrice,
    extra_logo_count: extraLogosCount,
    extra_logo_fee_cents: extraLogosCount * 400,
    tech_pack_snapshot: techPack ?? {},
    status: 'paid',
  })
  if (insertError) {
    console.error('[stripe-webhook] sample insert failed:', insertError)
  } else {
    console.log('[stripe-webhook] sample order created for user', user_id)
  }

  const { error: lockError } = await sb
    .from('projects')
    .update({ locked_at: new Date().toISOString() })
    .eq('id', design_order_id)
  if (lockError) console.error('[stripe-webhook] project lock failed:', lockError)
}

async function handleDirectDeposit(
  session: Stripe.Checkout.Session,
  meta: Record<string, string>,
) {
  const sb = createWebhookClient()
  if (!sb) return

  const { design_order_id, user_id, garment_type, extra_logos } = meta
  const extraLogosCount = parseInt(extra_logos ?? '0', 10) || 0
  const garmentPrice = GARMENT_PRICES[garment_type] ?? 3500

  const { data: techPack } = await sb
    .from('tech_packs')
    .select('*')
    .eq('project_id', design_order_id)
    .single()

  const { error: insertError } = await sb.from('production_orders').insert({
    design_order_id,
    user_id,
    production_path: 'DIRECT',
    production_stage: 'BULK_PRODUCTION',
    supplier_email: DEFAULT_SUPPLIER_EMAIL,
    supplier_name: DEFAULT_SUPPLIER_NAME,
    deposit_amount_cents: session.amount_total,
    deposit_stripe_session_id: session.id,
    deposit_paid_at: new Date().toISOString(),
    activation_fee_cents: 0,
    garment_price_cents: garmentPrice,
    extra_logo_count: extraLogosCount,
    extra_logo_fee_cents: extraLogosCount * 400,
    tech_pack_snapshot: techPack ?? {},
    status: 'in_production',
    paid_at: new Date().toISOString(),
  })
  if (insertError) {
    console.error('[stripe-webhook] direct insert failed:', insertError)
  } else {
    console.log('[stripe-webhook] direct order created for user', user_id)
  }

  const { error: lockError } = await sb
    .from('projects')
    .update({ locked_at: new Date().toISOString() })
    .eq('id', design_order_id)
  if (lockError) console.error('[stripe-webhook] project lock failed:', lockError)
}

async function handleProductionDeposit(
  session: Stripe.Checkout.Session,
  meta: Record<string, string>,
) {
  const sb = createWebhookClient()
  if (!sb) return

  const { order_id } = meta

  await sb
    .from('production_orders')
    .update({
      deposit_paid_at: new Date().toISOString(),
      deposit_stripe_session_id: session.id,
      deposit_amount_cents: session.amount_total,
      production_stage: 'BULK_PRODUCTION',
      status: 'in_production',
    })
    .eq('id', order_id)
}

async function handleFinalPayment(
  session: Stripe.Checkout.Session,
  meta: Record<string, string>,
) {
  const sb = createWebhookClient()
  if (!sb) return

  const { order_id } = meta

  await sb
    .from('production_orders')
    .update({
      final_paid_at: new Date().toISOString(),
      final_stripe_session_id: session.id,
      final_amount_cents: session.amount_total,
      production_stage: 'READY_TO_SHIP',
    })
    .eq('id', order_id)
}

async function handleLegacy(
  session: Stripe.Checkout.Session,
  meta: Record<string, string>,
) {
  const { supplierEmail, supplierName, garmentType, styleName, notes } = meta

  if (supplierEmail && process.env.RESEND_API_KEY) {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: process.env.RESEND_FROM_EMAIL ?? 'orders@grace.design',
        to: supplierEmail,
        subject: `New Production Order — ${styleName || garmentType}`,
        html: `
          <h2>New Production Order from GRACE</h2>
          <p><strong>Garment:</strong> ${garmentType}</p>
          <p><strong>Style Name:</strong> ${styleName}</p>
          ${supplierName ? `<p><strong>Attention:</strong> ${supplierName}</p>` : ''}
          ${notes ? `<p><strong>Notes:</strong> ${notes}</p>` : ''}
          <p>Payment confirmed. The brand owner will follow up with full design assets.</p>
        `,
      }),
    })
  }
}
