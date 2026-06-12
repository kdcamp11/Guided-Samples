'use client'

import { useState, useRef } from 'react'
import { RefreshCw, Download, Loader2, Sparkles, ArrowRight, Upload, ImagePlus, X } from 'lucide-react'
import { AppState } from '@/app/page'
import { exportAsset } from '@/lib/export'
import { streamGenerate } from '@/lib/streamGenerate'
import { cacheGet, cacheSet, cacheKey } from '@/lib/generateCache'
import { removeWhiteBackground } from '@/lib/removeWhiteBg'

interface Props {
  state: AppState
  onComplete: (logo: AppState['logo']) => void
  onSkip: () => void
}

interface LogoResult {
  source: 'openai' | 'svg'
  images: string[]
  svgs: (string | null)[]
  style: string
  color: string
}

const EXAMPLES = [
  'Minimal streetwear logo with G',
  'Luxury fashion logo',
  'Athletic crest logo',
]

export default function Phase1Logo({ state, onComplete, onSkip }: Props) {
  const [prompt, setPrompt] = useState(
    state.logo ? '' : 'Create a vintage athletic logo for my brand called GRACE. Make it minimal with an arrow element. Use forest green.'
  )
  const [loading, setLoading] = useState(false)
  const [statusMsg, setStatusMsg] = useState('')
  const [error, setError] = useState('')
  const [result, setResult] = useState<LogoResult | null>(null)
  const [selectedVariant, setSelectedVariant] = useState(0)
  const [savedLogo, setSavedLogo] = useState<AppState['logo']>(state.logo)
  const [transparentBg, setTransparentBg] = useState(true)
  const [exporting, setExporting] = useState<string | null>(null)
  const [referenceImage, setReferenceImage] = useState<string | null>(null)
  const referenceInputRef = useRef<HTMLInputElement>(null)

  const currentImage = result ? result.images[selectedVariant] : null
  const currentSvg = result ? result.svgs[selectedVariant] : null

  const handleExport = async (fmt: 'svg' | 'png' | 'jpeg' | 'pdf') => {
    if (!currentImage) return
    setExporting(fmt)
    try {
      const bg = transparentBg && (fmt === 'png' || fmt === 'svg') ? undefined : '#ffffff'
      await exportAsset({ svg: currentSvg, image: currentImage }, fmt, 'GRACE_logo', bg)
    } catch (e) {
      console.error('Export failed', e)
      alert('Export failed — please try again.')
    } finally {
      setExporting(null)
    }
  }

  const handleRegenerate = async () => {
    const key = cacheKey('logo', prompt, referenceImage ?? '')
    cacheSet(key, null, 0)
    await handleGenerate()
  }

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
      return
    }

    try {
      const data = await streamGenerate<LogoResult>(
        '/api/generate-logo',
        { prompt, referenceImage },
        msg => setStatusMsg(msg),
      )
      cacheSet(key, data)
      setResult(data)
      setSelectedVariant(0)
    } catch (e) {
      console.error(e)
      setError('Generation failed. Please try again.')
    } finally {
      setLoading(false)
      setStatusMsg('')
    }
  }

  const handleUse = async () => {
    if (!result || !currentImage) return
    let dataUrl = currentImage
    try {
      dataUrl = await removeWhiteBackground(currentImage)
    } catch (e) {
      console.error('White background removal failed, using original', e)
    }
    const logo = {
      svg: currentSvg || '',
      dataUrl,
      style: result.style,
      color: result.color,
    }
    setSavedLogo(logo)
    onComplete(logo)
  }

  const handleUploadLogo = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = async ev => {
      let dataUrl = ev.target?.result as string
      try {
        dataUrl = await removeWhiteBackground(dataUrl)
      } catch (e) {
        console.error('White background removal failed, using original', e)
      }
      const logo = {
        svg: '',
        dataUrl,
        style: 'Uploaded',
        color: '#184D3E',
      }
      onComplete(logo)
    }
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  return (
    <div className="p-6 w-full">
      <div className="mb-5">
        <p className="phase-header">Phase 1</p>
        <h1 className="text-xl font-bold text-gray-900">AI Logo Generation</h1>
        <p className="text-gray-500 text-sm mt-1">Describe your logo and let AI create it for you</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr_240px] gap-4">
        {/* Left: Input */}
        <div className="space-y-3">
          <div className="card">
            <label className="text-xs font-medium text-gray-600 mb-2 block">Describe the logo you want</label>
            <textarea
              className="textarea-field"
              rows={6}
              value={prompt}
              onChange={e => setPrompt(e.target.value)}
              placeholder="Describe your logo..."
              onKeyDown={e => { if (e.key === 'Enter' && e.metaKey) handleGenerate() }}
            />
            <button
              onClick={handleGenerate}
              disabled={loading || !prompt.trim()}
              className="btn-primary w-full mt-3 flex items-center justify-center gap-2"
            >
              {loading ? <Loader2 size={15} className="animate-spin"/> : <Sparkles size={15}/>}
              {loading ? (statusMsg || 'Generating…') : 'Generate Logo'}
            </button>
            {error && <p className="text-[11px] text-red-500 mt-2">{error}</p>}

            {/* Reference image */}
            <div className="mt-3">
              {referenceImage ? (
                <div className="relative rounded-lg overflow-hidden border border-slate-200" style={{ height: 80 }}>
                  <img src={referenceImage} alt="Reference" className="w-full h-full object-cover"/>
                  <button
                    onClick={() => setReferenceImage(null)}
                    className="absolute top-1 right-1 w-5 h-5 rounded-full bg-white/90 flex items-center justify-center text-gray-600 hover:text-red-500 transition-colors shadow"
                  >
                    <X size={11}/>
                  </button>
                  <span className="absolute bottom-1 left-2 text-[10px] text-white bg-black/50 rounded px-1.5 py-0.5">Reference</span>
                </div>
              ) : (
                <label className="flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed border-slate-300 hover:border-brand-green cursor-pointer transition-colors text-xs text-gray-400 hover:text-gray-700">
                  <ImagePlus size={13}/>
                  Add reference image
                  <input
                    ref={referenceInputRef}
                    type="file"
                    className="hidden"
                    accept="image/*"
                    onChange={e => {
                      const file = e.target.files?.[0]
                      if (!file) return
                      const reader = new FileReader()
                      reader.onload = ev => setReferenceImage(ev.target?.result as string)
                      reader.readAsDataURL(file)
                      e.target.value = ''
                    }}
                  />
                </label>
              )}
            </div>

            <div className="flex items-center gap-2 my-3">
              <div className="h-px bg-slate-200 flex-1"/>
              <span className="text-[10px] text-gray-400 uppercase tracking-wider">or</span>
              <div className="h-px bg-slate-200 flex-1"/>
            </div>
            <label className="btn-secondary w-full flex items-center justify-center gap-2 cursor-pointer">
              <Upload size={14}/>
              Upload Your Own Logo
              <input type="file" className="hidden" accept="image/*" onChange={handleUploadLogo}/>
            </label>
            <button
              onClick={onSkip}
              className="w-full text-center text-xs text-gray-400 hover:text-gray-700 transition-colors mt-2.5"
            >
              Skip — I&apos;ll add a logo later →
            </button>
          </div>

          <div className="card">
            <p className="text-xs text-gray-500 mb-2">Try these examples</p>
            <div className="space-y-1.5">
              {EXAMPLES.map(ex => (
                <button
                  key={ex}
                  onClick={() => setPrompt(ex)}
                  className="w-full text-left text-xs text-gray-600 hover:text-gray-900 bg-slate-50 hover:bg-slate-100 px-3 py-2 rounded-lg transition-colors"
                >
                  {ex}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Center: Preview */}
        <div className="card">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-medium text-gray-600">Generated Logo</span>
            {result && (
              <button onClick={handleRegenerate} className="p-1.5 rounded-lg hover:bg-slate-100 text-gray-400 hover:text-gray-700 transition-colors" title="Regenerate (new result)">
                <RefreshCw size={14}/>
              </button>
            )}
          </div>

          <div className="bg-white border border-slate-100 rounded-xl overflow-hidden mb-3 flex items-center justify-center" style={{ height: 280 }}>
            {loading && (
              <div className="flex flex-col items-center gap-3 text-gray-400">
                <Loader2 size={32} className="animate-spin text-brand-green"/>
                <span className="text-sm text-gray-700">{statusMsg || 'Generating your logo…'}</span>
                <span className="text-xs text-gray-400">This can take 10–30 seconds</span>
              </div>
            )}
            {!loading && !result && (
              <div className="text-gray-400 text-sm">Your logo will appear here</div>
            )}
            {!loading && currentImage && (
              <img src={currentImage} alt="Generated logo" className="max-w-full max-h-full object-contain p-4"/>
            )}
          </div>

          {currentImage && !loading && (
            <div className="flex items-center gap-2 mb-3">
              <button
                onClick={() => handleExport('png')}
                disabled={!!exporting}
                className="btn-primary flex items-center gap-2 flex-1 justify-center"
              >
                {exporting === 'png' ? <Loader2 size={13} className="animate-spin"/> : <Download size={13}/>}
                {exporting === 'png' ? 'Exporting…' : 'Download PNG'}
              </button>
              <button
                onClick={() => handleExport('pdf')}
                disabled={!!exporting}
                className="btn-secondary px-3 py-2 text-xs"
              >PDF</button>
            </div>
          )}

          {result && result.images.length > 1 && (
            <div className="grid grid-cols-4 gap-2">
              {result.images.map((img, i) => (
                <button
                  key={i}
                  onClick={() => setSelectedVariant(i)}
                  className={`bg-white border border-slate-100 rounded-lg overflow-hidden transition-all ${
                    selectedVariant === i ? 'ring-2 ring-brand-green' : 'hover:ring-1 hover:ring-slate-300'
                  }`}
                  style={{ height: 72 }}
                >
                  <img src={img} alt={`Variant ${i + 1}`} className="w-full h-full object-contain p-1.5"/>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Right: Actions */}
        <div className="space-y-3">
          <div className="card">
            <p className="text-xs font-medium text-gray-600 mb-3">Your Logo</p>
            <div className="bg-white border border-slate-100 rounded-lg flex items-center justify-center mb-3" style={{ height: 120 }}>
              {savedLogo ? (
                <img src={savedLogo.dataUrl} alt="Your logo" className="w-full h-full object-contain p-2"/>
              ) : (
                <div className="text-gray-400 text-xs text-center px-4">Save a logo to use it</div>
              )}
            </div>

            <label className="flex items-center gap-2 text-xs text-gray-500 cursor-pointer">
              <input
                type="checkbox"
                checked={transparentBg}
                onChange={e => setTransparentBg(e.target.checked)}
                className="accent-brand-green"
              />
              Transparent background on export
            </label>
          </div>

          {result && (
            <div className="card">
              <p className="text-xs font-medium text-gray-600 mb-2">Logo Details</p>
              <div className="space-y-1.5 text-xs">
                <div className="flex justify-between">
                  <span className="text-gray-500">Engine</span>
                  <span className="text-gray-700">{result.source === 'openai' ? 'OpenAI gpt-image-2' : 'Built-in'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Variants</span>
                  <span className="text-gray-700">{result.images.length}</span>
                </div>
              </div>
            </div>
          )}

          {currentImage && (
            <button
              onClick={handleUse}
              className="w-full flex items-center justify-center gap-2 bg-brand-green hover:bg-brand-green-light text-white font-medium py-3 px-4 rounded-xl transition-colors text-sm"
            >
              Use This Logo
              <ArrowRight size={15}/>
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
