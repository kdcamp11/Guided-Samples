import { NextRequest, NextResponse } from 'next/server'
import { createRouteClient } from '@/lib/supabase'

// GET  /api/notifications        — list unread notifications
// PATCH /api/notifications       — mark all as read

export async function GET() {
  const supabase = createRouteClient()
  if (!supabase) return NextResponse.json({ notifications: [] })

  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) return NextResponse.json({ notifications: [] }, { status: 500 })
  return NextResponse.json({ notifications: data })
}

export async function PATCH(_req: NextRequest) {
  const supabase = createRouteClient()
  if (!supabase) return NextResponse.json({ ok: false }, { status: 503 })

  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ ok: false }, { status: 401 })

  await supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('recipient_email', session.user.email)
    .eq('is_read', false)

  return NextResponse.json({ ok: true })
}
