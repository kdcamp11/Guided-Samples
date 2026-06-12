'use client'

import { useState, useCallback, useRef } from 'react'
import { useDropzone } from 'react-dropzone'
import { Upload, Cpu, Loader2, ArrowRight, ArrowLeft, ImageIcon, ImagePlus, X, CheckSquare, Square } from 'lucide-react'
import { AppState } from '@/app/page'
import { streamGenerate } from '@/lib/streamGenerate'
import { cacheGet, cacheSet, cacheKey } from '@/lib/generateCache'

type View = 'front' | 'back' | 'side'

interface ViewResult {
  image: string
  view: View
  garmentType: string
  color: string
}

interface Props {
  state: AppState
  onComplete: (garment: AppState['garment']) => void
  onBack: () => void
}

const ALL_VIEWS: View[] = ['front', 'back', 'side']

export default function Phase2Garment({ state, onComplete, onBack }: Props) {
  const [mode, setMode] = useState<'upload' | 'generate'>('generate')
  const [prompt, setPrompt] = useState(
    'Oversized unisex hoodie, 450gsm, french terry cotton, drop shoulder, double layered hood, ribbed cuffs and hem.'
  )
  const [selectedViews, setSelectedViews] = useState<View[]>(['front'])
  const [activeView, setActiveView] = useState<View>('front')

  // Generate mode state
  const [viewResults, setViewResults] = useState<Partial<Record<View, string>>>({})
  const [loadingView, setLoadingView] = useState<View | null>(null)
  const [statusMsg, setStatusMsg] = useState('')
  const [errors, setErrors] = useState<Partial<Record<View, string>>>({})
  const [referenceImage, setReferenceImage] = useState<string | null>(null)
  const referenceInputRef = useRef<HTMLInputElement>(null)

  // Upload mode state
  const [uploadedViews, setUploadedViews] = useState<Partial<Record<View, string>>>({})

  const toggleView = (v: View) => {
    setSelectedViews(prev =>
      prev.includes(v)
        ? prev.length > 1 ? prev.filter(x => x !== v) : prev // always keep at least one
        : [...prev, v]
    )
  }

  const generateView = async (view: View, frontImage?: string) => {
    const key = cacheKey('garment', prompt, view, referenceImage ?? '', frontImage ?? '')
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
        { prompt, referenceImage, view, frontImage: frontImage ?? null },
        msg => setStatusMsg(msg),
      )
      cacheSet(key, data)
      setViewResults(prev => ({ ...prev, [view]: data.image }))
      return data.image
    } catch (e) {
      console.error(e)
      const msg = e instanceof Error ? e.message : 'Generation failed. Please try again.'
      setErrors(prev => ({ ...prev, [view]: msg }))
      return null
    } finally {
      setLoadingView(null)
      setStatusMsg('')
    }
  }

  const handleGenerateAll = async () => {
    setViewResults({})
    setErrors({})

    // Always generate front first so it can be used as reference for other views
    const orderedViews: View[] = [
      ...( selectedViews.includes('front') ? ['front' as View] : []),
      ...( selectedViews.includes('back')  ? ['back'  as View] : []),
      ...( selectedViews.includes('side')  ? ['side'  as View] : []),
    ]

    let frontImg: string | null = null
    for (const view of orderedViews) {
      const img = await generateView(view, view !== 'front' ? (frontImg ?? undefined) : undefined)
      if (view === 'front' && img) frontImg = img
    }
    setActiveView(orderedViews[0])
  }

  // Upload dropzones — must be declared at component level (Rules of Hooks)
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

  const currentResults = mode === 'generate' ? viewResults : uploadedViews
  const activeImage = currentResults[activeView] ?? null
  const allSelectedDone = selectedViews.every(v => !!currentResults[v])
  const anyDone = selectedViews.some(v => !!currentResults[v])

  const handleProceed = () => {
    const views: { front?: string; back?: string; side?: string } = {}
    for (const v of selectedViews) {
      const img = currentResults[v]
      if (img) views[v] = img
    }
    const primary = views.front ?? views.back ?? views.side ?? ''
    onComplete({
      svg: '',
      dataUrl: primary,
      views,
      type: mode === 'upload' ? 'custom' : 'generated',
      color: 'custom',
    })
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

        {/* Left: Options */}
        <div className="space-y-3">

          {/* Mode */}
          <div className="card">
            <p className="text-xs font-medium text-gray-600 mb-3">Source</p>
            <div className="space-y-2">
              {([['generate', Cpu, 'Generate with AI', 'Describe the garment you want'], ['upload', Upload, 'Upload Your Own', 'Add photos for each view']] as const).map(([m, Icon, label, desc]) => (
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
            <div className="space-y-2">
              {ALL_VIEWS.map(v => {
                const checked = selectedViews.includes(v)
                return (
                  <button key={v} onClick={() => toggleView(v)}
                    className="w-full flex items-center gap-2.5 px-2 py-2 rounded-lg hover:bg-slate-50 transition-colors">
                    {checked
                      ? <CheckSquare size={15} className="text-brand-green shrink-0"/>
                      : <Square size={15} className="text-gray-300 shrink-0"/>}
                    <span className={`text-xs capitalize ${checked ? 'text-gray-900 font-medium' : 'text-gray-400'}`}>{v}</span>
                    {currentResults[v] && <span className="ml-auto text-[10px] text-brand-green font-medium">✓ Done</span>}
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
                <textarea className="textarea-field" rows={4} value={prompt} onChange={e => setPrompt(e.target.value)} placeholder="Describe the garment..."/>
              </div>
              {/* Reference image */}
              <div>
                {referenceImage ? (
                  <div className="relative rounded-lg overflow-hidden border border-slate-200" style={{ height: 80 }}>
                    <img src={referenceImage} alt="Reference" className="w-full h-full object-cover"/>
                    <button onClick={() => setReferenceImage(null)}
                      className="absolute top-1 right-1 w-5 h-5 rounded-full bg-white/90 flex items-center justify-center text-gray-600 hover:text-red-500 shadow">
                      <X size={11}/>
                    </button>
                    <span className="absolute bottom-1 left-2 text-[10px] text-white bg-black/50 rounded px-1.5 py-0.5">Reference</span>
                  </div>
                ) : (
                  <label className="flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed border-slate-300 hover:border-brand-green cursor-pointer transition-colors text-xs text-gray-400 hover:text-gray-700">
                    <ImagePlus size={13}/>
                    Add reference image
                    <input ref={referenceInputRef} type="file" className="hidden" accept="image/*"
                      onChange={e => {
                        const file = e.target.files?.[0]; if (!file) return
                        const reader = new FileReader()
                        reader.onload = ev => setReferenceImage(ev.target?.result as string)
                        reader.readAsDataURL(file); e.target.value = ''
                      }}/>
                  </label>
                )}
              </div>

              <button onClick={handleGenerateAll} disabled={!!loadingView}
                className="btn-primary w-full flex items-center justify-center gap-2">
                {loadingView ? <Loader2 size={14} className="animate-spin"/> : <Cpu size={14}/>}
                {loadingView ? (statusMsg || 'Generating…') : `Generate ${selectedViews.length > 1 ? `${selectedViews.length} Views` : 'Garment'}`}
              </button>

              {Object.entries(errors).filter(([,v]) => v).map(([view, msg]) => (
                <p key={view} className="text-[11px] text-red-500">{view}: {msg}</p>
              ))}
            </div>
          )}
        </div>

        {/* Center: Preview */}
        <div className="card">
          {/* View tabs */}
          <div className="flex items-center gap-1 mb-4">
            {selectedViews.map(v => (
              <button key={v} onClick={() => setActiveView(v)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-colors ${
                  activeView === v ? 'bg-brand-green text-white' : 'text-gray-500 hover:bg-slate-100'
                }`}>
                {v}
                {currentResults[v] && activeView !== v && <span className="ml-1 text-brand-green">●</span>}
              </button>
            ))}
          </div>

          {mode === 'generate' ? (
            <div>
              <div className="bg-white border border-slate-100 rounded-xl flex items-center justify-center" style={{ minHeight: 280 }}>
                {loadingView === activeView ? (
                  <div className="flex flex-col items-center gap-3 text-gray-400 py-16">
                    <Loader2 size={32} className="animate-spin text-brand-green"/>
                    <span className="text-sm text-gray-700">{statusMsg || `Generating ${activeView} view…`}</span>
                    <span className="text-xs text-gray-400">This can take 10–30 seconds</span>
                  </div>
                ) : activeImage ? (
                  <img src={activeImage} alt={`${activeView} view`} className="max-h-full max-w-full object-contain p-4"/>
                ) : (
                  <div className="text-gray-400 text-sm py-16 text-center px-4">
                    {loadingView ? `Generating ${loadingView} view first…` : `${activeView.charAt(0).toUpperCase() + activeView.slice(1)} view will appear here`}
                  </div>
                )}
              </div>

              {/* Thumbnails for all selected views */}
              {anyDone && selectedViews.length > 1 && (
                <div className="grid gap-2 mt-3" style={{ gridTemplateColumns: `repeat(${selectedViews.length}, 1fr)` }}>
                  {selectedViews.map(v => (
                    <button key={v} onClick={() => setActiveView(v)}
                      className={`bg-white border rounded-lg overflow-hidden transition-all flex flex-col items-center pb-1 ${
                        activeView === v ? 'border-brand-green ring-1 ring-brand-green' : 'border-slate-100 hover:border-slate-300'
                      }`} style={{ minHeight: 80 }}>
                      {currentResults[v] ? (
                        <img src={currentResults[v]} alt={v} className="w-full h-16 object-contain p-1"/>
                      ) : loadingView === v ? (
                        <div className="w-full h-16 flex items-center justify-center">
                          <Loader2 size={16} className="animate-spin text-brand-green"/>
                        </div>
                      ) : (
                        <div className="w-full h-16 flex items-center justify-center text-gray-300">
                          <ImageIcon size={16}/>
                        </div>
                      )}
                      <span className="text-[10px] text-gray-400 capitalize">{v}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            /* Upload mode — slot per selected view */
            <div className="space-y-4">
              {selectedViews.map(v => {
                const dz = dropzones[v]
                return (
                  <div key={v}>
                    <p className="text-xs font-medium text-gray-600 mb-2 capitalize">{v} view</p>
                    {uploadedViews[v] ? (
                      <div className="relative rounded-xl overflow-hidden bg-white border border-slate-100" style={{ height: 160 }}>
                        <img src={uploadedViews[v]} alt={`${v} view`} className="w-full h-full object-contain p-2"/>
                        <button onClick={() => setUploadedViews(prev => { const n = {...prev}; delete n[v]; return n })}
                          className="absolute top-2 right-2 w-6 h-6 rounded-full bg-white/90 flex items-center justify-center text-gray-600 hover:text-red-500 shadow">
                          <X size={12}/>
                        </button>
                      </div>
                    ) : (
                      <div {...dz.getRootProps()}
                        className={`rounded-xl border-2 border-dashed flex flex-col items-center justify-center cursor-pointer transition-colors ${
                          dz.isDragActive ? 'border-brand-green bg-brand-green/5' : 'border-slate-200 hover:border-brand-green'
                        }`} style={{ height: 120 }}>
                        <input {...dz.getInputProps()}/>
                        <ImageIcon size={24} className="text-gray-300 mb-2"/>
                        <p className="text-xs text-gray-500">Drop {v} view here</p>
                        <p className="text-[11px] text-gray-400 mt-0.5">or click to browse</p>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Right: Summary + proceed */}
        <div className="space-y-3">
          <div className="card">
            <p className="text-xs font-medium text-gray-600 mb-3">Views</p>
            <div className="space-y-2">
              {ALL_VIEWS.map(v => {
                const selected = selectedViews.includes(v)
                const done = !!currentResults[v]
                return (
                  <div key={v} className={`flex items-center gap-2 text-xs ${selected ? '' : 'opacity-30'}`}>
                    <div className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 ${
                      done ? 'bg-brand-green border-brand-green' : 'border-gray-300'
                    }`}>
                      {done && <span className="text-white text-[8px]">✓</span>}
                    </div>
                    <span className={`capitalize ${done ? 'text-gray-700' : 'text-gray-400'}`}>{v}</span>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Preview thumbnail of active view */}
          {activeImage && (
            <div className="card">
              <p className="text-xs font-medium text-gray-600 mb-2 capitalize">{activeView} preview</p>
              <div className="bg-white border border-slate-100 rounded-lg flex items-center justify-center" style={{ height: 110 }}>
                <img src={activeImage} alt="preview" className="max-h-full max-w-full object-contain p-2"/>
              </div>
            </div>
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
              {selectedViews.filter(v => !currentResults[v]).map(v => v).join(', ')} view{selectedViews.filter(v => !currentResults[v]).length > 1 ? 's' : ''} still pending
            </p>
          )}
        </div>

      </div>
    </div>
  )
}
