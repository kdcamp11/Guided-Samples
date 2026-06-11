'use client'

import { useState } from 'react'
import { RefreshCw, Download, Loader2, Sparkles, ArrowRight } from 'lucide-react'
import { AppState } from '@/app/page'
import { exportImage, downloadSVG } from '@/lib/export'

interface Props {
  state: AppState
  onComplete: (logo: AppState['logo']) => void
}

const EXAMPLES = [
  'Minimal streetwear logo with G',
  'Luxury fashion logo',
  'Athletic crest logo',
]

export default function Phase1Logo({ state, onComplete }: Props) {
  const [prompt, setPrompt] = useState(
    state.logo ? '' : 'Create a vintage athletic logo for my brand called GRACE. Make it minimal with an arrow element. Use forest green.'
  )
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{
    svg: string; variants: string[]; style: string; color: string
  } | null>(null)
  const [selectedVariant, setSelectedVariant] = useState(0)
  const [savedLogo, setSavedLogo] = useState<AppState['logo']>(state.logo)
  const [transparentBg, setTransparentBg] = useState(true)
  const [exporting, setExporting] = useState<string | null>(null)

  const svgToDataUrl = (svg: string): string => {
    const encoded = encodeURIComponent(svg)
    return `data:image/svg+xml;charset=utf-8,${encoded}`
  }

  const handleExport = async (fmt: 'svg' | 'png' | 'jpeg' | 'pdf') => {
    if (!currentSvg) return
    setExporting(fmt)
    try {
      const bg = transparentBg && (fmt === 'png' || fmt === 'svg') ? undefined : '#ffffff'
      await exportImage(currentSvg, fmt, 'GRACE_logo', bg)
    } catch (e) {
      console.error('Export failed', e)
      alert('Export failed — please try again.')
    } finally {
      setExporting(null)
    }
  }

  const handleGenerate = async () => {
    if (!prompt.trim()) return
    setLoading(true)
    try {
      const res = await fetch('/api/generate-logo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt }),
      })
      const data = await res.json()
      setResult(data)
      setSelectedVariant(0)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  const handleSaveLogo = () => {
    if (!result) return
    const svg = selectedVariant === 0 ? result.svg : result.variants[selectedVariant - 1]
    const logo = {
      svg,
      dataUrl: svgToDataUrl(svg),
      style: result.style,
      color: result.color,
    }
    setSavedLogo(logo)
  }

  const currentSvg = result
    ? (selectedVariant === 0 ? result.svg : result.variants[selectedVariant - 1])
    : null

  return (
    <div className="p-6 max-w-[1200px]">
      <div className="mb-5">
        <p className="phase-header">Phase 1</p>
        <h1 className="text-xl font-bold text-white">AI Logo Generation</h1>
        <p className="text-gray-500 text-sm mt-1">Describe your logo and let AI create it for you</p>
      </div>

      <div className="grid grid-cols-[280px_1fr_240px] gap-4">
        {/* Left: Input */}
        <div className="space-y-3">
          <div className="card">
            <label className="text-xs font-medium text-gray-400 mb-2 block">Describe the logo you want</label>
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
              {loading ? 'Generating…' : 'Generate Logo'}
            </button>
          </div>

          <div className="card">
            <p className="text-xs text-gray-500 mb-2">Try these examples</p>
            <div className="space-y-1.5">
              {EXAMPLES.map(ex => (
                <button
                  key={ex}
                  onClick={() => setPrompt(ex)}
                  className="w-full text-left text-xs text-gray-400 hover:text-white bg-dark-600 hover:bg-dark-500 px-3 py-2 rounded-lg transition-colors"
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
            <span className="text-xs font-medium text-gray-400">Generated Logo</span>
            {result && (
              <button onClick={handleGenerate} className="p-1.5 rounded-lg hover:bg-dark-500 text-gray-400 hover:text-white transition-colors">
                <RefreshCw size={14}/>
              </button>
            )}
          </div>

          {/* Main preview */}
          <div className="checkerboard rounded-xl overflow-hidden mb-3 flex items-center justify-center" style={{ height: 220 }}>
            {loading && (
              <div className="flex flex-col items-center gap-3 text-gray-500">
                <Loader2 size={32} className="animate-spin"/>
                <span className="text-sm">Generating your logo…</span>
              </div>
            )}
            {!loading && !result && (
              <div className="text-gray-600 text-sm">Your logo will appear here</div>
            )}
            {!loading && currentSvg && (
              <div
                dangerouslySetInnerHTML={{ __html: currentSvg }}
                className="w-full h-full flex items-center justify-center [&>svg]:max-w-full [&>svg]:max-h-full"
                style={{ padding: 16 }}
              />
            )}
          </div>

          {/* Variants */}
          {result && (
            <div className="grid grid-cols-4 gap-2">
              {[result.svg, ...result.variants].map((svg, i) => (
                <button
                  key={i}
                  onClick={() => setSelectedVariant(i)}
                  className={`checkerboard rounded-lg overflow-hidden transition-all ${
                    selectedVariant === i ? 'ring-2 ring-brand-green' : 'hover:ring-1 hover:ring-gray-500'
                  }`}
                  style={{ height: 72 }}
                >
                  <div
                    dangerouslySetInnerHTML={{ __html: svg }}
                    className="w-full h-full [&>svg]:w-full [&>svg]:h-full"
                    style={{ padding: 6 }}
                  />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Right: Actions */}
        <div className="space-y-3">
          <div className="card">
            <p className="text-xs font-medium text-gray-400 mb-3">Your Logo</p>
            <div className="checkerboard rounded-lg flex items-center justify-center mb-3" style={{ height: 120 }}>
              {savedLogo ? (
                <div
                  dangerouslySetInnerHTML={{ __html: savedLogo.svg }}
                  className="w-full h-full [&>svg]:w-full [&>svg]:h-full"
                  style={{ padding: 8 }}
                />
              ) : (
                <div className="text-gray-600 text-xs text-center px-4">Save a logo to use it</div>
              )}
            </div>

            {currentSvg && (
              <button
                onClick={() => handleExport('png')}
                disabled={!!exporting}
                className="btn-primary w-full flex items-center justify-center gap-2 mb-2"
              >
                {exporting ? <Loader2 size={14} className="animate-spin"/> : <Download size={14}/>}
                {exporting ? 'Exporting…' : 'Download'}
              </button>
            )}

            {currentSvg && (
              <div className="grid grid-cols-3 gap-1 text-xs mb-3">
                {(['PNG', 'SVG', 'PDF'] as const).map(fmt => (
                  <button
                    key={fmt}
                    onClick={() => handleExport(fmt.toLowerCase() as 'png' | 'svg' | 'pdf')}
                    disabled={!!exporting}
                    className="btn-secondary py-1 text-center disabled:opacity-50"
                  >
                    {exporting === fmt.toLowerCase() ? '…' : fmt}
                  </button>
                ))}
              </div>
            )}

            <label className="flex items-center gap-2 text-xs text-gray-400 cursor-pointer">
              <input
                type="checkbox"
                checked={transparentBg}
                onChange={e => setTransparentBg(e.target.checked)}
                className="accent-brand-green"
              />
              Transparent Background
            </label>
          </div>

          {result && (
            <div className="card">
              <p className="text-xs font-medium text-gray-400 mb-2">Logo Details</p>
              <div className="space-y-1.5 text-xs">
                <div className="flex justify-between">
                  <span className="text-gray-500">Style</span>
                  <span className="text-gray-300">{result.style}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-500">Color</span>
                  <div className="flex items-center gap-1.5">
                    <div className="w-3 h-3 rounded-full" style={{ background: result.color }}/>
                    <span className="text-gray-300 font-mono">{result.color.toUpperCase()}</span>
                  </div>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Created</span>
                  <span className="text-gray-300">{new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                </div>
              </div>
            </div>
          )}

          {currentSvg && (
            <button
              onClick={() => {
                handleSaveLogo()
                const svg = selectedVariant === 0 ? result!.svg : result!.variants[selectedVariant - 1]
                onComplete({
                  svg,
                  dataUrl: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`,
                  style: result!.style,
                  color: result!.color,
                })
              }}
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
