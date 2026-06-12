'use client'

import { createContext, useContext, useState, useEffect, ReactNode } from 'react'

export type User = {
  id: string
  name: string
  email: string
  phone?: string
  address?: string
  city?: string
  state?: string
  zip?: string
  country?: string
  brandName?: string
}

type AuthContextType = {
  user: User | null
  loading: boolean
  signIn: (email: string, password: string) => Promise<string | null>
  signUp: (name: string, email: string, password: string) => Promise<string | null>
  signOut: () => void
  updateUser: (updates: Partial<User>) => void
  changePassword: (current: string, next: string) => string | null
}

const AuthContext = createContext<AuthContextType | null>(null)

const USERS_KEY = 'grace_users'
const SESSION_KEY = 'grace_session'

type StoredUser = User & { passwordHash: string }

function hashPassword(password: string): string {
  // Simple deterministic hash for demo — not for production
  let h = 0
  for (let i = 0; i < password.length; i++) {
    h = (Math.imul(31, h) + password.charCodeAt(i)) | 0
  }
  return h.toString(36)
}

function getUsers(): StoredUser[] {
  try {
    return JSON.parse(localStorage.getItem(USERS_KEY) ?? '[]')
  } catch {
    return []
  }
}

function saveUsers(users: StoredUser[]) {
  localStorage.setItem(USERS_KEY, JSON.stringify(users))
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    try {
      const raw = localStorage.getItem(SESSION_KEY)
      if (raw) setUser(JSON.parse(raw))
    } catch {}
    setLoading(false)
  }, [])

  const signIn = async (email: string, password: string): Promise<string | null> => {
    const users = getUsers()
    const found = users.find(u => u.email.toLowerCase() === email.toLowerCase())
    if (!found) return 'No account found with that email.'
    if (found.passwordHash !== hashPassword(password)) return 'Incorrect password.'
    const { passwordHash: _, ...safeUser } = found
    setUser(safeUser)
    localStorage.setItem(SESSION_KEY, JSON.stringify(safeUser))
    return null
  }

  const signUp = async (name: string, email: string, password: string): Promise<string | null> => {
    const users = getUsers()
    if (users.find(u => u.email.toLowerCase() === email.toLowerCase())) {
      return 'An account with that email already exists.'
    }
    if (password.length < 6) return 'Password must be at least 6 characters.'
    const newUser: StoredUser = {
      id: crypto.randomUUID(),
      name,
      email,
      brandName: 'GRACE',
      passwordHash: hashPassword(password),
    }
    saveUsers([...users, newUser])
    const { passwordHash: _, ...safeUser } = newUser
    setUser(safeUser)
    localStorage.setItem(SESSION_KEY, JSON.stringify(safeUser))
    return null
  }

  const signOut = () => {
    setUser(null)
    localStorage.removeItem(SESSION_KEY)
  }

  const updateUser = (updates: Partial<User>) => {
    if (!user) return
    const updated = { ...user, ...updates }
    setUser(updated)
    localStorage.setItem(SESSION_KEY, JSON.stringify(updated))
    const users = getUsers()
    saveUsers(users.map(u => u.id === updated.id ? { ...u, ...updates } : u))
  }

  const changePassword = (current: string, next: string): string | null => {
    if (!user) return 'Not signed in.'
    if (next.length < 6) return 'New password must be at least 6 characters.'
    const users = getUsers()
    const stored = users.find(u => u.id === user.id)
    if (!stored || stored.passwordHash !== hashPassword(current)) return 'Current password is incorrect.'
    saveUsers(users.map(u => u.id === user.id ? { ...u, passwordHash: hashPassword(next) } : u))
    return null
  }

  return (
    <AuthContext.Provider value={{ user, loading, signIn, signUp, signOut, updateUser, changePassword }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
