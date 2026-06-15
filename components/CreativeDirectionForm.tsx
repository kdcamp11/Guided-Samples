'use client'

import { useState } from 'react'
import { Loader2, CheckCircle2, ArrowLeft, Send, Sparkles } from 'lucide-react'
import { useAuth } from '@/lib/auth'
import AuthModal from '@/components/AuthModal'

interface Props {
  onBack: () => void
}

type Step = 'auth-gate' | 'form' | 'success'

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
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-4 py-16">
        <AuthModal
          open={authOpen}
          onClose={() => setAuthOpen(false)}
          onSuccess={handleAuthSuccess}
        />

        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-700 transition-colors self-start mb-8 ml-4 sm:ml-0 max-w-lg w-full mx-auto"
        >
          <ArrowLeft size={13}/> Back
        </button>

        <div className="max-w-md w-full card text-center">
          <div className="w-12 h-12 rounded-2xl bg-brand-green flex items-center justify-center mx-auto mb-4">
            <Sparkles size={20} className="text-white"/>
          </div>
          <h2 className="text-lg font-bold text-gray-900 mb-2">Creative Direction</h2>
          <p className="text-sm text-gray-500 leading-relaxed mb-6">
            Create a free account or sign in to submit your project brief. Our team will review it and reach out within 2 business days.
          </p>
          <div className="flex flex-col gap-2">
            <button
              onClick={() => setAuthOpen(true)}
              className="btn-primary w-full flex items-center justify-center gap-2"
            >
              <Sparkles size={14}/> Create Account
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
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="max-w-md w-full card text-center">
          <div className="w-12 h-12 rounded-2xl bg-brand-green/10 flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 size={22} className="text-brand-green"/>
          </div>
          <h2 className="text-lg font-bold text-gray-900 mb-2">Brief received!</h2>
          <p className="text-sm text-gray-500 leading-relaxed mb-6">
            Thanks, <strong>{fullName}</strong>. Our team will review your project and reach out at <strong>{email}</strong> within 2 business days.
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
    <div className="min-h-screen bg-gray-50 px-4 py-12">
      <div className="max-w-lg mx-auto">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-700 transition-colors mb-8"
        >
          <ArrowLeft size={13}/> Back
        </button>

        <div className="mb-8">
          <div className="w-10 h-10 rounded-xl bg-brand-green flex items-center justify-center mb-4">
            <Sparkles size={16} className="text-white"/>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Creative Direction</h1>
          <p className="text-sm text-gray-500 leading-relaxed">
            Tell us about your project. GRACE Studios will handle the design and production direction for you.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="card space-y-4">
          <div>
            <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1.5 block">
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
            <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1.5 block">
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
            <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1.5 block">
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
            <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1.5 block">
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
            <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1.5 block">
              Estimated Quantity
            </label>
            <input
              type="text"
              className="input-field text-sm"
              placeholder="e.g. 50–100 pieces, 500+ units, not sure yet"
              value={quantity}
              onChange={e => setQuantity(e.target.value)}
            />
            <p className="text-[10px] text-gray-400 mt-1">Optional — helps us understand the scale of your project.</p>
          </div>

          {error && (
            <p className="text-xs text-red-500 bg-red-50 rounded-lg px-3 py-2">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="btn-primary w-full flex items-center justify-center gap-2 py-3"
          >
            {loading
              ? <><Loader2 size={14} className="animate-spin"/> Sending…</>
              : <><Send size={14}/> Submit Brief</>}
          </button>

          <p className="text-[11px] text-center text-gray-400">
            Our team typically responds within 2 business days.
          </p>
        </form>
      </div>
    </div>
  )
}
