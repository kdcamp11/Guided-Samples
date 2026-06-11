'use client'

import { useState, useCallback } from 'react'
import { useDropzone } from 'react-dropzone'
import { Upload, Cpu, Loader2, Download, ArrowRight, ArrowLeft, ImageIcon } from 'lucide-react'
import { AppState } from '@/app/page'
import { exportAsset } from '@/lib/export'

interface GarmentResult {
  source: 'openai' | 'svg'
  images: string[]
  svgs: (string | null)[]
  garmentType: string
  color: string
}

interface Props {
  state: AppState
  onComplete: (garment: AppState['garment']) => void
  onBack: () => void
}

const COLORS = [
  { label: 'Black', value: 'Black' },
  { label: 'White', value: 'White' },
  { label: 'Navy', value: 'Navy' },
  { label: 'Grey', value: 'Grey' },
  { label: 'Forest Green', value: 'Forest Green' },
  { label: 'Burgundy', value: 'Burgundy' },
]

export default function Phase2Garment({ state, onComplete, onBack }: Props) {
  const [mode, setMode] = useState<'upload' | 'generate'>('generate')
  const [prompt, setPrompt] = useState(
    'Oversized unisex hoodie, 450gsm, french terry cotton, drop shoulder, double layered hood, ribbed cuffs and hem.'
  )
  const [color, setColor] = useState('Black')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<GarmentResult | null>(null)
  const [selectedVariant, setSelectedVariant] = useState(0)
  const [uploadedImage, setUploadedImage] = useState<string | null>(null)
  const [exporting, setExporting] = useState<string | null>(null)

  const onDrop = useCallback((files: File[]) => {
    const file = files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = e => {
      setUploadedImage(e.target?.result as string)
    }
    reader.readAsDataURL(file)
  }, [])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'image/*': ['.png', '.jpg', '.jpeg', '.webp'] },
    multiple: false,
  })

  const handleGenerate = async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/generate-garment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: `${prompt} Color: ${color}` }),
      })
      if (!res.ok) throw new Error('Request failed')
      const data: GarmentResult = await res.json()
      setResult(data)
      setSelectedVariant(0)
    } catch (e) {
      console.error(e)
      setError('Generation failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const currentImage = result ? result.images[selectedVariant] : null
  const currentSvg = result ? result.svgs[selectedVariant] : null

  const handleExport = async (fmt: 'png' | 'jpeg' | 'pdf') => {
    if (!currentImage) return
    setExporting(fmt)
    try {
      await exportAsset({ svg: currentSvg, image: currentImage }, fmt, 'GRACE_garment', '#ffffff')
    } catch (e) {
      console.error('Export failed', e)
      alert('Export failed — please try again.')
    } finally {
      setExporting(null)
    }
  }

  const handleProceed = () => {
    if (mode === 'upload' && uploadedImage) {
      onComplete({
        svg: '',
        dataUrl: uploadedImage,
        type: 'custom',
        color: 'custom',
      })
    } else if (result && currentImage) {
      onComplete({
        svg: currentSvg || '',
        dataUrl: currentImage,
        type: result.garmentType,
        color: result.color,
      })
    }
  }

  const canProceed = (mode === 'upload' && !!uploadedImage) || (mode === 'generate' && !!result)

  return (
    <div className="p-6 w-full">
      <div className="mb-5 flex items-start justify-between">
        <div>
          <p className="phase-header">Phase 2</p>
          <h1 className="text-xl font-bold text-gray-900">Create or Upload Blank Garment</h1>
          <p className="text-gray-500 text-sm mt-1">Upload a photo of a blank garment or generate one with AI</p>
        </div>
        <button onClick={onBack} className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-700 transition-colors mt-1">
          <ArrowLeft size={14}/>
          Back
        </button>
      </div>

      <div className="grid grid-cols-[240px_1fr_240px] gap-4">
        {/* Left: Choose option */}
        <div className="space-y-3">
          <div className="card">
            <p className="text-xs font-medium text-gray-600 mb-3">Choose an option</p>
            <div className="space-y-2">
              <button
                onClick={() => setMode('upload')}
                className={`w-full p-3 rounded-xl border text-left transition-all ${
                  mode === 'upload'
                    ? 'border-brand-green bg-brand-green/5'
                    : 'border-slate-200 hover:border-slate-300'
                }`}
              >
                <div className="flex items-start gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
                    <Upload size={15} className="text-gray-500"/>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-gray-900">Upload Your Garment</p>
                    <p className="text-[11px] text-gray-500 mt-0.5">Upload images of a blank garment</p>
                  </div>
                </div>
              </button>

              <button
                onClick={() => setMode('generate')}
                className={`w-full p-3 rounded-xl border text-left transition-all ${
                  mode === 'generate'
                    ? 'border-brand-green bg-brand-green/5'
                    : 'border-slate-200 hover:border-slate-300'
                }`}
              >
                <div className="flex items-start gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
                    <Cpu size={15} className="text-gray-500"/>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-gray-900">Generate with AI</p>
                    <p className="text-[11px] text-gray-500 mt-0.5">Describe the garment you want</p>
                  </div>
                </div>
              </button>
            </div>
          </div>

          {mode === 'generate' && (
            <div className="card space-y-3">
              <div>
                <label className="text-xs font-medium text-gray-600 mb-2 block">Describe your garment</label>
                <textarea
                  className="textarea-field"
                  rows={5}
                  value={prompt}
                  onChange={e => setPrompt(e.target.value)}
                  placeholder="Describe the garment..."
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 mb-2 block">Color</label>
                <select
                  className="input-field"
                  value={color}
                  onChange={e => setColor(e.target.value)}
                >
                  {COLORS.map(c => (
                    <option key={c.value} value={c.value}>{c.label}</option>
                  ))}
                </select>
              </div>
              <button
                onClick={handleGenerate}
                disabled={loading}
                className="btn-primary w-full flex items-center justify-center gap-2"
              >
                {loading ? <Loader2 size={14} className="animate-spin"/> : <Cpu size={14}/>}
                {loading ? 'Generating…' : 'Generate Garment'}
              </button>
              {error && <p className="text-[11px] text-red-500">{error}</p>}
            </div>
          )}

          {mode === 'upload' && uploadedImage && (
            <div className="card">
              <p className="text-xs font-medium text-gray-600 mb-2">Or upload your own</p>
              <div {...getRootProps()} className="border border-dashed border-slate-300 rounded-lg p-4 text-center cursor-pointer hover:border-brand-green transition-colors">
                <input {...getInputProps()}/>
                <Upload size={18} className="mx-auto text-gray-400 mb-1"/>
                <p className="text-xs text-gray-500">Replace image</p>
              </div>
            </div>
          )}
        </div>

        {/* Center: Preview */}
        <div className="card">
          <p className="text-xs font-medium text-gray-600 mb-3">
            {mode === 'generate' ? 'AI Generated Garment' : 'Your Garment'}
          </p>

          {mode === 'upload' ? (
            <div>
              {!uploadedImage ? (
                <div
                  {...getRootProps()}
                  className={`rounded-xl border-2 border-dashed flex flex-col items-center justify-center cursor-pointer transition-colors ${
                    isDragActive ? 'border-brand-green bg-brand-green/5' : 'border-slate-200 hover:border-brand-green'
                  }`}
                  style={{ height: 280 }}
                >
                  <input {...getInputProps()}/>
                  <ImageIcon size={32} className="text-gray-300 mb-3"/>
                  <p className="text-sm text-gray-600 font-medium">Drop your garment image here</p>
                  <p className="text-xs text-gray-400 mt-1">or click to browse</p>
                  <p className="text-xs text-gray-300 mt-3">PNG, JPG, WEBP supported</p>
                </div>
              ) : (
                <div className="rounded-xl overflow-hidden flex items-center justify-center bg-slate-50" style={{ height: 280 }}>
                  <img src={uploadedImage} alt="Uploaded garment" className="max-h-full max-w-full object-contain"/>
                </div>
              )}
            </div>
          ) : (
            <div>
              <div className="checkerboard rounded-xl overflow-hidden flex items-center justify-center mb-3" style={{ height: 280 }}>
                {loading && (
                  <div className="flex flex-col items-center gap-3 text-gray-400">
                    <Loader2 size={32} className="animate-spin"/>
                    <span className="text-sm">Generating garment…</span>
                    <span className="text-xs text-gray-400">This can take 10–30 seconds</span>
                  </div>
                )}
                {!loading && !result && (
                  <div className="text-gray-400 text-sm">Generated garment will appear here</div>
                )}
                {!loading && currentImage && (
                  <img src={currentImage} alt="Generated garment" className="max-h-full max-w-full object-contain p-4"/>
                )}
              </div>

              {result && result.images.length > 1 && (
                <div className="grid grid-cols-4 gap-2">
                  {result.images.map((img, i) => (
                    <button
                      key={i}
                      onClick={() => setSelectedVariant(i)}
                      className={`checkerboard rounded-lg flex items-center justify-center overflow-hidden transition-all ${
                        selectedVariant === i ? 'ring-2 ring-brand-green' : 'hover:ring-1 hover:ring-slate-300'
                      }`}
                      style={{ height: 80 }}
                    >
                      <img src={img} alt={`View ${i + 1}`} className="max-h-full max-w-full object-contain p-1.5"/>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right: Actions */}
        <div className="space-y-3">
          <div className="card">
            <p className="text-xs font-medium text-gray-600 mb-3">Your Garment</p>
            <div className="checkerboard rounded-lg flex items-center justify-center mb-3" style={{ height: 130 }}>
              {(mode === 'upload' && uploadedImage) ? (
                <img src={uploadedImage} alt="garment" className="max-h-full max-w-full object-contain p-2"/>
              ) : (mode === 'generate' && currentImage) ? (
                <img src={currentImage} alt="garment" className="max-h-full max-w-full object-contain p-2"/>
              ) : (
                <div className="text-gray-400 text-xs text-center px-4">Your garment will appear here</div>
              )}
            </div>

            {mode === 'generate' && currentImage && (
              <>
                <button
                  onClick={() => handleExport('png')}
                  disabled={!!exporting}
                  className="btn-primary w-full flex items-center justify-center gap-2 mb-2"
                >
                  {exporting ? <Loader2 size={14} className="animate-spin"/> : <Download size={14}/>}
                  {exporting ? 'Exporting…' : 'Download'}
                </button>
                <div className="grid grid-cols-3 gap-1 text-xs mb-3">
                  {(['PNG', 'JPG', 'PDF'] as const).map(fmt => (
                    <button
                      key={fmt}
                      onClick={() => handleExport(fmt === 'JPG' ? 'jpeg' : fmt.toLowerCase() as 'png' | 'pdf')}
                      disabled={!!exporting}
                      className="btn-secondary py-1 text-center disabled:opacity-50"
                    >
                      {fmt}
                    </button>
                  ))}
                </div>
              </>
            )}

            <div {...getRootProps()} className="border border-dashed border-slate-300 rounded-lg p-3 text-center cursor-pointer hover:border-brand-green transition-colors">
              <input {...getInputProps()}/>
              <p className="text-xs text-gray-500">Or upload your own</p>
              <p className="text-[11px] text-gray-400 mt-0.5">Upload Image</p>
            </div>
          </div>

          <button
            onClick={handleProceed}
            disabled={!canProceed}
            className={`w-full flex items-center justify-center gap-2 font-medium py-3 px-4 rounded-xl transition-colors text-sm ${
              canProceed
                ? 'bg-brand-green hover:bg-brand-green-light text-white'
                : 'bg-slate-100 text-gray-400 cursor-not-allowed'
            }`}
          >
            Apply Logo to Garment
            <ArrowRight size={15}/>
          </button>
        </div>
      </div>
    </div>
  )
}
