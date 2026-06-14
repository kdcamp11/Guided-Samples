import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase'
import type { NotificationPreferences } from '@/lib/notifications'

// GET /api/notifications/preferences
export async function GET() {
  const supabase = createClient()
  if (!supabase) return NextResponse.json({ email_enabled: true, email_overrides: {} })

  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data } = await supabase
    .from('notification_preferences')
    .select('email_enabled, email_overrides')
    .eq('user_email', session.user.email)
    .maybeSingle()

  return NextResponse.json(data ?? { email_enabled: true, email_overrides: {} })
}

// PUT /api/notifications/preferences
export async function PUT(req: NextRequest) {
  const supabase = createClient()
  if (!supabase) return NextResponse.json({ ok: false }, { status: 503 })

  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json() as NotificationPreferences

  const { error } = await supabase
    .from('notification_preferences')
    .upsert({
      user_email:      session.user.email,
      email_enabled:   body.email_enabled,
      email_overrides: body.email_overrides ?? {},
      updated_at:      new Date().toISOString(),
    }, { onConflict: 'user_email' })

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
