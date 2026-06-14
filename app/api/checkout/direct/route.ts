import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { getRouteUser } from '@/lib/supabase-server'

const GARMENT_PRICES: Record<string, number> = {
  'T-Shirt': 2500,
  'Hoodie': 4500,
  'Sweatshirt': 3500,
  'Polo': 3000,
  'Tank Top': 2000,
  'Jacket': 6000,
  'Crewneck': 4000,
  'Zip Hoodie': 5000,
  'Track Jacket': 3500,
  'Windbreaker': 4000,
  'Basketball Jersey': 4000,
  'Sweatpants': 3500,
  'Track Pants': 3500,
  'Basketball Shorts': 2500,
}

export async function POST(req: NextRequest) {
  const secretKey = process.env.STRIPE_SECRET_KEY
  if (!secretKey) {
    return NextResponse.json({ error: 'Stripe not configured' }, { status: 500 })
  }

  const { sb, user } = await getRouteUser(req)
  if (!sb) return NextResponse.json({ error: 'Database unavailable' }, { status: 503 })
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { design_order_id, garment_type, style_name, extra_logos, notes } = await req.json()

  if (!garment_type) {
    return NextResponse.json({ error: 'garment_type is required' }, { status: 400 })
  }

  const garmentPrice = GARMENT_PRICES[garment_type] ?? 3500
  const extraLogoCount = Number(extra_logos ?? 0)
  const extraLogoFee = extraLogoCount * 400
  const depositAmount = Math.round((garmentPrice + extraLogoFee) / 2)

  const stripe = new Stripe(secretKey)
  const origin = req.headers.get('origin') ?? 'http://localhost:3000'

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    line_items: [
      {
        price_data: {
          currency: 'usd',
          product_data: {
            name: `Production Deposit — 50% of $${((garmentPrice + extraLogoFee) / 100).toFixed(2)}`,
            description: style_name
              ? `${garment_type} · Style: ${style_name}`
              : garment_type,
          },
          unit_amount: depositAmount,
        },
        quantity: 1,
      },
    ],
    metadata: {
      payment_type: 'direct_deposit',
      design_order_id: design_order_id ?? '',
      user_id: user.id,
      garment_type,
      style_name: style_name ?? '',
      extra_logos: String(extraLogoCount),
      notes: notes ?? '',
    },
    success_url: `${origin}/track?payment=direct_success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/track`,
  })

  return NextResponse.json({ url: session.url })
}
