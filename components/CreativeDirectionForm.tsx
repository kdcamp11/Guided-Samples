'use client'

import { useState } from 'react'
import { Loader2, CheckCircle2, ArrowLeft, Send } from 'lucide-react'
import { useAuth } from '@/lib/auth'
import AuthModal from '@/components/AuthModal'

interface Props {
  onBack: () => void
}

type Step = 'auth-gate' | 'form' | 'success'

function GraceMark({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" aria-label="GRACE mark">
      <circle cx="24" cy="24" r="23" stroke="#0A0A0A" strokeWidth="2"/>
      <circle cx="24" cy="24" r="7" fill="#C8372D"/>
    </svg>
  )
}

export default function CreativeDirectionForm({ onBack }: Props) {
  const { user } = useAuth()

  const [step,        setStep]        = useState<Step>(user ? 'form' : 'auth-gate')
  const [authOpen,    setAuthOpen]    = useState(false)
  const [loading,     setLoading]     = useState(false)
  const [error,       setError]       = useState('')

  // Form fields
  const [fullName,   setFullName]   = useState((user as { user_metadata?: { name?: string } } | null)?.user_metadata?.name ?? '')
  const [brand,      setBrand]      = useState('')
  const [email,      setEmail]      = useState(user?.email ?? '')
  const [project,    setProject]    = useState('')
  const [quantity,   setQuantity]   = useState('')

  function handleAuthSuccess() {
    setAuthOpen(false)
    setStep('form')
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!fullName.trim() || !brand.trim() || !email.trim() || !project.trim()) {
      setError('Please fill in all required fields.')
      return
    }
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/creative-direction', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fullName, brand, email, project, quantity }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Submission failed')
      setStep('success')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  // ── Auth gate ──────────────────────────────────────────────────────────────

  if (step === 'auth-gate') {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center px-4 py-16">
        <AuthModal
          open={authOpen}
          onClose={() => setAuthOpen(false)}
          onSuccess={handleAuthSuccess}
        />

        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-xs text-grace-stone hover:text-grace-ink transition-colors self-start mb-8 ml-4 sm:ml-0 max-w-lg w-full mx-auto tracking-widest uppercase font-bold"
        >
          <ArrowLeft size={12}/> Back
        </button>

        <div className="max-w-md w-full bg-white border border-grace-border rounded-3xl p-10 text-center">
          <GraceMark size={44}/>
          <p className="text-[10px] font-bold tracking-[0.2em] text-grace-stone uppercase mt-5 mb-1">Full Service</p>
          <h2 className="text-xl font-black text-grace-ink uppercase tracking-tight mb-3">Creative Direction</h2>
          <p className="text-sm text-grace-stone leading-relaxed mb-8">
            Create a free account or sign in to submit your project brief. Our team will review it and reach out within 2 business days.
          </p>
          <div className="flex flex-col gap-2">
            <button
              onClick={() => setAuthOpen(true)}
              className="btn-primary w-full flex items-center justify-center gap-2"
            >
              Create Account
            </button>
            <button
              onClick={() => setAuthOpen(true)}
              className="btn-secondary w-full"
            >
              Sign In
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ── Success ────────────────────────────────────────────────────────────────

  if (step === 'success') {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center px-4">
        <div className="max-w-md w-full bg-white border border-grace-border rounded-3xl p-10 text-center">
          <div className="w-12 h-12 rounded-full bg-grace-mist border border-grace-border flex items-center justify-center mx-auto mb-5">
            <CheckCircle2 size={20} className="text-grace-ink"/>
          </div>
          <p className="text-[10px] font-bold tracking-[0.2em] text-grace-stone uppercase mb-1">Brief Received</p>
          <h2 className="text-xl font-black text-grace-ink uppercase tracking-tight mb-3">You&apos;re In</h2>
          <p className="text-sm text-grace-stone leading-relaxed mb-8">
            Thanks, <strong className="text-grace-ink">{fullName}</strong>. Our team will review your project and reach out at <strong className="text-grace-ink">{email}</strong> within 2 business days.
          </p>
          <button onClick={onBack} className="btn-secondary w-full">
            Back to Home
          </button>
        </div>
      </div>
    )
  }

  // ── Form ───────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-white px-4 py-16">
      <div className="max-w-lg mx-auto">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-[10px] text-grace-stone hover:text-grace-ink transition-colors mb-10 tracking-widest uppercase font-bold"
        >
          <ArrowLeft size={12}/> Back
        </button>

        <div className="mb-10">
          <GraceMark size={40}/>
          <p className="text-[10px] font-bold tracking-[0.2em] text-grace-stone uppercase mt-5 mb-1">Full Service</p>
          <h1 className="text-3xl font-black text-grace-ink uppercase tracking-tight mb-3">Creative Direction</h1>
          <p className="text-sm text-grace-stone leading-relaxed">
            Tell us about your project. GRACE Studios will handle the design and production direction for you.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="bg-white border border-grace-border rounded-2xl p-8 space-y-5">
          <div>
            <label className="text-[10px] font-bold text-grace-stone uppercase tracking-widest mb-2 block">
              Full Name <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              className="input-field text-sm"
              placeholder="Jane Smith"
              value={fullName}
              onChange={e => setFullName(e.target.value)}
              required
            />
          </div>

          <div>
            <label className="text-[10px] font-bold text-grace-stone uppercase tracking-widest mb-2 block">
              Brand Name <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              className="input-field text-sm"
              placeholder="Your brand or company name"
              value={brand}
              onChange={e => setBrand(e.target.value)}
              required
            />
          </div>

          <div>
            <label className="text-[10px] font-bold text-grace-stone uppercase tracking-widest mb-2 block">
              Email <span className="text-red-400">*</span>
            </label>
            <input
              type="email"
              className="input-field text-sm"
              placeholder="you@yourbrand.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
            />
          </div>

          <div>
            <label className="text-[10px] font-bold text-grace-stone uppercase tracking-widest mb-2 block">
              Describe Your Project <span className="text-red-400">*</span>
            </label>
            <textarea
              className="input-field text-sm resize-none"
              rows={5}
              placeholder="What are you looking to create? Tell us about your vision, garment type, colorways, mood, target customer — anything that helps us understand your brand direction."
              value={project}
              onChange={e => setProject(e.target.value)}
              required
            />
          </div>

          <div>
            <label className="text-[10px] font-bold text-grace-stone uppercase tracking-widest mb-2 block">
              Estimated Quantity
            </label>
            <input
              type="text"
              className="input-field text-sm"
              placeholder="e.g. 50–100 pieces, 500+ units, not sure yet"
              value={quantity}
              onChange={e => setQuantity(e.target.value)}
            />
            <p className="text-[10px] text-grace-stone mt-1.5">Optional — helps us understand the scale of your project.</p>
          </div>

          {error && (
            <p className="text-xs text-red-500 bg-red-50 rounded-xl px-3 py-2">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="btn-primary w-full flex items-center justify-center gap-2 py-3"
          >
            {loading
              ? <><Loader2 size={13} className="animate-spin"/> Sending…</>
              : <><Send size={13}/> Submit Brief</>}
          </button>

          <p className="text-[10px] text-center text-grace-stone tracking-wide">
            Our team typically responds within 2 business days.
          </p>
        </form>
      </div>
    </div>
  )
}
