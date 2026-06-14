import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'

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

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session
    const { supplierEmail, supplierName, garmentType, styleName, notes } = session.metadata ?? {}

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

  return NextResponse.json({ received: true })
}
