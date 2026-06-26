'use client'

import { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { createClient } from './supabase'
import type { Session } from '@supabase/supabase-js'

export type User = {
  id: string
  email: string
  name: string
  brandName?: string
}

type AuthContextType = {
  user: User | null
  loading: boolean
  signIn: (email: string, password: string) => Promise<string | null>
  signUp: (name: string, email: string, password: string) => Promise<string | null>
  signOut: () => void
  updateUser: (updates: Partial<User>) => void
}

const AuthContext = createContext<AuthContextType | null>(null)

function sessionToUser(session: Session | null): User | null {
  const su = session?.user
  if (!su) return null
  return {
    id: su.id,
    email: su.email ?? '',
    name: (su.user_metadata?.name as string) ?? su.email?.split('@')[0] ?? 'User',
    // The user's own brand, set in their profile — never defaulted to GRACE.
    brandName: (su.user_metadata?.brand_name as string) || undefined,
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const sb = createClient()
    if (!sb) { setLoading(false); return }

    sb.auth.getSession().then((res: { data: { session: Session | null } }) => {
      setUser(sessionToUser(res.data.session))
      setLoading(false)
    })

    const { data: listener } = sb.auth.onAuthStateChange((_evt: string, session: Session | null) => {
      setUser(sessionToUser(session))
    })

    return () => listener.subscription.unsubscribe()
  }, [])

  const signIn = async (email: string, password: string): Promise<string | null> => {
    const sb = createClient()
    if (!sb) return 'Supabase not configured.'
    const { error } = await sb.auth.signInWithPassword({ email, password })
    return error?.message ?? null
  }

  const signUp = async (name: string, email: string, password: string): Promise<string | null> => {
    const sb = createClient()
    if (!sb) return 'Supabase not configured.'
    const { error } = await sb.auth.signUp({
      email,
      password,
      // Don't stamp a brand on sign-up — the user sets their own in their profile.
      options: { data: { name } },
    })
    return error?.message ?? null
  }

  const signOut = () => {
    const sb = createClient()
    sb?.auth.signOut()
    setUser(null)
  }

  const updateUser = async (updates: Partial<User>) => {
    const sb = createClient()
    if (sb) {
      const meta: Record<string, string> = {}
      if (updates.name) meta.name = updates.name
      if (updates.brandName) meta.brand_name = updates.brandName
      await sb.auth.updateUser({ data: meta })
    }
    setUser(u => u ? { ...u, ...updates } : u)
  }

  return (
    <AuthContext.Provider value={{ user, loading, signIn, signUp, signOut, updateUser }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
