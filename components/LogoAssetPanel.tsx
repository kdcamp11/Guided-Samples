'use client'
import { useState } from 'react'
import { Loader2, Sparkles, Upload, X, ImagePlus, RefreshCw, ArrowRight, Wand2 } from 'lucide-react'
import { AppState } from '@/app/page'
import { streamGenerate, PaywallError } from '@/lib/streamGenerate'
import { cacheGet, cacheSet, cacheKey } from '@/lib/generateCache'
import { removeBackgroundClean, cleanBackgroundRemote, trimTransparent } from '@/lib/removeWhiteBg'
import { fileToDataUrl } from '@/lib/fileToDataUrl'
import { useAICredits } from '@/lib/aiCreditsContext'
import GenerationCounter from '@/components/GenerationCounter'
import AIUsageHint from '@/components/AIUsageHint'

interface Props {
  state: AppState
  onLogoUpdate: (logo: AppState['logo']) => void
}

interface LogoResult {
  source: 'openai' | 'svg'
  images: string[]
  svgs: (string | null)[]
  style: string
  color: string
}

export default function LogoAssetPanel({ state, onLogoUpdate }: Props) {
  const credits = useAICredits()
  const [subMode, setSubMode] = useState<'pick' | 'generate' | 'upload'>('pick')
  const [prompt, setPrompt] = useState('Create a vintage athletic logo for my brand called GRACE. Make it minimal with an arrow element. Use forest green.')
  const [loading, setLoading] = useState(false)
  const [statusMsg, setStatusMsg] = useState('')
  const [error, setError] = useState('')
  const [result, setResult] = useState<LogoResult | null>(null)
  const [selectedVariant, setSelectedVariant] = useState(0)
  const [referenceImage, setReferenceImage] = useState<string | null>(null)
  const [cleaning, setCleaning] = useState(false)

  // Aggressive, opt-in background removal. Upload already runs the gentle
  // client-side flood-fill; this button escalates to the server-side AI (rembg)
  // cutout for logos the flood-fill couldn't fully clear (baked-in checkerboards,
  // multi-color/photographic backgrounds, soft anti-aliased edges). May soften
  // very fine borders — that's the accepted tradeoff for a true cutout. Falls
  // back to the original (then trimmed) when the AI service is unavailable.
  const handleCleanBackground = async () => {
    if (!state.logo || cleaning) return
    setCleaning(true)
    try {
      let cleaned = await cleanBackgroundRemote(state.logo.dataUrl)
      try { cleaned = await trimTransparent(cleaned) } catch {}
      onLogoUpdate({ ...state.logo, dataUrl: cleaned })
    } finally {
      setCleaning(false)
    }
  }

  const currentImage = result ? result.images[selectedVariant] : null
  const currentSvg = result ? result.svgs[selectedVariant] : null

  const handleGenerate = async () => {
    if (!prompt.trim()) return
    setLoading(true)
    setError('')
    setStatusMsg('Starting...')
    const key = cacheKey('logo', prompt, referenceImage ?? '')
    const cached = cacheGet<LogoResult>(key)
    if (cached) {
      setResult(cached)
      setSelectedVariant(0)
      setLoading(false)
      setStatusMsg('')
      await applyLogo(cached.images[0], cached.svgs[0] ?? '', cached.style, cached.color)
      return
    }
    try {
      const headers = await credits.getGenerationHeaders()
      const data = await streamGenerate<LogoResult>(
        '/api/generate-logo',
        { prompt, referenceImage },
        msg => setStatusMsg(msg),
        headers,
      )
      cacheSet(key, data)
      setResult(data)
      setSelectedVariant(0)
      credits.onGenerationComplete()
      await applyLogo(data.images[0], data.svgs[0] ?? '', data.style, data.color)
    } catch (e) {
      if (e instanceof PaywallError) { credits.openPaywall(); return }
      console.error(e)
      setError('Generation failed. Please try again.')
    } finally {
      setLoading(false)
      setStatusMsg('')
    }
  }

  const handleRegenerate = async () => {
    const key = cacheKey('logo', prompt, referenceImage ?? '')
    cacheSet(key, null, 0)
    await handleGenerate()
  }

  const applyLogo = async (image: string, svg: string, style: string, color: string) => {
    let dataUrl = image
    try { dataUrl = await removeBackgroundClean(image) } catch {}
    const logo = { svg, dataUrl, style, color }
    onLogoUpdate(logo)
  }

  const handleSelectVariant = async (i: number) => {
    if (!result) return
    setSelectedVariant(i)
    await applyLogo(result.images[i], result.svgs[i] ?? '', result.style, result.color)
  }

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    try {
      let dataUrl = await fileToDataUrl(file)
      try { dataUrl = await removeBackgroundClean(dataUrl) } catch {}
      const logo = { svg: '', dataUrl, style: 'Uploaded', color: '#0A0A0A' }
      onLogoUpdate(logo)
    } catch (err) {
      console.error('Upload failed', err)
    }
  }

  // ── Pick mode ──────────────────────────────────────────────────────────────
  if (subMode === 'pick') {
    return (
      <div className="space-y-2 p-3">
        {state.logo && (
          <button
            onClick={handleCleanBackground}
            disabled={cleaning}
            className="mb-3 w-full flex items-center justify-center gap-1.5 p-2.5 rounded-lg bg-gray-900 text-white text-[11px] hover:bg-black disabled:opacity-50 transition-colors"
            title="Already auto-cleaned on upload. Click to run a deeper AI cutout for tricky backgrounds (checkerboards, photos, soft edges). Counts as one AI generation."
          >
            {cleaning ? <Loader2 size={12} className="animate-spin"/> : <Wand2 size={12}/>}
            {cleaning ? 'Removing…' : 'Deep Clean (AI)'}
            <AIUsageHint />
          </button>
        )}
        <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-3">Logo Source</p>
        <button
          onClick={() => setSubMode('generate')}
          className="w-full flex items-center gap-3 p-3 rounded-xl border border-slate-200 hover:border-grace-ink transition-all text-left"
        >
          <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
            <Sparkles size={16} className="text-gray-500"/>
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-800">AI Generate Logo</p>
            <p className="text-[11px] text-gray-400">Describe your logo concept</p>
          </div>
          <ArrowRight size={13} className="ml-auto text-gray-300"/>
        </button>
        <button
          onClick={() => setSubMode('upload')}
          className="w-full flex items-center gap-3 p-3 rounded-xl border border-slate-200 hover:border-grace-ink transition-all text-left"
        >
          <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
            <Upload size={16} className="text-gray-500"/>
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-800">Upload Logo</p>
            <p className="text-[11px] text-gray-400">Upload your own PNG/SVG/PDF</p>
          </div>
          <ArrowRight size={13} className="ml-auto text-gray-300"/>
        </button>
      </div>
    )
  }

  // ── Upload mode ────────────────────────────────────────────────────────────
  if (subMode === 'upload') {
    return (
      <div className="p-3 space-y-3">
        <button onClick={() => setSubMode('pick')} className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-700 transition-colors">
          <X size={13}/> Back
        </button>
        <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Upload Logo</p>
        <label className="btn-primary w-full flex items-center justify-center gap-2 cursor-pointer text-xs">
          <Upload size={13}/> Choose File
          <input type="file" className="hidden" accept="image/png,image/svg+xml,application/pdf,.png,.svg,.pdf" onChange={handleUpload}/>
        </label>
        <p className="text-[10px] text-gray-400 text-center">PNG, SVG, or PDF — transparent backgrounds work best</p>
      </div>
    )
  }

  // ── Generate mode ──────────────────────────────────────────────────────────
  return (
    <div className="p-3 space-y-3">
      <button onClick={() => setSubMode('pick')} className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-700 transition-colors">
        <X size={13}/> Back
      </button>
      <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">AI Generate Logo</p>

      <textarea
        className="textarea-field text-xs"
        rows={4}
        value={prompt}
        onChange={e => setPrompt(e.target.value)}
        placeholder="Describe your logo..."
      />

      {/* Reference image */}
      <div>
        {referenceImage ? (
          <div className="relative rounded-lg overflow-hidden border border-slate-200" style={{ height: 60 }}>
            <img src={referenceImage} alt="Reference" className="w-full h-full object-cover"/>
            <button onClick={() => setReferenceImage(null)}
              className="absolute top-1 right-1 w-5 h-5 rounded-full bg-white/90 flex items-center justify-center text-gray-600 hover:text-red-500 transition-colors shadow">
              <X size={11}/>
            </button>
          </div>
        ) : (
          <label className="flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed border-slate-300 hover:border-brand-green cursor-pointer transition-colors text-[11px] text-gray-400 hover:text-gray-700">
            <ImagePlus size={12}/>
            Add reference image
            <input type="file" className="hidden" accept="image/*"
              onChange={e => {
                const file = e.target.files?.[0]; if (!file) return
                const reader = new FileReader()
                reader.onload = ev => setReferenceImage(ev.target?.result as string)
                reader.readAsDataURL(file); e.target.value = ''
              }}/>
          </label>
        )}
      </div>

      <button onClick={handleGenerate} disabled={loading || !prompt.trim()}
        className="btn-primary w-full flex items-center justify-center gap-2 text-xs">
        {loading ? <><Loader2 size={13} className="animate-spin"/> {statusMsg || 'Generating…'}</> : <><Sparkles size={13}/> Generate Logo</>}
      </button>
      <div className="flex items-center justify-center gap-1.5">
        <GenerationCounter />
        <AIUsageHint />
      </div>
      {error && <p className="text-[10px] text-red-500">{error}</p>}

      {currentImage && !loading && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-[11px] text-gray-500">Generated</p>
            <button onClick={handleRegenerate} className="p-1 rounded hover:bg-slate-100 text-gray-400 transition-colors">
              <RefreshCw size={12}/>
            </button>
          </div>
          <div className="rounded-lg border border-brand-green/30 overflow-hidden bg-white flex items-center justify-center" style={{ height: 80 }}>
            <img src={currentImage} alt="Generated logo" className="max-h-full max-w-full object-contain p-2"/>
          </div>
          <p className="text-[10px] text-brand-green text-center">Applied to canvas automatically</p>
          {result && result.images.length > 1 && (
            <div className="grid grid-cols-4 gap-1">
              {result.images.map((img, i) => (
                <button key={i} onClick={() => handleSelectVariant(i)}
                  className={`rounded border overflow-hidden transition-all ${selectedVariant === i ? 'ring-2 ring-brand-green border-brand-green' : 'border-slate-200 hover:border-slate-300'}`}
                  style={{ height: 48 }}>
                  <img src={img} alt={`Variant ${i + 1}`} className="w-full h-full object-contain p-0.5"/>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
