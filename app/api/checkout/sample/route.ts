import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createClient } from '@/lib/supabase'

const ACTIVATION_FEE_CENTS = 10000
const SAMPLE_FEE_CENTS = 5000
const EXTRA_LOGO_FEE_CENTS = 400

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

  const { design_order_id, garment_type, style_name, extra_logos, notes } = await req.json()

  const { data: project, error: projectError } = await sb
    .from('projects')
    .select('id, user_id, phase_reached')
    .eq('id', design_order_id)
    .eq('user_id', authSession.user.id)
    .single()

  if (projectError || !project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 })
  }

  if ((project.phase_reached ?? 0) < 5) {
    return NextResponse.json({ error: 'Project not ready for production' }, { status: 422 })
  }

  const stripe = new Stripe(secretKey)
  const origin = req.headers.get('origin') ?? 'http://localhost:3000'
  const extraLogosCount = Number(extra_logos) || 0

  const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [
    {
      price_data: {
        currency: 'usd',
        product_data: {
          name: 'GRACE Order Activation Fee',
          description: 'One-time activation per production order',
        },
        unit_amount: ACTIVATION_FEE_CENTS,
      },
      quantity: 1,
    },
    {
      price_data: {
        currency: 'usd',
        product_data: {
          name: `${garment_type} Sample`,
          description: style_name ? `Style: ${style_name}` : 'Single sample production',
        },
        unit_amount: SAMPLE_FEE_CENTS,
      },
      quantity: 1,
    },
  ]

  if (extraLogosCount > 0) {
    lineItems.push({
      price_data: {
        currency: 'usd',
        product_data: {
          name: 'Additional Logo Placement',
          description: `${extraLogosCount} additional logo location${extraLogosCount > 1 ? 's' : ''} at $4 each`,
        },
        unit_amount: EXTRA_LOGO_FEE_CENTS,
      },
      quantity: extraLogosCount,
    })
  }

  const stripeSession = await stripe.checkout.sessions.create({
    mode: 'payment',
    line_items: lineItems,
    metadata: {
      payment_type: 'sample',
      design_order_id,
      user_id: authSession.user.id,
      garment_type,
      style_name: style_name ?? '',
      extra_logos: String(extraLogosCount),
      notes: notes ?? '',
    },
    success_url: `${origin}/track?payment=sample_success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/track?payment=cancelled`,
  })

  return NextResponse.json({ url: stripeSession.url })
}
