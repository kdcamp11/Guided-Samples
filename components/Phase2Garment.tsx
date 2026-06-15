'use client'

import { useState, useCallback } from 'react'
import { useDropzone } from 'react-dropzone'
import { Upload, Cpu, Loader2, ArrowRight, ArrowLeft, ImageIcon, ImagePlus, X, CheckSquare, Square, Sparkles, Download } from 'lucide-react'
import { AppState } from '@/app/page'
import { streamGenerate } from '@/lib/streamGenerate'
import { cacheGet, cacheSet, cacheKey } from '@/lib/generateCache'

type View = 'front' | 'back' | 'side'

interface ViewResult {
  image: string
  view: View
}

interface Props {
  state: AppState
  onComplete: (garment: AppState['garment']) => void
  onBack: () => void
}

const ALL_VIEWS: View[] = ['front', 'back', 'side']

function ApparelFlow({ state, onComplete, onBack }: Props) {
  const [mode, setMode] = useState<'upload' | 'generate'>('generate')
  const [prompt, setPrompt] = useState(
    'Oversized unisex hoodie, 450gsm, french terry cotton, drop shoulder, double layered hood, ribbed cuffs and hem.'
  )
  const [selectedViews, setSelectedViews] = useState<View[]>(['front'])
  const [activeView, setActiveView] = useState<View>('front')

  // Generate mode: one image per view
  const [viewResults, setViewResults] = useState<Partial<Record<View, string>>>({})
  const [loadingView, setLoadingView] = useState<View | null>(null)
  const [statusMsg, setStatusMsg] = useState('')
  const [errors, setErrors] = useState<Partial<Record<View, string>>>({})
  const [referenceImage, setReferenceImage] = useState<string | null>(null)

  // Upload mode
  const [uploadedViews, setUploadedViews] = useState<Partial<Record<View, string>>>({})

  const toggleView = (v: View) => {
    setSelectedViews(prev =>
      prev.includes(v)
        ? prev.length > 1 ? prev.filter(x => x !== v) : prev
        : [...prev, v]
    )
  }

  const generateView = async (view: View, frontImage?: string): Promise<string | null> => {
    const key = cacheKey('garment2', prompt, view, referenceImage ?? '', frontImage ?? '')
    const cached = cacheGet<ViewResult>(key)
    if (cached) {
      setViewResults(prev => ({ ...prev, [view]: cached.image }))
      return cached.image
    }

    setLoadingView(view)
    setErrors(prev => ({ ...prev, [view]: undefined }))
    setStatusMsg(`Generating ${view} view...`)

    try {
      const data = await streamGenerate<ViewResult>(
        '/api/generate-garment',
        { prompt, referenceImage, view, frontImage: frontImage ?? null, quality: 'realistic' },
        msg => setStatusMsg(msg),
      )
      cacheSet(key, data)
      setViewResults(prev => ({ ...prev, [view]: data.image }))
      return data.image
    } catch (e) {
      console.error(e)
      setErrors(prev => ({ ...prev, [view]: e instanceof Error ? e.message : 'Generation failed.' }))
      return null
    } finally {
      setLoadingView(null)
      setStatusMsg('')
    }
  }

  const handleGenerateAll = async () => {
    setErrors({})
    const orderedViews: View[] = [
      ...(selectedViews.includes('front') ? ['front' as View] : []),
      ...(selectedViews.includes('back')  ? ['back'  as View] : []),
      ...(selectedViews.includes('side')  ? ['side'  as View] : []),
    ]

    let frontImg: string | null = null
    for (const view of orderedViews) {
      const img = await generateView(view, view !== 'front' ? (frontImg ?? undefined) : undefined)
      if (view === 'front' && img) frontImg = img
    }
    setActiveView(orderedViews[0])
  }

  // Dropzones — declared at component level (Rules of Hooks)
  const onDropFront = useCallback((files: File[]) => {
    const file = files[0]; if (!file) return
    const reader = new FileReader()
    reader.onload = e => setUploadedViews(prev => ({ ...prev, front: e.target?.result as string }))
    reader.readAsDataURL(file)
  }, [])
  const onDropBack = useCallback((files: File[]) => {
    const file = files[0]; if (!file) return
    const reader = new FileReader()
    reader.onload = e => setUploadedViews(prev => ({ ...prev, back: e.target?.result as string }))
    reader.readAsDataURL(file)
  }, [])
  const onDropSide = useCallback((files: File[]) => {
    const file = files[0]; if (!file) return
    const reader = new FileReader()
    reader.onload = e => setUploadedViews(prev => ({ ...prev, side: e.target?.result as string }))
    reader.readAsDataURL(file)
  }, [])

  const accept = { 'image/*': ['.png', '.jpg', '.jpeg', '.webp'] }
  const frontDrop = useDropzone({ onDrop: onDropFront, accept, multiple: false })
  const backDrop  = useDropzone({ onDrop: onDropBack,  accept, multiple: false })
  const sideDrop  = useDropzone({ onDrop: onDropSide,  accept, multiple: false })
  const dropzones: Record<View, typeof frontDrop> = { front: frontDrop, back: backDrop, side: sideDrop }

  // Active image: for generate mode show the selected quality variant, fallback to other
  const getActiveImage = (view: View): string | undefined => {
    if (mode === 'upload') return uploadedViews[view]
    return viewResults[view]
  }

  const activeImage = getActiveImage(activeView)
  const anyDone = selectedViews.some(v => !!getActiveImage(v))
  const allSelectedDone = selectedViews.every(v => !!getActiveImage(v))
  const isLoading = !!loadingView

  const currentModeHasResults = anyDone

  const handleProceed = () => {
    const views: { front?: string; back?: string; side?: string } = {}
    for (const v of selectedViews) {
      const img = getActiveImage(v)
      if (img) views[v] = img
    }
    const primary = views.front ?? views.back ?? views.side ?? ''
    onComplete({ svg: '', dataUrl: primary, views, type: 'generated', color: 'custom' })
  }

  return (
    <div className="p-6 w-full">
      <div className="mb-5 flex items-start justify-between">
        <div>
          <p className="phase-header">Phase 2</p>
          <h1 className="text-xl font-bold text-gray-900">Create or Upload Blank Garment</h1>
          <p className="text-gray-500 text-sm mt-1">Upload photos of your blank garment or generate one with AI</p>
        </div>
        <button onClick={onBack} className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-700 transition-colors mt-1">
          <ArrowLeft size={14}/>Back
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr_220px] gap-4">

        {/* Left */}
        <div className="space-y-3">

          {/* Source toggle */}
          <div className="card">
            <p className="text-xs font-medium text-gray-600 mb-3">Source</p>
            <div className="space-y-2">
              {([
                ['generate', Cpu,    'Generate with AI',  'Describe the garment you want'],
                ['upload',   Upload, 'Upload Your Own',   'Add photos for each view'],
              ] as const).map(([m, Icon, label, desc]) => (
                <button key={m} onClick={() => setMode(m)}
                  className={`w-full p-3 rounded-xl border text-left transition-all ${mode === m ? 'border-brand-green bg-brand-green/5' : 'border-slate-200 hover:border-slate-300'}`}>
                  <div className="flex items-start gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
                      <Icon size={15} className="text-gray-500"/>
                    </div>
                    <div>
                      <p className="text-xs font-medium text-gray-900">{label}</p>
                      <p className="text-[11px] text-gray-500 mt-0.5">{desc}</p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* View selector */}
          <div className="card">
            <p className="text-xs font-medium text-gray-600 mb-3">Views needed</p>
            <div className="space-y-1">
              {ALL_VIEWS.map(v => {
                const checked = selectedViews.includes(v)
                const done = !!getActiveImage(v)
                return (
                  <button key={v} onClick={() => toggleView(v)}
                    className="w-full flex items-center gap-2.5 px-2 py-2 rounded-lg hover:bg-slate-50 transition-colors">
                    {checked
                      ? <CheckSquare size={15} className="text-brand-green shrink-0"/>
                      : <Square size={15} className="text-gray-300 shrink-0"/>}
                    <span className={`text-xs capitalize flex-1 text-left ${checked ? 'text-gray-900 font-medium' : 'text-gray-400'}`}>{v}</span>
                    {done && <span className="text-[10px] text-brand-green font-medium">✓</span>}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Generate options */}
          {mode === 'generate' && (
            <div className="card space-y-3">
              <div>
                <label className="text-xs font-medium text-gray-600 mb-2 block">Describe your garment</label>
                <textarea className="textarea-field" rows={4} value={prompt}
                  onChange={e => setPrompt(e.target.value)} placeholder="Describe the garment in detail..."/>
              </div>

              {/* Reference image */}
              <div>
                <label className="text-xs font-medium text-gray-600 mb-2 block">Reference photo <span className="text-gray-400 font-normal">(optional)</span></label>
                {referenceImage ? (
                  <div className="relative rounded-xl overflow-hidden border border-slate-200 bg-white" style={{ height: 160 }}>
                    <img src={referenceImage} alt="Reference" className="w-full h-full object-contain p-2"/>
                    <button onClick={() => setReferenceImage(null)}
                      className="absolute top-2 right-2 w-6 h-6 rounded-full bg-white/90 flex items-center justify-center text-gray-600 hover:text-red-500 shadow">
                      <X size={12}/>
                    </button>
                    <span className="absolute bottom-2 left-2 text-[10px] text-white bg-black/50 rounded px-1.5 py-0.5">Reference</span>
                  </div>
                ) : (
                  <label className="flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-200 hover:border-brand-green cursor-pointer transition-colors bg-slate-50 hover:bg-brand-green/5" style={{ height: 120 }}>
                    <ImagePlus size={20} className="text-gray-300"/>
                    <span className="text-xs text-gray-400 hover:text-gray-600">Upload a reference photo</span>
                    <span className="text-[11px] text-gray-300">or click to browse</span>
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

              <button onClick={handleGenerateAll} disabled={isLoading}
                className="btn-primary w-full flex items-center justify-center gap-2">
                {isLoading ? <><Loader2 size={14} className="animate-spin"/> {statusMsg || 'Generating…'}</> : <><Sparkles size={14}/> Generate Garment</>}
              </button>

              {Object.entries(errors).filter(([, v]) => v).map(([view, msg]) => (
                <p key={view} className="text-[11px] text-red-500">{view}: {msg}</p>
              ))}
            </div>
          )}
        </div>

        {/* Center */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            {/* View tabs */}
            <div className="flex items-center gap-1">
              {selectedViews.map(v => (
                <button key={v} onClick={() => setActiveView(v)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-colors ${
                    activeView === v ? 'bg-brand-green text-white' : 'text-gray-500 hover:bg-slate-100'
                  }`}>
                  {v}
                  {getActiveImage(v) && activeView !== v && <span className="ml-1 inline-block w-1.5 h-1.5 rounded-full bg-brand-green align-middle"/>}
                </button>
              ))}
            </div>

          </div>

          {mode === 'generate' ? (
            <div>
              <div className="bg-white border border-slate-100 rounded-xl flex items-center justify-center" style={{ minHeight: 480 }}>
                {loadingView === activeView ? (
                  <div className="flex flex-col items-center gap-3 text-gray-400 py-16">
                    <Loader2 size={32} className="animate-spin text-brand-green"/>
                    <span className="text-sm text-gray-700">{statusMsg || `Generating ${activeView} view…`}</span>
                    <span className="text-xs text-gray-400">This can take 15–30 seconds</span>
                  </div>
                ) : activeImage ? (
                  <img src={activeImage} alt={`${activeView} view`} className="w-full object-contain p-4"/>
                ) : (
                  <div className="flex flex-col items-center gap-3 py-20 text-center px-6">
                    <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center">
                      <Sparkles size={22} className="text-gray-400"/>
                    </div>
                    <p className="text-sm text-gray-500">Choose <strong>Clean</strong> for design placement or <strong>Realistic</strong> for a premium product preview</p>
                  </div>
                )}
              </div>


              {/* Multi-view thumbnails */}
              {anyDone && selectedViews.length > 1 && (
                <div className="grid gap-2 mt-3" style={{ gridTemplateColumns: `repeat(${selectedViews.length}, 1fr)` }}>
                  {selectedViews.map(v => {
                    const img = getActiveImage(v)
                    return (
                      <button key={v} onClick={() => setActiveView(v)}
                        className={`bg-white border rounded-lg overflow-hidden transition-all flex flex-col items-center pb-1 ${
                          activeView === v ? 'border-brand-green ring-1 ring-brand-green' : 'border-slate-100 hover:border-slate-300'
                        }`} style={{ minHeight: 72 }}>
                        {img ? (
                          <img src={img} alt={v} className="w-full h-16 object-contain p-1"/>
                        ) : loadingView === v ? (
                          <div className="w-full h-16 flex items-center justify-center">
                            <Loader2 size={14} className="animate-spin text-brand-green"/>
                          </div>
                        ) : (
                          <div className="w-full h-16 flex items-center justify-center text-gray-300">
                            <ImageIcon size={14}/>
                          </div>
                        )}
                        <span className="text-[10px] text-gray-400 capitalize">{v}</span>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          ) : (
            /* Upload mode — same large canvas as generate mode */
            <div>
              <div className="bg-white border border-slate-100 rounded-xl flex items-center justify-center relative" style={{ minHeight: 480 }}>
                {uploadedViews[activeView] ? (
                  <>
                    <img src={uploadedViews[activeView]} alt={`${activeView} view`} className="w-full object-contain p-4"/>
                    <button
                      onClick={() => setUploadedViews(prev => { const n = {...prev}; delete n[activeView]; return n })}
                      className="absolute top-3 right-3 w-7 h-7 rounded-full bg-white/90 flex items-center justify-center text-gray-600 hover:text-red-500 shadow"
                    >
                      <X size={13}/>
                    </button>
                  </>
                ) : (
                  <div {...dropzones[activeView].getRootProps()}
                    className={`absolute inset-0 rounded-xl flex flex-col items-center justify-center cursor-pointer transition-colors ${
                      dropzones[activeView].isDragActive ? 'border-2 border-brand-green bg-brand-green/5' : 'border-2 border-dashed border-slate-200 hover:border-brand-green'
                    }`}>
                    <input {...dropzones[activeView].getInputProps()}/>
                    <ImageIcon size={36} className="text-gray-300 mb-3"/>
                    <p className="text-sm text-gray-500 font-medium">Drop your {activeView} view here</p>
                    <p className="text-xs text-gray-400 mt-1">or click to browse</p>
                  </div>
                )}
              </div>

              {/* Multi-view thumbnails when multiple views selected */}
              {selectedViews.length > 1 && (
                <div className="grid gap-2 mt-3" style={{ gridTemplateColumns: `repeat(${selectedViews.length}, 1fr)` }}>
                  {selectedViews.map(v => (
                    <button key={v} onClick={() => setActiveView(v)}
                      className={`bg-white border rounded-lg overflow-hidden transition-all flex flex-col items-center pb-1 ${
                        activeView === v ? 'border-brand-green ring-1 ring-brand-green' : 'border-slate-100 hover:border-slate-300'
                      }`} style={{ minHeight: 72 }}>
                      {uploadedViews[v] ? (
                        <img src={uploadedViews[v]} alt={v} className="w-full h-16 object-contain p-1"/>
                      ) : (
                        <div className="w-full h-16 flex items-center justify-center">
                          <ImageIcon size={18} className="text-gray-200"/>
                        </div>
                      )}
                      <span className={`text-[10px] font-medium capitalize mt-0.5 ${activeView === v ? 'text-brand-green' : 'text-gray-400'}`}>{v}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right */}
        <div className="space-y-3">
          <div className="card">
            <p className="text-xs font-medium text-gray-600 mb-3">Views</p>
            <div className="space-y-2">
              {ALL_VIEWS.map(v => {
                const selected = selectedViews.includes(v)
                const done = !!getActiveImage(v)
                return (
                  <div key={v} className={`flex items-center gap-2 text-xs ${selected ? '' : 'opacity-30'}`}>
                    <div className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 ${done ? 'bg-brand-green border-brand-green' : 'border-gray-300'}`}>
                      {done && <span className="text-white text-[8px]">✓</span>}
                    </div>
                    <span className={`capitalize flex-1 ${done ? 'text-gray-700' : 'text-gray-400'}`}>{v}</span>
                  </div>
                )
              })}
            </div>
          </div>

          {activeImage && (
            <div className="card">
              <p className="text-xs font-medium text-gray-600 mb-2 capitalize">{activeView} preview</p>
              <div className="bg-white border border-slate-100 rounded-lg flex items-center justify-center" style={{ height: 160 }}>
                <img src={activeImage} alt="preview" className="max-h-full max-w-full object-contain p-2"/>
              </div>
            </div>
          )}

          {activeImage && (
            <button
              onClick={() => {
                const a = document.createElement('a')
                a.href = activeImage
                a.download = `garment_${activeView}.png`
                a.click()
              }}
              className="btn-secondary w-full flex items-center justify-center gap-2"
            >
              <Download size={13}/> Download Garment
            </button>
          )}

          <button onClick={handleProceed} disabled={!anyDone}
            className={`w-full flex items-center justify-center gap-2 font-medium py-3 px-4 rounded-xl transition-colors text-sm ${
              anyDone ? 'bg-brand-green hover:bg-brand-green-light text-white' : 'bg-slate-100 text-gray-400 cursor-not-allowed'
            }`}>
            {allSelectedDone ? 'Apply Logo to Garment' : anyDone ? 'Continue with available views' : 'Generate or upload to continue'}
            {anyDone && <ArrowRight size={15}/>}
          </button>

          {anyDone && !allSelectedDone && (
            <p className="text-[11px] text-gray-400 text-center">
              {selectedViews.filter(v => !getActiveImage(v)).join(', ')} still pending
            </p>
          )}
        </div>

      </div>
    </div>
  )
}

// ─── Team Uniforms data ────────────────────────────────────────────────────────

const SPORTS = ['Basketball', 'Football', 'Soccer', 'Baseball', 'Track', 'Volleyball', '7v7'] as const
type Sport = typeof SPORTS[number]

const UNIFORM_TYPES: Record<Sport, string[]> = {
  Basketball: ['Game Uniform', 'Practice Uniform'],
  Football:   ['Game Uniform', 'Practice Uniform'],
  Soccer:     ['Game Uniform', 'Practice Uniform'],
  Baseball:   ['Game Uniform', 'Practice Uniform'],
  Track:      ['Competition Uniform', 'Practice Uniform'],
  Volleyball: ['Game Uniform', 'Practice Uniform'],
  '7v7':      ['Game Uniform', 'Practice Uniform'],
}

// ─── Uniform selection flow ────────────────────────────────────────────────────

function UniformFlow({ onComplete, onBack }: { onComplete: (garment: AppState['garment']) => void; onBack: () => void }) {
  const [sport, setSport] = useState<Sport | null>(null)
  const [uniformType, setUniformType] = useState<string | null>(null)

  const handleProceed = () => {
    if (!sport || !uniformType) return
    onComplete({
      svg: '',
      dataUrl: '',
      views: {},
      type: `${sport} ${uniformType}`,
      color: '',
      mode: 'uniform',
      sport,
      uniformType,
    })
  }

  return (
    <div className="p-6 w-full max-w-2xl mx-auto">
      <div className="mb-6 flex items-start justify-between">
        <div>
          <p className="phase-header">Phase 2</p>
          <h1 className="text-xl font-bold text-gray-900">Team Uniforms</h1>
          <p className="text-gray-500 text-sm mt-1">Select your sport and uniform type</p>
        </div>
        <button onClick={onBack} className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-700 transition-colors mt-1">
          <ArrowLeft size={14}/>Back
        </button>
      </div>

      {/* Sport selection */}
      <div className="mb-6">
        <p className="text-xs font-semibold text-gray-600 uppercase tracking-widest mb-3">Select Sport</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {SPORTS.map(s => (
            <button
              key={s}
              onClick={() => { setSport(s); setUniformType(null) }}
              className={`py-3 px-4 rounded-xl border text-sm font-medium transition-all text-left ${
                sport === s
                  ? 'border-grace-ink bg-grace-ink text-white'
                  : 'border-grace-border text-grace-stone hover:border-grace-ink hover:text-grace-ink'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Uniform type selection */}
      {sport && (
        <div className="mb-8">
          <p className="text-xs font-semibold text-gray-600 uppercase tracking-widest mb-3">Uniform Type</p>
          <div className="flex flex-col gap-2">
            {UNIFORM_TYPES[sport].map(ut => (
              <button
                key={ut}
                onClick={() => setUniformType(ut)}
                className={`py-3 px-4 rounded-xl border text-sm font-medium transition-all text-left ${
                  uniformType === ut
                    ? 'border-grace-ink bg-grace-ink text-white'
                    : 'border-grace-border text-grace-stone hover:border-grace-ink hover:text-grace-ink'
                }`}
              >
                {ut}
              </button>
            ))}
          </div>
        </div>
      )}

      <button
        onClick={handleProceed}
        disabled={!sport || !uniformType}
        className={`w-full flex items-center justify-center gap-2 font-medium py-3 px-4 rounded-xl transition-colors text-sm ${
          sport && uniformType
            ? 'bg-grace-ink hover:bg-zinc-800 text-white'
            : 'bg-slate-100 text-gray-400 cursor-not-allowed'
        }`}
      >
        Continue to Apply Design <ArrowRight size={15}/>
      </button>
    </div>
  )
}

// ─── Shell: top-level toggle between Custom Apparel and Team Uniforms ──────────

export default function Phase2Garment({ state, onComplete, onBack }: Props) {
  const [productMode, setProductMode] = useState<'apparel' | 'uniform' | null>(null)

  if (productMode === 'apparel') {
    return <ApparelFlow state={state} onComplete={(g) => onComplete(g ? { ...g, mode: 'apparel' } : g)} onBack={() => setProductMode(null)} />
  }

  if (productMode === 'uniform') {
    return <UniformFlow onComplete={onComplete} onBack={() => setProductMode(null)} />
  }

  // Top-level selection
  return (
    <div className="p-6 w-full max-w-2xl mx-auto">
      <div className="mb-6 flex items-start justify-between">
        <div>
          <p className="phase-header">Phase 2</p>
          <h1 className="text-xl font-bold text-gray-900">Product Selection</h1>
          <p className="text-gray-500 text-sm mt-1">What are you creating?</p>
        </div>
        <button onClick={onBack} className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-700 transition-colors mt-1">
          <ArrowLeft size={14}/>Back
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <button
          onClick={() => setProductMode('apparel')}
          className="group text-left p-7 rounded-2xl border border-grace-border hover:border-grace-ink transition-all flex flex-col gap-3"
        >
          <p className="text-[10px] font-bold tracking-[0.2em] text-grace-stone uppercase">Self Service</p>
          <div>
            <h2 className="text-lg font-black text-grace-ink uppercase tracking-tight mb-1">Custom Apparel</h2>
            <p className="text-xs text-grace-stone leading-relaxed">
              Hoodies, tees, crewnecks, jackets, pants, and more. Choose your garment, apply your design, and build a full tech pack.
            </p>
          </div>
          <span className="flex items-center gap-1 text-xs font-bold text-grace-ink tracking-widest uppercase mt-auto">
            Select <ArrowRight size={12}/>
          </span>
        </button>

        <button
          onClick={() => setProductMode('uniform')}
          className="group text-left p-7 rounded-2xl border border-grace-border hover:border-grace-ink transition-all flex flex-col gap-3"
        >
          <p className="text-[10px] font-bold tracking-[0.2em] text-grace-stone uppercase">Team</p>
          <div>
            <h2 className="text-lg font-black text-grace-ink uppercase tracking-tight mb-1">Team Uniforms</h2>
            <p className="text-xs text-grace-stone leading-relaxed">
              Basketball, football, soccer, baseball, track, volleyball, and 7v7. Built for team roster management and production.
            </p>
          </div>
          <span className="flex items-center gap-1 text-xs font-bold text-grace-ink tracking-widest uppercase mt-auto">
            Select <ArrowRight size={12}/>
          </span>
        </button>
      </div>
    </div>
  )
}
