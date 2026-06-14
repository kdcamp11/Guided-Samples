import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'
import { transitionStage } from '@/lib/workflowEngine'

function createWebhookClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''
  if (!url || !key) return null
  return createClient(url, key, { auth: { persistSession: false } })
}

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
  } catch {
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

  const { design_order_id, user_id, garment_type, style_name, extra_logos } = meta
  const extraLogosCount = parseInt(extra_logos ?? '0', 10) || 0
  const garmentPrice = GARMENT_PRICES[garment_type] ?? 3500

  const { data: techPack } = await sb
    .from('tech_packs')
    .select('*')
    .eq('project_id', design_order_id)
    .single()

  await sb.from('production_orders').insert({
    design_order_id,
    user_id,
    production_path: 'SAMPLE',
    production_stage: 'AWAITING_FIRST_PIECE',
    sample_fee_cents: session.amount_total,
    sample_stripe_session_id: session.id,
    sample_paid_at: new Date().toISOString(),
    activation_fee_cents: 10000,
    garment_price_cents: garmentPrice,
    extra_logo_count: extraLogosCount,
    extra_logo_fee_cents: extraLogosCount * 400,
    garment_type,
    style_name: style_name ?? '',
    tech_pack_snapshot: techPack ?? null,
    status: 'paid',
  })

  await sb
    .from('projects')
    .update({ locked_at: new Date().toISOString() })
    .eq('id', design_order_id)
}

async function handleDirectDeposit(
  session: Stripe.Checkout.Session,
  meta: Record<string, string>,
) {
  const sb = createWebhookClient()
  if (!sb) return

  const { design_order_id, user_id, garment_type, style_name, extra_logos } = meta
  const extraLogosCount = parseInt(extra_logos ?? '0', 10) || 0
  const garmentPrice = GARMENT_PRICES[garment_type] ?? 3500

  const { data: techPack } = await sb
    .from('tech_packs')
    .select('*')
    .eq('project_id', design_order_id)
    .single()

  await sb.from('production_orders').insert({
    design_order_id,
    user_id,
    production_path: 'DIRECT',
    production_stage: 'BULK_PRODUCTION',
    deposit_amount_cents: session.amount_total,
    deposit_stripe_session_id: session.id,
    deposit_paid_at: new Date().toISOString(),
    garment_price_cents: garmentPrice,
    extra_logo_count: extraLogosCount,
    extra_logo_fee_cents: extraLogosCount * 400,
    garment_type,
    style_name: style_name ?? '',
    tech_pack_snapshot: techPack ?? null,
    status: 'paid',
  })

  await sb
    .from('projects')
    .update({ locked_at: new Date().toISOString() })
    .eq('id', design_order_id)
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
    })
    .eq('id', order_id)

  await transitionStage(order_id, 'BULK_PRODUCTION', { admin_override: true }, undefined)
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
    })
    .eq('id', order_id)

  await transitionStage(order_id, 'READY_TO_SHIP', { admin_override: true }, undefined)
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
