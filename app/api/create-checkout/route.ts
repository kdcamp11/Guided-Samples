import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'

const ACTIVATION_FEE = 10000 // $100.00 in cents

const GARMENT_PRICES: Record<string, number> = {
  'T-Shirt': 2500,
  'Hoodie': 4500,
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

  const stripe = new Stripe(secretKey)
  const { garmentType, styleName, supplierEmail, supplierName, notes } = await req.json()

  const garmentPrice = GARMENT_PRICES[garmentType] ?? 3500
  const garmentLabel = garmentType || 'Custom Garment'
  const origin = req.headers.get('origin') ?? 'http://localhost:3000'

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    line_items: [
      {
        price_data: {
          currency: 'usd',
          product_data: { name: 'GRACE Order Activation Fee', description: 'One-time activation per production order' },
          unit_amount: ACTIVATION_FEE,
        },
        quantity: 1,
      },
      {
        price_data: {
          currency: 'usd',
          product_data: { name: `${garmentLabel} Sample`, description: styleName ? `Style: ${styleName}` : 'Single sample production' },
          unit_amount: garmentPrice,
        },
        quantity: 1,
      },
    ],
    metadata: {
      garmentType: garmentLabel,
      styleName: styleName ?? '',
      supplierEmail: supplierEmail ?? '',
      supplierName: supplierName ?? '',
      notes: notes ?? '',
    },
    success_url: `${origin}?payment=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}?payment=cancelled`,
  })

  return NextResponse.json({ url: session.url })
}
