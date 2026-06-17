import { NextRequest, NextResponse } from 'next/server'
import { getRouteUser } from '@/lib/supabase-server'
import { createClient } from '@supabase/supabase-js'

// Returns the authenticated user's production orders using service-role,
// so the response is not affected by RLS policy misconfigurations.
// Matches on user_id OR user_email to handle orders created across different
// auth sessions (e.g. magic link vs password, multiple sign-ins).
export async function GET(req: NextRequest) {
  const { user } = await getRouteUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
  if (!url || !key) return NextResponse.json({ error: 'Not configured' }, { status: 500 })

  const sb = createClient(url, key, { auth: { persistSession: false } })

  // Fetch by user_id and by email separately, then merge and deduplicate.
  // This catches orders where user_id differs (different auth sessions) but
  // the email matches the current authenticated user.
  const [byId, byEmail] = await Promise.all([
    sb.from('production_orders').select('*').eq('user_id', user.id),
    user.email
      ? sb.from('production_orders').select('*').eq('user_email', user.email)
      : Promise.resolve({ data: [], error: null }),
  ])

  if (byId.error) return NextResponse.json({ error: byId.error.message }, { status: 500 })

  const seen = new Set<string>()
  const orders = [...(byId.data ?? []), ...(byEmail.data ?? [])].filter(o => {
    if (seen.has(o.id)) return false
    seen.add(o.id)
    return true
  }).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

  return NextResponse.json({ orders })
}
