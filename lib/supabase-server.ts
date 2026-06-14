import { createClient } from '@supabase/supabase-js'
import type { NextRequest } from 'next/server'

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''

function bareClient() {
  if (!URL || !ANON) return null
  return createClient(URL, ANON, { auth: { persistSession: false } })
}

export function createRouteClient() {
  return bareClient()
}

export async function getRouteUser(req: NextRequest) {
  if (!URL || !ANON) return { sb: null, user: null }

  const authHeader = req.headers.get('authorization') ?? ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null
  if (!token) return { sb: bareClient(), user: null }

  // Verify the token and resolve the user identity.
  const verifier = createClient(URL, ANON, { auth: { persistSession: false } })
  const { data: { user }, error } = await verifier.auth.getUser(token)
  if (error || !user) return { sb: bareClient(), user: null }

  // Return a client whose every request carries the user's JWT, so Postgres
  // row-level security evaluates auth.uid() as this user. Without this, queries
  // run as the anon role and RLS hides the user's own rows (causing 404s).
  const sb = createClient(URL, ANON, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  })

  return { sb, user }
}
