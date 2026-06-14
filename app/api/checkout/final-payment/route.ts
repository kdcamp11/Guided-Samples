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
    .select('id, user_id, production_stage, deposit_amount_cents')
    .eq('id', order_id)
    .eq('user_id', authSession.user.id)
    .single()

  if (orderError || !order) {
    return NextResponse.json({ error: 'Order not found' }, { status: 404 })
  }

  if (order.production_stage !== 'AWAITING_FINAL_PAYMENT') {
    return NextResponse.json({ error: 'Order is not awaiting final payment' }, { status: 422 })
  }

  // Final payment mirrors the deposit amount — both halves are equal
  const finalAmount = order.deposit_amount_cents ?? 0

  const stripe = new Stripe(secretKey)
  const origin = req.headers.get('origin') ?? 'http://localhost:3000'

  const stripeSession = await stripe.checkout.sessions.create({
    mode: 'payment',
    line_items: [
      {
        price_data: {
          currency: 'usd',
          product_data: {
            name: 'Final Payment — Remaining Balance',
            description: 'Remaining 50% balance to release shipment',
          },
          unit_amount: finalAmount,
        },
        quantity: 1,
      },
    ],
    metadata: {
      payment_type: 'final_payment',
      order_id,
      user_id: authSession.user.id,
    },
    success_url: `${origin}/track?payment=final_success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/track`,
  })

  return NextResponse.json({ url: stripeSession.url })
}
