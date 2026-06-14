import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createClient } from '@/lib/supabase'

export async function POST(req: NextRequest) {
  const secretKey = process.env.STRIPE_SECRET_KEY
  if (!secretKey) {
    return NextResponse.json({ error: 'Stripe not configured' }, { status: 500 })
  }

  const sb = createClient()
  if (!sb) {
    return NextResponse.json({ error: 'Database unavailable' }, { status: 503 })
  }

  const { data: { session: authSession } } = await sb.auth.getSession()
  if (!authSession) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { order_id } = await req.json()

  const { data: order, error: orderError } = await sb
    .from('production_orders')
    .select('id, user_id, production_stage, garment_price_cents, extra_logo_fee_cents')
    .eq('id', order_id)
    .eq('user_id', authSession.user.id)
    .single()

  if (orderError || !order) {
    return NextResponse.json({ error: 'Order not found' }, { status: 404 })
  }

  if (order.production_stage !== 'AWAITING_PRODUCTION_DEPOSIT') {
    return NextResponse.json({ error: 'Order is not awaiting a production deposit' }, { status: 422 })
  }

  const depositAmount = Math.round(
    ((order.garment_price_cents ?? 0) + (order.extra_logo_fee_cents ?? 0)) / 2
  )

  const stripe = new Stripe(secretKey)
  const origin = req.headers.get('origin') ?? 'http://localhost:3000'

  const stripeSession = await stripe.checkout.sessions.create({
    mode: 'payment',
    line_items: [
      {
        price_data: {
          currency: 'usd',
          product_data: {
            name: 'Production Deposit — 50%',
            description: '50% deposit to begin bulk production run',
          },
          unit_amount: depositAmount,
        },
        quantity: 1,
      },
    ],
    metadata: {
      payment_type: 'production_deposit',
      order_id,
      user_id: authSession.user.id,
    },
    success_url: `${origin}/track?payment=deposit_success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/track`,
  })

  return NextResponse.json({ url: stripeSession.url })
}
