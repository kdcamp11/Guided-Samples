'use client'

import { useState } from 'react'
import { ArrowLeft, ArrowRight, Loader2, RefreshCw, Sparkles, CheckCircle2 } from 'lucide-react'
import { AppState } from '@/app/page'

interface Props {
  state: AppState
  onComplete: (preview: AppState['preview']) => void
  onBack: () => void
}

export default function Phase4Preview({ state, onComplete, onBack }: Props) {
  const [images, setImages] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [generated, setGenerated] = useState(false)

  const handleGenerate = async () => {
    setLoading(true)
    setError('')
    try {
      const garment = state.garment
      const logo = state.logo
      const res = await fetch('/api/generate-preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          garmentType: garment?.type ?? 'hoodie',
          garmentColor: garment?.color ?? 'black',
          logoStyle: logo?.style ?? 'minimal',
          logoColor: logo?.color ?? '#184D3E',
          placement: 'center chest',
        }),
      })
      if (!res.ok) throw new Error('Request failed')
      const data = await res.json()
      setImages(data.images ?? [])
      setGenerated(true)
    } catch (e) {
      console.error(e)
      setError('Preview generation failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const handleProceed = () => {
    onComplete({ images })
  }

  return (
    <div className="p-6 w-full">
      <div className="mb-5 flex items-start justify-between">
        <div>
          <p className="phase-header">Phase 4</p>
          <h1 className="text-xl font-bold text-gray-900">Preview in Reality</h1>
          <p className="text-gray-500 text-sm mt-1">See your design as a finished, lifelike product</p>
        </div>
        <button onClick={onBack} className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-700 transition-colors mt-1">
          <ArrowLeft size={14}/>
          Back
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr_220px] gap-4">

        {/* Left: Design summary */}
        <div className="space-y-3">
          <div className="card">
            <p className="text-xs font-medium text-gray-600 mb-3">Your Design</p>

            {/* Garment thumbnail */}
            <div className="bg-white border border-slate-100 rounded-lg flex items-center justify-center mb-3" style={{ height: 140 }}>
              {state.garment ? (
                <img src={state.garment.dataUrl} alt="garment" className="w-full h-full object-contain p-2"/>
              ) : (
                <div className="text-xs text-gray-400 text-center px-4">No garment</div>
              )}
            </div>

            <div className="space-y-2 text-xs">
              {state.garment && (
                <>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Garment</span>
                    <span className="text-gray-700 capitalize">{state.garment.type !== 'custom' ? state.garment.type : 'Custom'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Color</span>
                    <span className="text-gray-700 capitalize">{state.garment.color !== 'custom' ? state.garment.color : 'Custom'}</span>
                  </div>
                </>
              )}
              {state.logo && (
                <>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Logo style</span>
                    <span className="text-gray-700">{state.logo.style}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-500">Logo color</span>
                    <div className="flex items-center gap-1.5">
                      <div className="w-3 h-3 rounded-full border border-slate-200" style={{ background: state.logo.color }}/>
                      <span className="text-gray-700 font-mono">{state.logo.color.toUpperCase()}</span>
                    </div>
                  </div>
                </>
              )}
              <div className="flex justify-between">
                <span className="text-gray-500">Placement</span>
                <span className="text-gray-700">Center chest</span>
              </div>
            </div>
          </div>

          <div className="card">
            <p className="text-xs font-medium text-gray-600 mb-2">What to expect</p>
            <ul className="space-y-2">
              {[
                'Realistic studio photography',
                'True-to-life fabric texture',
                'Accurate logo placement',
                'Professional product look',
              ].map(item => (
                <li key={item} className="flex items-start gap-2 text-xs text-gray-500">
                  <CheckCircle2 size={12} className="text-brand-green mt-0.5 shrink-0"/>
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Center: Preview output */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <span className="text-xs font-medium text-gray-600">Realistic Visualization</span>
            {generated && (
              <button
                onClick={handleGenerate}
                disabled={loading}
                className="p-1.5 rounded-lg hover:bg-slate-100 text-gray-400 hover:text-gray-700 transition-colors"
              >
                <RefreshCw size={14}/>
              </button>
            )}
          </div>

          {!generated && !loading && (
            <div className="flex flex-col items-center justify-center text-center py-20">
              <div className="w-16 h-16 rounded-2xl bg-brand-green/10 flex items-center justify-center mb-4">
                <Sparkles size={28} className="text-brand-green"/>
              </div>
              <h3 className="text-sm font-semibold text-gray-900 mb-1">Ready to visualize</h3>
              <p className="text-xs text-gray-400 max-w-xs mb-6">
                Generate a photorealistic preview of your product using your exact design specifications.
              </p>
              <button
                onClick={handleGenerate}
                className="btn-primary flex items-center gap-2"
              >
                <Sparkles size={14}/>
                Generate Preview
              </button>
            </div>
          )}

          {loading && (
            <div className="flex flex-col items-center justify-center text-center py-20 gap-4">
              <Loader2 size={36} className="animate-spin text-brand-green"/>
              <div>
                <p className="text-sm font-medium text-gray-700">Creating your preview…</p>
                <p className="text-xs text-gray-400 mt-1">This can take 15–30 seconds</p>
              </div>
              <div className="flex gap-1 mt-2">
                {[0, 1, 2].map(i => (
                  <div
                    key={i}
                    className="w-1.5 h-1.5 rounded-full bg-brand-green animate-bounce"
                    style={{ animationDelay: `${i * 0.15}s` }}
                  />
                ))}
              </div>
            </div>
          )}

          {generated && !loading && images.length > 0 && (
            <div className="grid grid-cols-2 gap-3">
              {images.map((img, i) => (
                <div
                  key={i}
                  className="bg-white border border-slate-100 rounded-xl overflow-hidden"
                  style={{ height: 320 }}
                >
                  <img src={img} alt={`Preview ${i + 1}`} className="w-full h-full object-contain p-3"/>
                </div>
              ))}
            </div>
          )}

          {error && (
            <div className="flex flex-col items-center justify-center text-center py-12 gap-3">
              <p className="text-sm text-red-500">{error}</p>
              <button onClick={handleGenerate} className="btn-secondary flex items-center gap-2">
                <RefreshCw size={13}/> Try again
              </button>
            </div>
          )}
        </div>

        {/* Right: Actions */}
        <div className="space-y-3">
          <div className="card">
            <p className="text-xs font-medium text-gray-600 mb-3">Preview Status</p>
            <div className="space-y-2">
              {[
                { label: 'Design confirmed', done: !!state.design },
                { label: 'Preview generated', done: generated && images.length > 0 },
              ].map(({ label, done }) => (
                <div key={label} className="flex items-center gap-2 text-xs">
                  <CheckCircle2
                    size={13}
                    className={done ? 'text-brand-green' : 'text-gray-300'}
                  />
                  <span className={done ? 'text-gray-700' : 'text-gray-400'}>{label}</span>
                </div>
              ))}
            </div>
          </div>

          {!generated && (
            <button
              onClick={handleGenerate}
              disabled={loading}
              className="btn-primary w-full flex items-center justify-center gap-2"
            >
              {loading ? <Loader2 size={14} className="animate-spin"/> : <Sparkles size={14}/>}
              {loading ? 'Generating…' : 'Generate Preview'}
            </button>
          )}

          <button
            onClick={handleProceed}
            className={`w-full flex items-center justify-center gap-2 font-medium py-3 px-4 rounded-xl transition-colors text-sm ${
              generated
                ? 'bg-brand-green hover:bg-brand-green-light text-white'
                : 'bg-slate-100 text-gray-400 cursor-not-allowed'
            }`}
            disabled={!generated}
          >
            Proceed to Tech Pack
            <ArrowRight size={15}/>
          </button>

          {generated && (
            <button
              onClick={handleProceed}
              className="w-full text-center text-xs text-gray-400 hover:text-gray-700 transition-colors"
            >
              Skip — proceed without preview →
            </button>
          )}
        </div>

      </div>
    </div>
  )
}
