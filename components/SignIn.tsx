'use client'

import { useState } from 'react'
import { Loader2, Eye, EyeOff } from 'lucide-react'
import { useAuth } from '@/lib/auth'

interface Props {
  onSuccess?: () => void
}

function GraceMark({ size = 40 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" aria-label="GRACE mark">
      <circle cx="24" cy="24" r="23" stroke="#0A0A0A" strokeWidth="2"/>
      <circle cx="24" cy="24" r="7" fill="#C8372D"/>
    </svg>
  )
}

export default function SignIn({ onSuccess }: Props) {
  const { signIn, signUp } = useAuth()
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    setNotice('')

    let err: string | null = null
    if (mode === 'signin') {
      err = await signIn(email, password)
    } else {
      if (!name.trim()) { setError('Name is required.'); setLoading(false); return }
      err = await signUp(name.trim(), email, password)
      if (!err) {
        setNotice('Account created! Check your email to confirm, then sign in.')
        setMode('signin')
        setLoading(false)
        return
      }
    }

    if (err) {
      setError(err)
    } else {
      onSuccess?.()
    }
    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-white flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-10">
          <GraceMark size={44}/>
          <p className="text-[10px] font-bold tracking-[0.2em] text-grace-stone uppercase mt-5 mb-1">Who Are You?</p>
          <h1 className="text-2xl font-black text-grace-ink uppercase tracking-tight">GRACE Enterprise</h1>
          <p className="text-xs text-grace-stone mt-1">AI-Powered Fashion Design Studio</p>
        </div>

        <div className="bg-white border border-grace-border rounded-2xl p-8">
          <div className="flex bg-grace-mist rounded-full p-0.5 mb-6 border border-grace-border">
            {(['signin', 'signup'] as const).map(m => (
              <button
                key={m}
                onClick={() => { setMode(m); setError(''); setNotice('') }}
                className={`flex-1 py-2 rounded-full text-[10px] font-bold tracking-widest uppercase transition-colors ${
                  mode === m ? 'bg-grace-ink text-white' : 'text-grace-stone hover:text-grace-ink'
                }`}
              >
                {m === 'signin' ? 'Sign In' : 'Sign Up'}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'signup' && (
              <div>
                <label className="text-[10px] font-bold tracking-widest uppercase text-grace-stone mb-1.5 block">Full Name</label>
                <input type="text" className="input-field text-sm" placeholder="Your name"
                  value={name} onChange={e => setName(e.target.value)} required />
              </div>
            )}
            <div>
              <label className="text-[10px] font-bold tracking-widest uppercase text-grace-stone mb-1.5 block">Email</label>
              <input type="email" className="input-field text-sm" placeholder="you@example.com"
                value={email} onChange={e => setEmail(e.target.value)} required />
            </div>
            <div>
              <label className="text-[10px] font-bold tracking-widest uppercase text-grace-stone mb-1.5 block">Password</label>
              <div className="relative">
                <input type={showPw ? 'text' : 'password'} className="input-field text-sm pr-10"
                  placeholder="Min. 6 characters" value={password}
                  onChange={e => setPassword(e.target.value)} required minLength={6} />
                <button type="button" onClick={() => setShowPw(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-grace-stone hover:text-grace-ink">
                  {showPw ? <EyeOff size={14}/> : <Eye size={14}/>}
                </button>
              </div>
            </div>
            {error  && <p className="text-xs text-red-500 bg-red-50 rounded-xl px-3 py-2">{error}</p>}
            {notice && <p className="text-xs text-grace-ink bg-grace-mist rounded-xl px-3 py-2">{notice}</p>}
            <button type="submit" disabled={loading}
              className="btn-primary w-full flex items-center justify-center gap-2 mt-2">
              {loading
                ? <><Loader2 size={13} className="animate-spin"/> {mode === 'signin' ? 'Signing in…' : 'Creating account…'}</>
                : mode === 'signin' ? 'Sign In' : 'Create Account'}
            </button>
          </form>
        </div>

        <p className="text-center text-[11px] text-grace-stone mt-5">
          {mode === 'signin' ? "Don't have an account? " : 'Already have an account? '}
          <button onClick={() => { setMode(mode === 'signin' ? 'signup' : 'signin'); setError(''); setNotice('') }}
            className="text-grace-ink hover:underline font-bold">
            {mode === 'signin' ? 'Create one' : 'Sign in'}
          </button>
        </p>
      </div>
    </div>
  )
}
