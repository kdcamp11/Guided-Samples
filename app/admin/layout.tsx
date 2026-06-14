'use client'

/**
 * Admin portal layout.
 * Wraps /admin/* routes with the AuthProvider so useAuth() works
 * (the SignIn form and other components depend on it).
 */

import { AuthProvider } from '@/lib/auth'

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>
}
