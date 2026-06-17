'use client'

import { useState, useCallback } from 'react'
import { useDropzone } from 'react-dropzone'
import { Upload, Cpu, Loader2, ArrowRight, ArrowLeft, ImageIcon, ImagePlus, X, CheckSquare, Square, Sparkles, Download, Shirt } from 'lucide-react'
import { AppState } from '@/app/page'
import { streamGenerate, PaywallError } from '@/lib/streamGenerate'
import { cacheGet, cacheSet, cacheKey } from '@/lib/generateCache'
import { useAICredits } from '@/lib/aiCreditsContext'
import GenerationCounter from '@/components/GenerationCounter'
import { GARMENT_LIBRARY, type LibraryGarment } from '@/lib/garmentLibrary'
import { removeWhiteBackground } from '@/lib/removeWhiteBg'

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
  const credits = useAICredits()

  // Detect how to restore the previously chosen garment (if any)
  const existingGarment = state.garment
  const libraryMatch = existingGarment
    ? GARMENT_LIBRARY.find(g => g.name === existingGarment.type)
    : null
  const hasExistingViews = existingGarment &&
    (existingGarment.views.front || existingGarment.views.back || existingGarment.views.side)

  // Pre-select the mode based on existing garment
  const initialMode = (() => {
    if (!existingGarment) return 'generate' as const
    if (libraryMatch) return 'library' as const
    return 'generate' as const  // works for both generated and uploaded (they populate viewResults)
  })()

  const [mode, setMode] = useState<'upload' | 'generate' | 'library'>(initialMode)
  const [prompt, setPrompt] = useState(
    'Oversized unisex hoodie, 450gsm, french terry cotton, drop shoulder, double layered hood, ribbed cuffs and hem.'
  )

  // Library mode: a curated blank garment chosen from the GRACE garment library
  const [libraryViews, setLibraryViews] = useState<Partial<Record<View, string>>>(
    libraryMatch ? (libraryMatch.views as Partial<Record<View, string>>) : {}
  )
  const [selectedGarmentId, setSelectedGarmentId] = useState<string | null>(
    libraryMatch?.id ?? null
  )

  const selectLibraryGarment = (g: LibraryGarment) => {
    setSelectedGarmentId(g.id)
    const views = g.views as Partial<Record<View, string>>
    setLibraryViews(views)
    const available = ALL_VIEWS.filter(v => views[v])
    if (available.length) {
      setSelectedViews(available)
      setActiveView(available[0])
    }
  }

  // Restore previously active views from existing garment
  const restoredViews: View[] = hasExistingViews
    ? ALL_VIEWS.filter(v => existingGarment!.views[v])
    : ['front']

  const [selectedViews, setSelectedViews] = useState<View[]>(
    libraryMatch
      ? ALL_VIEWS.filter(v => (libraryMatch.views as Partial<Record<View, string>>)[v])
      : restoredViews
  )
  const [activeView, setActiveView] = useState<View>(
    (restoredViews[0] as View) ?? 'front'
  )

  // Generate mode: one image per view — pre-populate from existing non-library garment
  const initialViewResults: Partial<Record<View, string>> = (() => {
    if (!existingGarment || libraryMatch) return {}
    const r: Partial<Record<View, string>> = {}
    ALL_VIEWS.forEach(v => { if (existingGarment.views[v]) r[v] = existingGarment.views[v] })
    if (!r.front && existingGarment.dataUrl) r.front = existingGarment.dataUrl
    return r
  })()

  const [viewResults, setViewResults] = useState<Partial<Record<View, string>>>(initialViewResults)
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
    if (mode === 'library') return libraryViews[view]
    return viewResults[view]
  }

  const activeImage = getActiveImage(activeView)
  const anyDone = selectedViews.some(v => !!getActiveImage(v))
  const allSelectedDone = selectedViews.every(v => !!getActiveImage(v))
  const isLoading = !!loadingView

  const currentModeHasResults = anyDone

  const handleProceed = async () => {
    const rawViews: { front?: string; back?: string; side?: string } = {}
    for (const v of selectedViews) {
      const img = getActiveImage(v)
      if (img) rawViews[v] = img
    }
    // Remove solid backgrounds from generated garment images (AI output often
    // includes a studio background color that blocks the canvas background)
    const libGarment = mode === 'library' ? GARMENT_LIBRARY.find(g => g.id === selectedGarmentId) : null
    const isGenerated = !libGarment
    let views = rawViews
    if (isGenerated) {
      const keys = Object.keys(rawViews) as (keyof typeof rawViews)[]
      const cleaned = await Promise.all(keys.map(k => removeWhiteBackground(rawViews[k]!).catch(() => rawViews[k]!)))
      views = Object.fromEntries(keys.map((k, i) => [k, cleaned[i]])) as typeof rawViews
    }
    const primary = views.front ?? views.back ?? views.side ?? ''
    onComplete({ svg: '', dataUrl: primary, views, type: libGarment ? libGarment.name : 'generated', color: 'custom' })
  }

  return (
    <div className="p-6 w-full">
      <div className="mb-5 flex items-start justify-between">
        <div>
          <p className="phase-header">Phase 1</p>
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

          {/* Source + AI generation — styled to match the Logo card on Phase 1 */}
          <div className="card">
            {mode === 'generate' ? (
              <>
                <label className="text-xs font-medium text-gray-600 mb-2 block">Describe your garment</label>
                <textarea className="textarea-field" rows={6} value={prompt}
                  onChange={e => setPrompt(e.target.value)} placeholder="Describe the garment in detail..."/>

                <button onClick={handleGenerateAll} disabled={isLoading}
                  className="btn-primary w-full mt-3 flex items-center justify-center gap-2">
                  {isLoading ? <><Loader2 size={14} className="animate-spin"/> {statusMsg || 'Generating…'}</> : <><Sparkles size={14}/> Generate Garment</>}
                </button>
                <GenerationCounter className="mt-2 w-full justify-center" />

                {Object.entries(errors).filter(([, v]) => v).map(([view, msg]) => (
                  <p key={view} className="text-[11px] text-red-500 mt-2">{view}: {msg}</p>
                ))}

                {/* Reference image — compact inline style */}
                <div className="mt-3">
                  {referenceImage ? (
                    <div className="relative rounded-lg overflow-hidden border border-slate-200" style={{ height: 80 }}>
                      <img src={referenceImage} alt="Reference" className="w-full h-full object-cover"/>
                      <button onClick={() => setReferenceImage(null)}
                        className="absolute top-1 right-1 w-5 h-5 rounded-full bg-white/90 flex items-center justify-center text-gray-600 hover:text-red-500 transition-colors shadow">
                        <X size={11}/>
                      </button>
                      <span className="absolute bottom-1 left-2 text-[10px] text-white bg-black/50 rounded px-1.5 py-0.5">Reference</span>
                    </div>
                  ) : (
                    <label className="flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed border-slate-300 hover:border-brand-green cursor-pointer transition-colors text-xs text-gray-400 hover:text-gray-700">
                      <ImagePlus size={13}/>
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

                <div className="flex items-center gap-2 my-3">
                  <div className="h-px bg-slate-200 flex-1"/>
                  <span className="text-[10px] text-gray-400 uppercase tracking-wider">or</span>
                  <div className="h-px bg-slate-200 flex-1"/>
                </div>

                <button onClick={() => setMode('upload')} className="btn-secondary w-full flex items-center justify-center gap-2">
                  <Upload size={14}/>
                  Upload Your Own
                </button>
                <button onClick={() => setMode('library')} className="btn-secondary w-full mt-2 flex items-center justify-center gap-2">
                  <Shirt size={14}/>
                  Choose from GRACE library
                </button>
              </>
            ) : mode === 'upload' ? (
              <>
                <p className="text-xs font-medium text-gray-600 mb-2">Add photos for each view</p>
                <p className="text-[11px] text-gray-400 mb-3">Use the view tabs on the right to upload a photo for each angle.</p>
                <button onClick={() => setMode('generate')} className="btn-secondary w-full flex items-center justify-center gap-2">
                  <Cpu size={14}/>
                  Generate with AI instead
                </button>
                <button onClick={() => setMode('library')} className="btn-secondary w-full mt-2 flex items-center justify-center gap-2">
                  <Shirt size={14}/>
                  Choose from GRACE library
                </button>
              </>
            ) : (
              <>
                <p className="text-xs font-medium text-gray-600 mb-2">GRACE garment library</p>
                <p className="text-[11px] text-gray-400 mb-3">Pick a blank garment to customize in the editor.</p>
                <div className="grid grid-cols-2 gap-2 max-h-[360px] overflow-y-auto pr-1">
                  {GARMENT_LIBRARY.map(g => {
                    const thumb = g.views.front ?? g.views.side ?? g.views.back ?? ''
                    const selected = selectedGarmentId === g.id
                    return (
                      <button key={g.id} onClick={() => selectLibraryGarment(g)}
                        className={`text-left rounded-lg border overflow-hidden transition-all flex flex-col ${
                          selected ? 'border-brand-green ring-1 ring-brand-green' : 'border-slate-200 hover:border-slate-300'
                        }`}>
                        <div className="bg-white flex items-center justify-center" style={{ height: 80 }}>
                          {thumb ? <img src={thumb} alt={g.name} className="max-h-full max-w-full object-contain p-1.5"/> : <ImageIcon size={20} className="text-gray-300"/>}
                        </div>
                        <span className="text-[10px] font-medium text-gray-700 px-2 py-1.5 leading-tight">{g.name}</span>
                      </button>
                    )
                  })}
                </div>
                <button onClick={() => setMode('generate')} className="btn-secondary w-full mt-3 flex items-center justify-center gap-2">
                  <Cpu size={14}/>
                  Generate with AI instead
                </button>
              </>
            )}
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

          {mode !== 'upload' ? (
            <div>
              <div className="bg-white border border-slate-100 rounded-xl flex items-center justify-center" style={{ height: 480 }}>
                {loadingView === activeView ? (
                  <div className="flex flex-col items-center gap-3 text-gray-400 py-16">
                    <Loader2 size={32} className="animate-spin text-brand-green"/>
                    <span className="text-sm text-gray-700">{statusMsg || `Generating ${activeView} view…`}</span>
                    <span className="text-xs text-gray-400">This can take 15–30 seconds</span>
                  </div>
                ) : activeImage ? (
                  <img src={activeImage} alt={`${activeView} view`} className="max-h-full max-w-full object-contain p-4"/>
                ) : (
                  <div className="flex flex-col items-center gap-3 py-20 text-center px-6">
                    <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center">
                      {mode === 'library' ? <Shirt size={22} className="text-gray-400"/> : <Sparkles size={22} className="text-gray-400"/>}
                    </div>
                    <p className="text-sm text-gray-500">
                      {mode === 'library'
                        ? 'Pick a blank garment from the GRACE library on the left to start customizing'
                        : <>Choose <strong>Clean</strong> for design placement or <strong>Realistic</strong> for a premium product preview</>}
                    </p>
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
              <div className="bg-white border border-slate-100 rounded-xl flex items-center justify-center relative" style={{ height: 480 }}>
                {uploadedViews[activeView] ? (
                  <>
                    <img src={uploadedViews[activeView]} alt={`${activeView} view`} className="max-h-full max-w-full object-contain p-4"/>
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
  Basketball: ['Game Uniform', 'Practice Uniform', 'Reversible Jersey'],
  Football:   ['Game Uniform', 'Practice Uniform', 'Reversible Jersey'],
  Soccer:     ['Game Uniform', 'Practice Uniform', 'Reversible Jersey'],
  Baseball:   ['Game Uniform', 'Practice Uniform', 'Reversible Jersey'],
  Track:      ['Competition Uniform', 'Practice Uniform', 'Reversible Jersey'],
  Volleyball: ['Game Uniform', 'Practice Uniform', 'Reversible Jersey'],
  '7v7':      ['Game Uniform', 'Practice Uniform', 'Reversible Jersey'],
}

// ─── Uniform flow — same garment creation UI with sport/type selectors in the left panel ───

function UniformFlow({ onComplete, onBack }: { onComplete: (garment: AppState['garment']) => void; onBack: () => void }) {
  const credits = useAICredits()
  const [sport, setSport] = useState<Sport | null>(null)
  const [uniformType, setUniformType] = useState<string | null>(null)
  const [mode, setMode] = useState<'upload' | 'generate'>('generate')
  const [prompt, setPrompt] = useState('')
  const [selectedViews, setSelectedViews] = useState<View[]>(['front'])
  const [activeView, setActiveView] = useState<View>('front')
  const [viewResults, setViewResults] = useState<Partial<Record<View, string>>>({})
  const [loadingView, setLoadingView] = useState<View | null>(null)
  const [statusMsg, setStatusMsg] = useState('')
  const [errors, setErrors] = useState<Partial<Record<View, string>>>({})
  const [referenceImage, setReferenceImage] = useState<string | null>(null)
  const [uploadedViews, setUploadedViews] = useState<Partial<Record<View, string>>>({})

  // Auto-update prompt when sport/type change
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

  const generateView = async (view: View, frontImage?: string): Promise<string | null> => {
    const key = cacheKey('garment2', prompt, view, referenceImage ?? '', frontImage ?? '')
    const cached = cacheGet<ViewResult>(key)
    if (cached) { setViewResults(prev => ({ ...prev, [view]: cached.image })); return cached.image }
    setLoadingView(view); setErrors(prev => ({ ...prev, [view]: undefined })); setStatusMsg(`Generating ${view} view...`)
    try {
      const headers = await credits.getGenerationHeaders()
      const data = await streamGenerate<ViewResult>('/api/generate-garment', { prompt, referenceImage, view, frontImage: frontImage ?? null, quality: 'realistic' }, msg => setStatusMsg(msg), headers)
      cacheSet(key, data); setViewResults(prev => ({ ...prev, [view]: data.image }));
      credits.onGenerationComplete()
      return data.image
    } catch (e) {
      if (e instanceof PaywallError) { credits.openPaywall(); return null }
      setErrors(prev => ({ ...prev, [view]: e instanceof Error ? e.message : 'Generation failed.' })); return null
    } finally { setLoadingView(null); setStatusMsg('') }
  }

  const handleGenerateAll = async () => {
    if (!sport || !uniformType) return
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

  const getActiveImage = (view: View): string | undefined =>
    mode === 'upload' ? uploadedViews[view] : viewResults[view]

  const activeImage = getActiveImage(activeView)
  const anyDone = selectedViews.some(v => !!getActiveImage(v))
  const allSelectedDone = selectedViews.every(v => !!getActiveImage(v))
  const isLoading = !!loadingView

  const handleProceed = async () => {
    const rawViews: { front?: string; back?: string; side?: string } = {}
    for (const v of selectedViews) { const img = getActiveImage(v); if (img) rawViews[v] = img }
    const keys = Object.keys(rawViews) as (keyof typeof rawViews)[]
    const cleaned = await Promise.all(keys.map(k => removeWhiteBackground(rawViews[k]!).catch(() => rawViews[k]!)))
    const views = Object.fromEntries(keys.map((k, i) => [k, cleaned[i]])) as typeof rawViews
    const primary = views.front ?? views.back ?? views.side ?? ''
    onComplete({ svg: '', dataUrl: primary, views, type: sport ? `${sport} ${uniformType}` : 'uniform', color: 'custom', mode: 'uniform', sport: sport ?? undefined, uniformType: uniformType ?? undefined })
  }

  return (
    <div className="p-6 w-full">
      <div className="mb-5 flex items-start justify-between">
        <div>
          <p className="phase-header">Phase 1</p>
          <h1 className="text-xl font-bold text-gray-900">Create or Upload Blank Garment</h1>
          <p className="text-gray-500 text-sm mt-1">Upload photos of your blank uniform or generate one with AI</p>
        </div>
        <button onClick={onBack} className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-700 transition-colors mt-1">
          <ArrowLeft size={14}/>Back
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr_220px] gap-4">

        {/* Left */}
        <div className="space-y-3">

          {/* Sport + uniform type */}
          <div className="card space-y-3">
            <div>
              <p className="text-xs font-medium text-gray-600 mb-2">Sport</p>
              <div className="grid grid-cols-2 gap-1.5">
                {SPORTS.map(s => (
                  <button key={s} onClick={() => updateSport(s)}
                    className={`py-1.5 px-2 rounded-lg border text-xs font-medium transition-all text-left ${
                      sport === s ? 'border-grace-ink bg-grace-ink text-white' : 'border-grace-border text-grace-stone hover:border-grace-ink hover:text-grace-ink'
                    }`}>
                    {s}
                  </button>
                ))}
              </div>
            </div>
            {sport && (
              <div>
                <p className="text-xs font-medium text-gray-600 mb-2">Uniform Type</p>
                <div className="flex flex-col gap-1.5">
                  {UNIFORM_TYPES[sport].map(ut => (
                    <button key={ut} onClick={() => updateUniformType(ut)}
                      className={`py-1.5 px-2 rounded-lg border text-xs font-medium transition-all text-left ${
                        uniformType === ut ? 'border-grace-ink bg-grace-ink text-white' : 'border-grace-border text-grace-stone hover:border-grace-ink hover:text-grace-ink'
                      }`}>
                      {ut}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Source + AI generation — styled to match the Logo card on Phase 1 */}
          <div className="card">
            {mode === 'generate' ? (
              <>
                <label className="text-xs font-medium text-gray-600 mb-2 block">Describe your uniform</label>
                <textarea className="textarea-field" rows={6} value={prompt}
                  onChange={e => setPrompt(e.target.value)} placeholder="Describe the uniform in detail..."/>

                <button onClick={handleGenerateAll} disabled={isLoading || !sport || !uniformType}
                  className="btn-primary w-full mt-3 flex items-center justify-center gap-2">
                  {isLoading ? <><Loader2 size={14} className="animate-spin"/> {statusMsg || 'Generating…'}</> : <><Sparkles size={14}/> Generate Uniform</>}
                </button>
                <GenerationCounter className="mt-2 w-full justify-center" />
                {!sport || !uniformType ? <p className="text-[11px] text-gray-400 text-center mt-2">Select sport and uniform type first</p> : null}
                {Object.entries(errors).filter(([, v]) => v).map(([view, msg]) => (
                  <p key={view} className="text-[11px] text-red-500 mt-2">{view}: {msg}</p>
                ))}

                {/* Reference image — compact inline style */}
                <div className="mt-3">
                  {referenceImage ? (
                    <div className="relative rounded-lg overflow-hidden border border-slate-200" style={{ height: 80 }}>
                      <img src={referenceImage} alt="Reference" className="w-full h-full object-cover"/>
                      <button onClick={() => setReferenceImage(null)}
                        className="absolute top-1 right-1 w-5 h-5 rounded-full bg-white/90 flex items-center justify-center text-gray-600 hover:text-red-500 transition-colors shadow">
                        <X size={11}/>
                      </button>
                      <span className="absolute bottom-1 left-2 text-[10px] text-white bg-black/50 rounded px-1.5 py-0.5">Reference</span>
                    </div>
                  ) : (
                    <label className="flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed border-slate-300 hover:border-brand-green cursor-pointer transition-colors text-xs text-gray-400 hover:text-gray-700">
                      <ImagePlus size={13}/>
                      Add reference photo
                      <input type="file" className="hidden" accept="image/*" onChange={e => {
                        const file = e.target.files?.[0]; if (!file) return
                        const reader = new FileReader()
                        reader.onload = ev => setReferenceImage(ev.target?.result as string)
                        reader.readAsDataURL(file); e.target.value = ''
                      }}/>
                    </label>
                  )}
                </div>

                <div className="flex items-center gap-2 my-3">
                  <div className="h-px bg-slate-200 flex-1"/>
                  <span className="text-[10px] text-gray-400 uppercase tracking-wider">or</span>
                  <div className="h-px bg-slate-200 flex-1"/>
                </div>

                <button onClick={() => setMode('upload')} className="btn-secondary w-full flex items-center justify-center gap-2">
                  <Upload size={14}/>
                  Upload Your Own
                </button>
              </>
            ) : (
              <>
                <p className="text-xs font-medium text-gray-600 mb-2">Add photos for each view</p>
                <p className="text-[11px] text-gray-400 mb-3">Use the view tabs on the right to upload a photo for each angle.</p>
                <button onClick={() => setMode('generate')} className="btn-secondary w-full flex items-center justify-center gap-2">
                  <Cpu size={14}/>
                  Generate with AI instead
                </button>
              </>
            )}
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
                    {checked ? <CheckSquare size={15} className="text-brand-green shrink-0"/> : <Square size={15} className="text-gray-300 shrink-0"/>}
                    <span className={`text-xs capitalize flex-1 text-left ${checked ? 'text-gray-900 font-medium' : 'text-gray-400'}`}>{v}</span>
                    {done && <span className="text-[10px] text-brand-green font-medium">✓</span>}
                  </button>
                )
              })}
            </div>
          </div>
        </div>

        {/* Center */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
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
              <div className="bg-white border border-slate-100 rounded-xl flex items-center justify-center" style={{ height: 480 }}>
                {loadingView === activeView ? (
                  <div className="flex flex-col items-center gap-3 text-gray-400 py-16">
                    <Loader2 size={32} className="animate-spin text-brand-green"/>
                    <span className="text-sm text-gray-700">{statusMsg || `Generating ${activeView} view…`}</span>
                    <span className="text-xs text-gray-400">This can take 15–30 seconds</span>
                  </div>
                ) : activeImage ? (
                  <img src={activeImage} alt={`${activeView} view`} className="max-h-full max-w-full object-contain p-4"/>
                ) : (
                  <div className="flex flex-col items-center gap-3 py-20 text-center px-6">
                    <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center">
                      <Sparkles size={22} className="text-gray-400"/>
                    </div>
                    <p className="text-sm text-gray-500">Select your sport and uniform type, then generate your blank uniform</p>
                  </div>
                )}
              </div>
              {anyDone && selectedViews.length > 1 && (
                <div className="grid gap-2 mt-3" style={{ gridTemplateColumns: `repeat(${selectedViews.length}, 1fr)` }}>
                  {selectedViews.map(v => {
                    const img = getActiveImage(v)
                    return (
                      <button key={v} onClick={() => setActiveView(v)}
                        className={`bg-white border rounded-lg overflow-hidden transition-all flex flex-col items-center pb-1 ${
                          activeView === v ? 'border-brand-green ring-1 ring-brand-green' : 'border-slate-100 hover:border-slate-300'
                        }`} style={{ minHeight: 72 }}>
                        {img ? <img src={img} alt={v} className="w-full h-16 object-contain p-1"/> : loadingView === v ? <div className="w-full h-16 flex items-center justify-center"><Loader2 size={14} className="animate-spin text-brand-green"/></div> : <div className="w-full h-16 flex items-center justify-center text-gray-300"><ImageIcon size={14}/></div>}
                        <span className="text-[10px] text-gray-400 capitalize">{v}</span>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          ) : (
            <div>
              <div className="bg-white border border-slate-100 rounded-xl flex items-center justify-center relative" style={{ height: 480 }}>
                {uploadedViews[activeView] ? (
                  <>
                    <img src={uploadedViews[activeView]} alt={`${activeView} view`} className="max-h-full max-w-full object-contain p-4"/>
                    <button onClick={() => setUploadedViews(prev => { const n = {...prev}; delete n[activeView]; return n })} className="absolute top-3 right-3 w-7 h-7 rounded-full bg-white/90 flex items-center justify-center text-gray-600 hover:text-red-500 shadow"><X size={13}/></button>
                  </>
                ) : (
                  <div {...dropzones[activeView].getRootProps()} className={`absolute inset-0 rounded-xl flex flex-col items-center justify-center cursor-pointer transition-colors ${dropzones[activeView].isDragActive ? 'border-2 border-brand-green bg-brand-green/5' : 'border-2 border-dashed border-slate-200 hover:border-brand-green'}`}>
                    <input {...dropzones[activeView].getInputProps()}/>
                    <ImageIcon size={36} className="text-gray-300 mb-3"/>
                    <p className="text-sm text-gray-500 font-medium">Drop your {activeView} view here</p>
                    <p className="text-xs text-gray-400 mt-1">or click to browse</p>
                  </div>
                )}
              </div>
              {selectedViews.length > 1 && (
                <div className="grid gap-2 mt-3" style={{ gridTemplateColumns: `repeat(${selectedViews.length}, 1fr)` }}>
                  {selectedViews.map(v => (
                    <button key={v} onClick={() => setActiveView(v)}
                      className={`bg-white border rounded-lg overflow-hidden transition-all flex flex-col items-center pb-1 ${activeView === v ? 'border-brand-green ring-1 ring-brand-green' : 'border-slate-100 hover:border-slate-300'}`} style={{ minHeight: 72 }}>
                      {uploadedViews[v] ? <img src={uploadedViews[v]} alt={v} className="w-full h-16 object-contain p-1"/> : <div className="w-full h-16 flex items-center justify-center"><ImageIcon size={18} className="text-gray-200"/></div>}
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
            <button onClick={() => { const a = document.createElement('a'); a.href = activeImage; a.download = `uniform_${activeView}.png`; a.click() }}
              className="btn-secondary w-full flex items-center justify-center gap-2">
              <Download size={13}/> Download
            </button>
          )}

          <button onClick={handleProceed} disabled={!anyDone}
            className={`w-full flex items-center justify-center gap-2 font-medium py-3 px-4 rounded-xl transition-colors text-sm ${
              anyDone ? 'bg-brand-green hover:bg-brand-green-light text-white' : 'bg-slate-100 text-gray-400 cursor-not-allowed'
            }`}>
            {allSelectedDone ? 'Apply Logo to Uniform' : anyDone ? 'Continue with available views' : 'Generate or upload to continue'}
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

// ─── Shell: top-level toggle between Custom Apparel and Team Uniforms ──────────

export default function Phase2Garment({ state, onComplete, onBack }: Props) {
  // If the project already has a garment (existing project being edited), skip
  // the product type selector and go straight to the relevant flow.
  const [productMode, setProductMode] = useState<'apparel' | 'uniform' | null>(
    state.garment?.mode ?? null
  )

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
          <p className="phase-header">Phase 1</p>
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
