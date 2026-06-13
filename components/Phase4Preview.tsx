'use client'

import { useState, useEffect } from 'react'
import { ArrowLeft, ArrowRight, Loader2, RefreshCw, Sparkles, CheckCircle2 } from 'lucide-react'
import { AppState } from '@/app/page'
import { streamGenerate } from '@/lib/streamGenerate'
import { cacheGet, cacheSet, cacheKey } from '@/lib/generateCache'

interface Props {
  state: AppState
  onComplete: (preview: AppState['preview']) => void
  onBack: () => void
}

// The Phase 3 composite (garment with logo positioned on it) is the preferred
// input — it preserves the user's exact placement. Fall back to the bare garment.
function designImageOf(state: AppState): string {
  return state.design?.previewDataUrl || state.garment?.dataUrl || ''
}

function previewCacheKey(state: AppState) {
  // Use a short slice of the actual image data so cache is tied to the real assets
  return cacheKey('preview', designImageOf(state).slice(-40))
}

export default function Phase4Preview({ state, onComplete, onBack }: Props) {
  const [images, setImages] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [statusMsg, setStatusMsg] = useState('')
  const [error, setError] = useState('')
  const [generated, setGenerated] = useState(false)
  const [prompt, setPrompt] = useState('')

  // On mount: check if Phase 3 prefetched results into cache
  useEffect(() => {
    const cached = cacheGet<{ images: string[] }>(previewCacheKey(state))
    if (cached?.images?.length) {
      setImages(cached.images)
      setGenerated(true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleGenerate = async () => {
    setLoading(true)
    setError('')
    setStatusMsg('Starting...')

    const key = previewCacheKey(state)
    const cached = cacheGet<{ images: string[] }>(key)
    if (cached?.images?.length) {
      setImages(cached.images)
      setGenerated(true)
      setLoading(false)
      setStatusMsg('')
      return
    }

    try {
      const data = await streamGenerate<{ images: string[] }>(
        '/api/generate-preview',
        {
          garmentImage: designImageOf(state) || null,
          // Logo is already baked into the Phase 3 composite; only send separately as fallback
          logoImage: state.design?.previewDataUrl ? null : (state.logo?.dataUrl ?? null),
          placement: 'center chest',
          extraPrompt: prompt.trim() || undefined,
        },
        msg => setStatusMsg(msg),
      )
      cacheSet(key, data)
      setImages(data.images ?? [])
      setGenerated(true)
    } catch (e) {
      console.error(e)
      setError('Preview generation failed. Please try again.')
    } finally {
      setLoading(false)
      setStatusMsg('')
    }
  }

  const handleRegenerate = async () => {
    // Clear cache entry so we get fresh results
    const key = previewCacheKey(state)
    cacheSet(key, null, 0) // expire immediately
    setGenerated(false)
    setImages([])
    await handleGenerate()
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

            <div className="bg-white border border-slate-100 rounded-lg flex items-center justify-center mb-3" style={{ height: 140 }}>
              {designImageOf(state) ? (
                <img src={designImageOf(state)} alt="garment" className="w-full h-full object-contain p-2"/>
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
                <div className="flex justify-between">
                  <span className="text-gray-500">Logo</span>
                  <span className="text-gray-700">Applied</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-gray-500">Placement</span>
                <span className="text-gray-700">Center chest</span>
              </div>
            </div>
          </div>

          <div className="card">
            <p className="text-xs font-medium text-gray-600 mb-2">Preview prompt</p>
            <textarea
              className="w-full text-xs rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-gray-700 focus:outline-none focus:border-brand-green resize-none"
              rows={4}
              placeholder="Describe the scene, background, lighting, model, or styling… e.g. 'flat-lay on white marble', 'worn by a male model outdoors', 'dark moody studio lighting'"
              value={prompt}
              onChange={e => setPrompt(e.target.value)}
            />
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
            {generated && !loading && (
              <button
                onClick={handleRegenerate}
                className="p-1.5 rounded-lg hover:bg-slate-100 text-gray-400 hover:text-gray-700 transition-colors"
                title="Regenerate"
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
              <button onClick={handleGenerate} className="btn-primary flex items-center gap-2">
                <Sparkles size={14}/>
                Generate Preview
              </button>
            </div>
          )}

          {loading && (
            <div className="flex flex-col items-center justify-center text-center py-20 gap-4">
              <Loader2 size={36} className="animate-spin text-brand-green"/>
              <div>
                <p className="text-sm font-medium text-gray-700">{statusMsg || 'Creating your preview…'}</p>
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
                >
                  <img src={img} alt={`Preview ${i + 1}`} className="w-full object-contain p-3" style={{ minHeight: 320 }}/>
                </div>
              ))}
            </div>
          )}

          {error && !loading && (
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
                  <CheckCircle2 size={13} className={done ? 'text-brand-green' : 'text-gray-300'}/>
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
              {loading ? (statusMsg || 'Generating…') : 'Generate Preview'}
            </button>
          )}

          {generated && (
            <button
              onClick={handleRegenerate}
              disabled={loading}
              className="btn-secondary w-full flex items-center justify-center gap-2"
            >
              {loading ? <Loader2 size={14} className="animate-spin"/> : <RefreshCw size={14}/>}
              {loading ? (statusMsg || 'Generating…') : 'Regenerate'}
            </button>
          )}

          <button
            onClick={handleProceed}
            className="w-full flex items-center justify-center gap-2 font-medium py-3 px-4 rounded-xl transition-colors text-sm bg-brand-green hover:bg-brand-green-light text-white"
          >
            Proceed to Tech Pack
            <ArrowRight size={15}/>
          </button>

          {!generated && (
            <p className="text-center text-[11px] text-gray-400">
              Preview is optional — you can proceed directly
            </p>
          )}
        </div>

      </div>
    </div>
  )
}
