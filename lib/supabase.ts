import { createBrowserClient, createServerClient as createSSRServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

type SupabaseClient = ReturnType<typeof createBrowserClient>

let _client: SupabaseClient | null = null

export function createClient(): SupabaseClient | null {
  if (typeof window === 'undefined') return null
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''
  if (!url || url === 'your_supabase_project_url' || !key) return null
  if (!_client) _client = createBrowserClient(url, key)
  return _client
}

export function createRouteClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''
  if (!url || !key) return null
  const cookieStore = cookies()
  return createSSRServerClient(url, key, {
    cookies: {
      getAll() { return cookieStore.getAll() },
      setAll(toSet) {
        try { toSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) }
        catch { /* route handlers can't set cookies on response — safe to ignore */ }
      },
    },
  })
}
