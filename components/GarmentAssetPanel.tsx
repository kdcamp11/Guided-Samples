'use client'
import { useState, useCallback } from 'react'
import { useDropzone } from 'react-dropzone'
import { Upload, Cpu, Loader2, ImagePlus, X, CheckSquare, Square, Sparkles, ImageIcon, Shirt, ChevronLeft, ArrowRight } from 'lucide-react'
import { AppState } from '@/app/page'
import { streamGenerate, PaywallError } from '@/lib/streamGenerate'
import { cacheGet, cacheSet, cacheKey } from '@/lib/generateCache'
import { useAICredits } from '@/lib/aiCreditsContext'
import GenerationCounter from '@/components/GenerationCounter'
import AIUsageHint from '@/components/AIUsageHint'
import { GARMENT_LIBRARY, type LibraryGarment } from '@/lib/garmentLibrary'
import { removeWhiteBackground } from '@/lib/removeWhiteBg'

type View = 'front' | 'back' | 'side'

interface ViewResult {
  image: string
  view: View
}

interface Props {
  route: 'apparel' | 'uniform'
  state: AppState
  onSetGarment: (garment: AppState['garment']) => void
}

const ALL_VIEWS: View[] = ['front', 'back', 'side']

const SPORTS = ['Basketball', 'Football', 'Soccer', 'Baseball', 'Track', 'Volleyball', '7v7'] as const
type Sport = typeof SPORTS[number]

const UNIFORM_TYPES: Record<Sport, string[]> = {
  Basketball: ['Game Uniform', 'Practice Uniform', 'Reversible Jersey'],
  Football:   ['Game Uniform', 'Practice Uniform', 'Reversible Jersey'],
  Soccer:     ['Game Uniform', 'Practice Uniform', 'Reversible Jersey'],
  Baseball:   ['Game Uniform', 'Practice Uniform', 'Reversible Jersey'],
  Track:      ['Competition Uniform', 'Practice Uniform', 'Reversible Jersey'],
  Volleyball: ['Game Uniform', 'Practice Uniform', 'Reversible Jersey'],
  '7v7':      ['Game Uniform', 'Practice Uniform', 'Reversible Jersey'],
}

export default function GarmentAssetPanel({ route, state, onSetGarment }: Props) {
  const credits = useAICredits()

  const [subMode, setSubMode] = useState<'pick' | 'library' | 'generate' | 'upload'>('pick')

  // Generate mode state
  const [prompt, setPrompt] = useState(
    route === 'uniform'
      ? ''
      : 'Oversized unisex hoodie, 450gsm, french terry cotton, drop shoulder, double layered hood, ribbed cuffs and hem.'
  )
  const [referenceImage, setReferenceImage] = useState<string | null>(null)
  const [viewResults, setViewResults] = useState<Partial<Record<View, string>>>({})
  const [loadingView, setLoadingView] = useState<View | null>(null)
  const [statusMsg, setStatusMsg] = useState('')
  const [errors, setErrors] = useState<Partial<Record<View, string>>>({})

  // Upload mode state
  const [uploadedViews, setUploadedViews] = useState<Partial<Record<View, string>>>({})

  // Library mode state
  const [selectedGarmentId, setSelectedGarmentId] = useState<string | null>(null)

  // Shared view selection
  const [selectedViews, setSelectedViews] = useState<View[]>(['front'])

  // Uniform-specific
  const [sport, setSport] = useState<Sport | null>(null)
  const [uniformType, setUniformType] = useState<string | null>(null)

  const updateSport = (s: Sport) => {
    setSport(s)
    setUniformType(null)
    setPrompt(`${s} uniform, sublimation-ready blank, front view`)
  }
  const updateUniformType = (ut: string) => {
    setUniformType(ut)
    if (sport) setPrompt(`${sport} ${ut.toLowerCase()}, sublimation-ready blank uniform, front view`)
  }

  const toggleView = (v: View) => {
    setSelectedViews(prev =>
      prev.includes(v) ? (prev.length > 1 ? prev.filter(x => x !== v) : prev) : [...prev, v]
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
      const headers = await credits.getGenerationHeaders()
      const data = await streamGenerate<ViewResult>(
        '/api/generate-garment',
        { prompt, referenceImage, view, frontImage: frontImage ?? null, quality: 'realistic' },
        msg => setStatusMsg(msg),
        headers,
      )
      cacheSet(key, data)
      setViewResults(prev => ({ ...prev, [view]: data.image }))
      credits.onGenerationComplete()
      return data.image
    } catch (e) {
      if (e instanceof PaywallError) { credits.openPaywall(); return null }
      console.error(e)
      setErrors(prev => ({ ...prev, [view]: e instanceof Error ? e.message : 'Generation failed.' }))
      return null
    } finally {
      setLoadingView(null)
      setStatusMsg('')
    }
  }

  const handleGenerateAll = async () => {
    if (route === 'uniform' && (!sport || !uniformType)) return
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
  }

  const handleProceed = async () => {
    let rawViews: { front?: string; back?: string; side?: string } = {}
    if (subMode === 'generate') {
      for (const v of selectedViews) { if (viewResults[v]) rawViews[v] = viewResults[v] }
      const keys = Object.keys(rawViews) as (keyof typeof rawViews)[]
      const cleaned = await Promise.all(keys.map(k => removeWhiteBackground(rawViews[k]!).catch(() => rawViews[k]!)))
      rawViews = Object.fromEntries(keys.map((k, i) => [k, cleaned[i]])) as typeof rawViews
    } else if (subMode === 'upload') {
      for (const v of selectedViews) { if (uploadedViews[v]) rawViews[v] = uploadedViews[v] }
    }
    const primary = rawViews.front ?? rawViews.back ?? rawViews.side ?? ''
    if (route === 'uniform') {
      onSetGarment({ svg: '', dataUrl: primary, views: rawViews, type: sport ? `${sport} ${uniformType}` : 'uniform', color: 'custom', mode: 'uniform', sport: sport ?? undefined, uniformType: uniformType ?? undefined })
    } else {
      onSetGarment({ svg: '', dataUrl: primary, views: rawViews, type: 'generated', color: 'custom', mode: 'apparel' })
    }
  }

  const selectLibraryGarment = (g: LibraryGarment) => {
    setSelectedGarmentId(g.id)
    const views = g.views as Partial<Record<View, string>>
    const available = ALL_VIEWS.filter(v => views[v])
    if (available.length) setSelectedViews(available)
    const primary = views.front ?? views.back ?? views.side ?? ''
    onSetGarment({ svg: '', dataUrl: primary, views: views as { front?: string; back?: string; side?: string }, type: g.name, color: 'custom' })
  }

  // Dropzones
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

  const anyGenerateDone = selectedViews.some(v => !!viewResults[v])
  const anyUploadDone = selectedViews.some(v => !!uploadedViews[v])
  const isLoading = !!loadingView

  // ── Pick mode ──────────────────────────────────────────────────────────────
  if (subMode === 'pick') {
    return (
      <div className="space-y-2 p-3">
        <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-3">Garment Source</p>
        <button
          onClick={() => setSubMode('library')}
          className="w-full flex items-center gap-3 p-3 rounded-xl border border-slate-200 hover:border-grace-ink transition-all text-left"
        >
          <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
            <Shirt size={16} className="text-gray-500"/>
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-800">GRACE Library</p>
            <p className="text-[11px] text-gray-400">Choose from curated blank garments</p>
          </div>
          <ArrowRight size={13} className="ml-auto text-gray-300"/>
        </button>

        <button
          onClick={() => setSubMode('generate')}
          className="w-full flex items-center gap-3 p-3 rounded-xl border border-slate-200 hover:border-grace-ink transition-all text-left"
        >
          <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
            <Sparkles size={16} className="text-gray-500"/>
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-800">AI Generate</p>
            <p className="text-[11px] text-gray-400">Describe your garment with AI</p>
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
            <p className="text-xs font-semibold text-gray-800">Upload Garment</p>
            <p className="text-[11px] text-gray-400">Upload your own PNG/JPG</p>
          </div>
          <ArrowRight size={13} className="ml-auto text-gray-300"/>
        </button>
      </div>
    )
  }

  // ── Library mode ───────────────────────────────────────────────────────────
  if (subMode === 'library') {
    return (
      <div className="p-3 space-y-3">
        <button onClick={() => setSubMode('pick')} className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-700 transition-colors">
          <ChevronLeft size={13}/> Back
        </button>
        <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">GRACE Library</p>
        <div className="grid grid-cols-2 gap-2 max-h-[400px] overflow-y-auto pr-0.5">
          {GARMENT_LIBRARY.map(g => {
            const thumb = g.views.front ?? g.views.side ?? g.views.back ?? ''
            const selected = selectedGarmentId === g.id
            return (
              <button key={g.id} onClick={() => selectLibraryGarment(g)}
                className={`text-left rounded-lg border overflow-hidden transition-all flex flex-col ${
                  selected ? 'border-brand-green ring-1 ring-brand-green' : 'border-slate-200 hover:border-slate-300'
                }`}>
                <div className="bg-white flex items-center justify-center" style={{ height: 72 }}>
                  {thumb ? <img src={thumb} alt={g.name} className="max-h-full max-w-full object-contain p-1.5"/> : <ImageIcon size={16} className="text-gray-300"/>}
                </div>
                <span className="text-[10px] font-medium text-gray-700 px-2 py-1 leading-tight">{g.name}</span>
              </button>
            )
          })}
        </div>
      </div>
    )
  }

  // ── Generate mode ──────────────────────────────────────────────────────────
  if (subMode === 'generate') {
    return (
      <div className="p-3 space-y-3">
        <button onClick={() => setSubMode('pick')} className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-700 transition-colors">
          <ChevronLeft size={13}/> Back
        </button>

        {route === 'uniform' && (
          <div className="space-y-2">
            <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Sport</p>
            <div className="grid grid-cols-2 gap-1">
              {SPORTS.map(s => (
                <button key={s} onClick={() => updateSport(s)}
                  className={`py-1.5 px-2 rounded-lg border text-[11px] font-medium transition-all text-left ${
                    sport === s ? 'border-grace-ink bg-grace-ink text-white' : 'border-grace-border text-grace-stone hover:border-grace-ink hover:text-grace-ink'
                  }`}>
                  {s}
                </button>
              ))}
            </div>
            {sport && (
              <>
                <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Type</p>
                <div className="space-y-1">
                  {UNIFORM_TYPES[sport].map(ut => (
                    <button key={ut} onClick={() => updateUniformType(ut)}
                      className={`w-full py-1.5 px-2 rounded-lg border text-[11px] font-medium transition-all text-left ${
                        uniformType === ut ? 'border-grace-ink bg-grace-ink text-white' : 'border-grace-border text-grace-stone hover:border-grace-ink hover:text-grace-ink'
                      }`}>
                      {ut}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        <div>
          <label className="text-[11px] font-medium text-gray-600 mb-1 block">Describe your {route === 'uniform' ? 'uniform' : 'garment'}</label>
          <textarea className="textarea-field text-xs" rows={4} value={prompt}
            onChange={e => setPrompt(e.target.value)} placeholder="Describe in detail..."/>
        </div>

        {/* Reference image */}
        <div>
          {referenceImage ? (
            <div className="relative rounded-lg overflow-hidden border border-slate-200" style={{ height: 64 }}>
              <img src={referenceImage} alt="Reference" className="w-full h-full object-cover"/>
              <button onClick={() => setReferenceImage(null)}
                className="absolute top-1 right-1 w-5 h-5 rounded-full bg-white/90 flex items-center justify-center text-gray-600 hover:text-red-500 transition-colors shadow">
                <X size={11}/>
              </button>
              <span className="absolute bottom-1 left-2 text-[10px] text-white bg-black/50 rounded px-1.5 py-0.5">Reference</span>
            </div>
          ) : (
            <label className="flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed border-slate-300 hover:border-brand-green cursor-pointer transition-colors text-[11px] text-gray-400 hover:text-gray-700">
              <ImagePlus size={12}/>
              Add reference photo
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

        {/* View checkboxes */}
        <div>
          <p className="text-[11px] font-medium text-gray-500 mb-1">Views</p>
          <div className="flex gap-2">
            {ALL_VIEWS.map(v => {
              const checked = selectedViews.includes(v)
              const done = !!viewResults[v]
              return (
                <button key={v} onClick={() => toggleView(v)}
                  className="flex items-center gap-1 text-[11px]">
                  {checked ? <CheckSquare size={13} className="text-brand-green"/> : <Square size={13} className="text-gray-300"/>}
                  <span className={`capitalize ${checked ? 'text-gray-700' : 'text-gray-400'}`}>{v}</span>
                  {done && <span className="text-brand-green text-[9px]">✓</span>}
                </button>
              )
            })}
          </div>
        </div>

        <button onClick={handleGenerateAll}
          disabled={isLoading || (route === 'uniform' && (!sport || !uniformType))}
          className="btn-primary w-full flex items-center justify-center gap-2 text-xs">
          {isLoading ? <><Loader2 size={13} className="animate-spin"/> {statusMsg || 'Generating…'}</> : <><Sparkles size={13}/> Generate</>}
        </button>
        <div className="flex items-center justify-center gap-1.5">
          <GenerationCounter />
          <AIUsageHint />
        </div>
        {route === 'uniform' && (!sport || !uniformType) && (
          <p className="text-[10px] text-gray-400 text-center">Select sport and type first</p>
        )}
        {Object.entries(errors).filter(([, v]) => v).map(([view, msg]) => (
          <p key={view} className="text-[10px] text-red-500">{view}: {msg}</p>
        ))}

        {/* Thumbnails */}
        {anyGenerateDone && (
          <div className="grid grid-cols-3 gap-1">
            {selectedViews.map(v => (
              <div key={v} className="rounded-lg border border-slate-200 overflow-hidden">
                {viewResults[v] ? (
                  <img src={viewResults[v]} alt={v} className="w-full h-16 object-contain p-1"/>
                ) : loadingView === v ? (
                  <div className="w-full h-16 flex items-center justify-center">
                    <Loader2 size={12} className="animate-spin text-brand-green"/>
                  </div>
                ) : (
                  <div className="w-full h-16 flex items-center justify-center text-gray-200">
                    <ImageIcon size={12}/>
                  </div>
                )}
                <p className="text-[9px] text-gray-400 text-center pb-1 capitalize">{v}</p>
              </div>
            ))}
          </div>
        )}

        {anyGenerateDone && (
          <button onClick={handleProceed}
            className="w-full flex items-center justify-center gap-2 bg-brand-green hover:bg-brand-green-light text-white font-medium py-2.5 px-4 rounded-xl transition-colors text-xs">
            Apply to Canvas <ArrowRight size={13}/>
          </button>
        )}
      </div>
    )
  }

  // ── Upload mode ────────────────────────────────────────────────────────────
  return (
    <div className="p-3 space-y-3">
      <button onClick={() => setSubMode('pick')} className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-700 transition-colors">
        <ChevronLeft size={13}/> Back
      </button>

      <div>
        <p className="text-[11px] font-medium text-gray-500 mb-1">Views to upload</p>
        <div className="flex gap-2 mb-3">
          {ALL_VIEWS.map(v => {
            const checked = selectedViews.includes(v)
            return (
              <button key={v} onClick={() => toggleView(v)} className="flex items-center gap-1 text-[11px]">
                {checked ? <CheckSquare size={13} className="text-brand-green"/> : <Square size={13} className="text-gray-300"/>}
                <span className={`capitalize ${checked ? 'text-gray-700' : 'text-gray-400'}`}>{v}</span>
              </button>
            )
          })}
        </div>
      </div>

      {selectedViews.map(v => (
        <div key={v}>
          <p className="text-[11px] text-gray-500 mb-1 capitalize">{v} view</p>
          {uploadedViews[v] ? (
            <div className="relative rounded-lg overflow-hidden border border-slate-200" style={{ height: 80 }}>
              <img src={uploadedViews[v]} alt={v} className="w-full h-full object-contain p-1"/>
              <button
                onClick={() => setUploadedViews(prev => { const n = {...prev}; delete n[v]; return n })}
                className="absolute top-1 right-1 w-5 h-5 rounded-full bg-white/90 flex items-center justify-center text-gray-600 hover:text-red-500 shadow">
                <X size={11}/>
              </button>
            </div>
          ) : (
            <div {...dropzones[v].getRootProps()}
              className={`rounded-lg flex flex-col items-center justify-center cursor-pointer transition-colors py-4 ${
                dropzones[v].isDragActive ? 'border-2 border-brand-green bg-brand-green/5' : 'border-2 border-dashed border-slate-200 hover:border-brand-green'
              }`}>
              <input {...dropzones[v].getInputProps()}/>
              <ImageIcon size={20} className="text-gray-300 mb-1"/>
              <p className="text-[11px] text-gray-400">Drop or click to upload</p>
            </div>
          )}
        </div>
      ))}

      {anyUploadDone && (
        <button onClick={handleProceed}
          className="w-full flex items-center justify-center gap-2 bg-brand-green hover:bg-brand-green-light text-white font-medium py-2.5 px-4 rounded-xl transition-colors text-xs">
          Apply to Canvas <ArrowRight size={13}/>
        </button>
      )}
    </div>
  )
}
