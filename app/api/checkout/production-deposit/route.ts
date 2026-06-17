import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { getRouteUser } from '@/lib/supabase-server'
import { MIN_PRODUCTION_QUANTITY, clampQuantity, bulkSubtotalCents, depositCents } from '@/lib/pricing'
import { normalizeBreakdown, sumBreakdown } from '@/lib/sizes'

export async function POST(req: NextRequest) {
  const secretKey = process.env.STRIPE_SECRET_KEY
  if (!secretKey) {
    return NextResponse.json({ error: 'Stripe not configured' }, { status: 500 })
  }

  const { sb, user } = await getRouteUser(req)
  if (!sb) return NextResponse.json({ error: 'Database unavailable' }, { status: 503 })
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { order_id, quantity, size_breakdown } = await req.json()

  const { data: order, error: orderError } = await sb
    .from('production_orders')
    .select('id, user_id, production_stage, garment_price_cents, extra_logo_fee_cents, production_quantity, size_breakdown')
    .eq('id', order_id)
    .eq('user_id', user.id)
    .single()

  if (orderError || !order) {
    return NextResponse.json({ error: 'Order not found' }, { status: 404 })
  }

  if (order.production_stage !== 'AWAITING_PRODUCTION_DEPOSIT') {
    return NextResponse.json({ error: 'Order is not awaiting a production deposit' }, { status: 422 })
  }

  // The client chooses the per-size breakdown at deposit time. Quantity is its
  // sum; the bulk run must meet the MOQ. Persist both so the webhook and
  // final-payment step compute the same totals.
  const breakdown = normalizeBreakdown(size_breakdown ?? order.size_breakdown)
  const breakdownTotal = sumBreakdown(breakdown)
  const qty = clampQuantity(breakdownTotal > 0 ? breakdownTotal : (quantity ?? order.production_quantity ?? MIN_PRODUCTION_QUANTITY))
  if (qty < MIN_PRODUCTION_QUANTITY) {
    return NextResponse.json(
      { error: `Minimum order quantity is ${MIN_PRODUCTION_QUANTITY} pieces` },
      { status: 422 },
    )
  }
  await sb
    .from('production_orders')
    .update({ production_quantity: qty, size_breakdown: breakdown })
    .eq('id', order_id)

  const subtotal = bulkSubtotalCents(
    order.garment_price_cents ?? 0,
    order.extra_logo_fee_cents ?? 0,
    qty,
  )
  const depositAmount = depositCents(subtotal)

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
      user_id: user.id,
    },
    success_url: `${origin}/track?payment=deposit_success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/track`,
  })

  return NextResponse.json({ url: stripeSession.url })
}
