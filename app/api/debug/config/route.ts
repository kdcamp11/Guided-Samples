import { NextResponse } from 'next/server'

// Safe config check — returns presence (never values) of required server env vars.
// Remove this file once production is confirmed working.
export async function GET() {
  return NextResponse.json({
    NEXT_PUBLIC_SUPABASE_URL:     !!process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY:    !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    STRIPE_SECRET_KEY:            !!process.env.STRIPE_SECRET_KEY,
    STRIPE_WEBHOOK_SECRET:        !!process.env.STRIPE_WEBHOOK_SECRET,
  })
}
