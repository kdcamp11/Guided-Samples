'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { Undo2, Redo2, Minus, Plus, Upload, Layers, ArrowLeft, ArrowRight, Trash2, Copy, ChevronUp, ChevronDown, Save, Check, Loader2, Download } from 'lucide-react'
import { AppState } from '@/app/page'
import { streamGenerate } from '@/lib/streamGenerate'
import { cacheGet, cacheSet, cacheKey } from '@/lib/generateCache'
import { removeWhiteBackground } from '@/lib/removeWhiteBg'

// Fire-and-forget: warm the Phase 4 preview cache as soon as design is confirmed.
async function prefetchPreview(state: AppState, compositeImage: string) {
  const designImage = compositeImage || state.garment?.dataUrl || ''
  const key = cacheKey('preview', designImage.slice(-40))
  if (cacheGet(key)) return
  try {
    const data = await streamGenerate('/api/generate-preview', {
      garmentImage: designImage || null,
      // Logo is already baked into the composite — only send it separately as a fallback.
      logoImage: compositeImage ? null : (state.logo?.dataUrl ?? null),
      placement: 'center chest',
    }, () => {})
    cacheSet(key, data)
  } catch { /* silent — Phase 4 will generate on demand if this fails */ }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })
}

interface Props {
  state: AppState
  onComplete: (design: AppState['design']) => void
  onSetGarment: (garment: AppState['garment']) => void
  onBack: () => void
}

interface LogoLayer {
  id: string
  dataUrl: string
  x: number
  y: number
  width: number
  height: number
  rotation: number
}

export default function Phase3Editor({ state, onComplete, onSetGarment, onBack }: Props) {
  const canvasRef = useRef<HTMLDivElement>(null)
  const [zoom, setZoom] = useState(100)
  const [garmentScale, setGarmentScale] = useState(100)
  const [layers, setLayers] = useState<LogoLayer[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [dragging, setDragging] = useState<{ id: string; startX: number; startY: number; origX: number; origY: number } | null>(null)
  const [past, setPast] = useState<LogoLayer[][]>([])
  const [future, setFuture] = useState<LogoLayer[][]>([])
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle')
  const [lastSaved, setLastSaved] = useState<Date | null>(null)
  const hydrated = useRef(false)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const STORAGE_KEY = 'grace_design_layers'

  const selected = layers.find(l => l.id === selectedId) ?? null

  const writeSave = (data: LogoLayer[]) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
      setLastSaved(new Date())
      setSaveStatus('saved')
    } catch (e) {
      console.error('Save failed', e)
    }
  }

  const saveDesign = () => {
    setSaveStatus('saving')
    if (saveTimer.current) clearTimeout(saveTimer.current)
    setTimeout(() => writeSave(layers), 150)
  }

  const snapshot = () => {
    setPast(p => [...p.slice(-49), layers])
    setFuture([])
  }

  const undo = () => {
    setPast(p => {
      if (p.length === 0) return p
      const prev = p[p.length - 1]
      setFuture(f => [layers, ...f])
      setLayers(prev)
      return p.slice(0, -1)
    })
  }

  const redo = () => {
    setFuture(f => {
      if (f.length === 0) return f
      const next = f[0]
      setPast(p => [...p, layers])
      setLayers(next)
      return f.slice(1)
    })
  }

  useEffect(() => {
    let restored = false
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) {
        const parsed = JSON.parse(raw) as LogoLayer[]
        if (Array.isArray(parsed) && parsed.length > 0) {
          setLayers(parsed)
          setSelectedId(parsed[parsed.length - 1].id)
          setLastSaved(new Date())
          setSaveStatus('saved')
          restored = true
        }
      }
    } catch (e) {
      console.error('Restore failed', e)
    }

    if (!restored && state.logo) {
      const id = crypto.randomUUID()
      setLayers([{
        id,
        dataUrl: state.logo.dataUrl,
        x: 80, y: 100, width: 180, height: 90, rotation: 0,
      }])
      setSelectedId(id)
    }
    hydrated.current = true
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!hydrated.current) return
    setSaveStatus('saving')
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => writeSave(layers), 800)
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layers])

  const updateSelected = (updates: Partial<LogoLayer>) => {
    if (!selectedId) return
    snapshot()
    setLayers(ls => ls.map(l => l.id === selectedId ? { ...l, ...updates } : l))
  }

  const handleMouseDown = (e: React.MouseEvent, id: string) => {
    e.preventDefault()
    e.stopPropagation()
    setSelectedId(id)
    const layer = layers.find(l => l.id === id)
    if (!layer) return
    snapshot()
    setDragging({ id, startX: e.clientX, startY: e.clientY, origX: layer.x, origY: layer.y })
  }

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!dragging) return
    const dx = e.clientX - dragging.startX
    const dy = e.clientY - dragging.startY
    setLayers(ls => ls.map(l =>
      l.id === dragging.id ? { ...l, x: dragging.origX + dx, y: dragging.origY + dy } : l
    ))
  }, [dragging])

  const handleMouseUp = useCallback(() => {
    setDragging(null)
  }, [])

  useEffect(() => {
    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [handleMouseMove, handleMouseUp])

  const handleUploadLogo = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = async ev => {
      let dataUrl = ev.target?.result as string
      try {
        dataUrl = await removeWhiteBackground(dataUrl)
      } catch (err) {
        console.error('White background removal failed, using original', err)
      }
      const id = crypto.randomUUID()
      snapshot()
      setLayers(ls => [...ls, {
        id,
        dataUrl,
        x: 60, y: 80, width: 160, height: 80, rotation: 0,
      }])
      setSelectedId(id)
    }
    reader.readAsDataURL(file)
  }

  // Render the editor canvas (garment + positioned logo layers) to a single image,
  // mirroring the 380x460 coordinate space used for on-screen layout.
  const compositeDesign = async (): Promise<string> => {
    if (!state.garment?.dataUrl) return ''
    const W = 380, H = 460, SCALE = 2
    const canvas = document.createElement('canvas')
    canvas.width = W * SCALE
    canvas.height = H * SCALE
    const ctx = canvas.getContext('2d')
    if (!ctx) return ''
    ctx.scale(SCALE, SCALE)
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, W, H)

    const g = await loadImage(state.garment.dataUrl)
    const fit = Math.min(W / g.width, H / g.height) * (garmentScale / 100)
    const gw = g.width * fit
    const gh = g.height * fit
    ctx.drawImage(g, (W - gw) / 2, (H - gh) / 2, gw, gh)

    for (const layer of layers) {
      const img = await loadImage(layer.dataUrl)
      ctx.save()
      ctx.translate(layer.x + layer.width / 2, layer.y + layer.height / 2)
      ctx.rotate((layer.rotation * Math.PI) / 180)
      const lf = Math.min(layer.width / img.width, layer.height / img.height)
      ctx.drawImage(img, (-img.width * lf) / 2, (-img.height * lf) / 2, img.width * lf, img.height * lf)
      ctx.restore()
    }
    return canvas.toDataURL('image/png')
  }

  const handleConfirm = async () => {
    let composite = ''
    try {
      composite = await compositeDesign()
      if (!composite) console.warn('compositeDesign returned empty — garment may be missing')
    } catch (e) {
      console.error('compositeDesign threw:', e)
    }
    prefetchPreview(state, composite)
    onComplete({ confirmed: true, previewDataUrl: composite })
  }

  const handleUploadGarment = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => {
      onSetGarment({ svg: '', dataUrl: ev.target?.result as string, views: { front: ev.target?.result as string }, type: 'custom', color: 'custom' })
    }
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  const moveLayer = (direction: 'up' | 'down') => {
    if (!selectedId) return
    snapshot()
    setLayers(ls => {
      const idx = ls.findIndex(l => l.id === selectedId)
      if (idx === -1) return ls
      if (direction === 'up' && idx < ls.length - 1) {
        const next = [...ls]
        ;[next[idx], next[idx + 1]] = [next[idx + 1], next[idx]]
        return next
      }
      if (direction === 'down' && idx > 0) {
        const next = [...ls]
        ;[next[idx], next[idx - 1]] = [next[idx - 1], next[idx]]
        return next
      }
      return ls
    })
  }

  const duplicateSelected = () => {
    if (!selected) return
    const id = crypto.randomUUID()
    snapshot()
    setLayers(ls => [...ls, { ...selected, id, x: selected.x + 20, y: selected.y + 20 }])
    setSelectedId(id)
  }

  const deleteSelected = () => {
    if (!selectedId) return
    snapshot()
    setLayers(ls => ls.filter(l => l.id !== selectedId))
    setSelectedId(null)
  }

  void lastSaved

  return (
    <div className="p-6 w-full">
      <div className="mb-5 flex items-start justify-between">
        <div>
          <p className="phase-header">Phase 3</p>
          <h1 className="text-xl font-bold text-gray-900">Apply Logo to Garment</h1>
          <p className="text-gray-500 text-sm mt-1">Drag, resize, and position your logo on the garment</p>
        </div>
        <button onClick={onBack} className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-700 transition-colors mt-1">
          <ArrowLeft size={14}/>
          Back
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[200px_1fr_220px] gap-4">
        {/* Left: Assets */}
        <div className="space-y-3">
          <div className="card">
            <p className="text-xs font-medium text-gray-600 mb-3">Your Assets</p>
            <label className="btn-secondary w-full flex items-center justify-center gap-2 cursor-pointer">
              <Upload size={13}/>
              Upload Logo
              <input type="file" className="hidden" accept="image/*" onChange={handleUploadLogo}/>
            </label>

            <div className="mt-3 space-y-2">
              {state.logo && (
                <button
                  onClick={() => {
                    const id = crypto.randomUUID()
                    snapshot()
                    setLayers(ls => [...ls, {
                      id,
                      dataUrl: state.logo!.dataUrl,
                      x: 60, y: 80, width: 160, height: 80, rotation: 0,
                    }])
                    setSelectedId(id)
                  }}
                  className="w-full bg-slate-50 hover:bg-slate-100 rounded-lg overflow-hidden transition-colors"
                >
                  <div className="checkerboard rounded-lg" style={{ height: 64 }}>
                    <img src={state.logo.dataUrl} alt="logo" className="w-full h-full object-contain p-2"/>
                  </div>
                  <p className="text-[11px] text-gray-500 py-1.5 px-2 text-left">GRACE_logo.png</p>
                </button>
              )}
            </div>
          </div>

          {state.garment && (
            <div className="card">
              <div className="flex justify-between items-center mb-2">
                <p className="text-xs font-medium text-gray-600">Garment Size</p>
                <span className="text-xs text-gray-700">{garmentScale}%</span>
              </div>
              <input
                type="range"
                min={25}
                max={200}
                value={garmentScale}
                onChange={e => setGarmentScale(parseInt(e.target.value))}
                className="w-full accent-brand-green"
              />
              <div className="flex items-center justify-between mt-2 gap-1.5">
                <button onClick={() => setGarmentScale(s => Math.max(25, s - 10))} className="btn-secondary px-2 flex-1 py-1 flex items-center justify-center">
                  <Minus size={12}/>
                </button>
                <button onClick={() => setGarmentScale(100)} className="btn-secondary px-2 flex-1 py-1 text-xs">
                  Reset
                </button>
                <button onClick={() => setGarmentScale(s => Math.min(200, s + 10))} className="btn-secondary px-2 flex-1 py-1 flex items-center justify-center">
                  <Plus size={12}/>
                </button>
              </div>
            </div>
          )}

          {layers.length > 0 && (
            <div className="card">
              <p className="text-xs font-medium text-gray-600 mb-2">Layers</p>
              <div className="space-y-1">
                {[...layers].reverse().map((layer, i) => (
                  <button
                    key={layer.id}
                    onClick={() => setSelectedId(layer.id)}
                    className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs transition-colors ${
                      selectedId === layer.id ? 'bg-brand-green/10 text-gray-900' : 'hover:bg-slate-100 text-gray-500'
                    }`}
                  >
                    <Layers size={11}/>
                    <span className="truncate flex-1 text-left">Layer {layers.length - i}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Center: Canvas */}
        <div className="card p-0 overflow-hidden">
          {/* Toolbar */}
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-200">
            <div className="flex items-center gap-1">
              <button
                onClick={undo}
                disabled={past.length === 0}
                title="Undo"
                className="p-1.5 rounded hover:bg-slate-100 text-gray-400 hover:text-gray-700 transition-colors disabled:opacity-30 disabled:hover:bg-transparent"
              >
                <Undo2 size={14}/>
              </button>
              <button
                onClick={redo}
                disabled={future.length === 0}
                title="Redo"
                className="p-1.5 rounded hover:bg-slate-100 text-gray-400 hover:text-gray-700 transition-colors disabled:opacity-30 disabled:hover:bg-transparent"
              >
                <Redo2 size={14}/>
              </button>
            </div>
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <button onClick={() => setZoom(z => Math.max(25, z - 25))} className="p-1 rounded hover:bg-slate-100 hover:text-gray-700 transition-colors">
                <Minus size={12}/>
              </button>
              <span className="w-14 text-center">{zoom}%</span>
              <button onClick={() => setZoom(z => Math.min(200, z + 25))} className="p-1 rounded hover:bg-slate-100 hover:text-gray-700 transition-colors">
                <Plus size={12}/>
              </button>
            </div>
            <div className="flex items-center gap-2.5">
              <span className="text-[11px] text-gray-400 flex items-center gap-1 min-w-[64px] justify-end">
                {saveStatus === 'saving' && <><Loader2 size={11} className="animate-spin"/> Saving…</>}
                {saveStatus === 'saved' && <><Check size={11} className="text-brand-green"/> Saved</>}
              </span>
              <button
                onClick={saveDesign}
                title="Save design"
                className="btn-secondary flex items-center gap-1.5 py-2"
              >
                <Save size={13}/>
                Save
              </button>
              <button
                onClick={handleConfirm}
                className="btn-primary flex items-center gap-1.5"
              >
                Confirm Design
                <ArrowRight size={13}/>
              </button>
            </div>
          </div>

          {/* Canvas area */}
          <div
            ref={canvasRef}
            className="relative bg-white overflow-hidden flex items-center justify-center"
            style={{ minHeight: 480 }}
            onClick={e => { if (e.target === e.currentTarget) setSelectedId(null) }}
          >
            <div
              style={{
                transform: `scale(${zoom / 100})`,
                transformOrigin: 'center center',
                position: 'relative',
                width: 380,
                height: 460,
              }}
            >
              {state.garment ? (
                <div
                  className="absolute inset-0 pointer-events-none"
                  style={{ transform: `scale(${garmentScale / 100})`, transformOrigin: 'center center' }}
                >
                  {state.garment.svg ? (
                    <div
                      dangerouslySetInnerHTML={{ __html: state.garment.svg }}
                      className="w-full h-full flex items-center justify-center [&>svg]:w-full [&>svg]:h-full"
                    />
                  ) : (
                    <img
                      src={state.garment.dataUrl}
                      alt="garment"
                      className="w-full h-full object-contain"
                    />
                  )}
                </div>
              ) : (
                <label className="absolute inset-0 flex flex-col items-center justify-center gap-2 cursor-pointer text-gray-400 hover:text-gray-600 transition-colors">
                  <Upload size={28}/>
                  <span className="text-xs font-medium">Upload a garment</span>
                  <span className="text-[11px] text-gray-400">or generate one in Phase 2</span>
                  <input type="file" className="hidden" accept="image/*" onChange={handleUploadGarment}/>
                </label>
              )}

              {layers.map(layer => (
                <div
                  key={layer.id}
                  onMouseDown={e => handleMouseDown(e, layer.id)}
                  style={{
                    position: 'absolute',
                    left: layer.x,
                    top: layer.y,
                    width: layer.width,
                    height: layer.height,
                    transform: `rotate(${layer.rotation}deg)`,
                    cursor: dragging?.id === layer.id ? 'grabbing' : 'grab',
                    outline: selectedId === layer.id ? '2px solid #0A0A0A' : 'none',
                    outlineOffset: 2,
                    userSelect: 'none',
                  }}
                >
                  <img src={layer.dataUrl} alt="logo" className="w-full h-full object-contain" draggable={false}/>
                  {selectedId === layer.id && (
                    <>
                      {[
                        { cursor: 'nw-resize', top: -4, left: -4 },
                        { cursor: 'ne-resize', top: -4, right: -4 },
                        { cursor: 'sw-resize', bottom: -4, left: -4 },
                        { cursor: 'se-resize', bottom: -4, right: -4 },
                      ].map((handle, i) => (
                        <div
                          key={i}
                          style={{
                            position: 'absolute',
                            width: 10,
                            height: 10,
                            background: 'white',
                            border: '2px solid #0A0A0A',
                            borderRadius: 2,
                            ...handle,
                          }}
                          onMouseDown={e => {
                            e.stopPropagation()
                            snapshot()
                            const startX = e.clientX
                            const startY = e.clientY
                            const origW = layer.width
                            const origH = layer.height
                            const origX = layer.x
                            const origY = layer.y
                            const onMove = (ev: MouseEvent) => {
                              const dx = ev.clientX - startX
                              const dy = ev.clientY - startY
                              const aspectRatio = origW / origH
                              let newW = origW
                              let newH = origH
                              let newX = origX
                              let newY = origY
                              if (handle.cursor === 'se-resize') {
                                newW = Math.max(40, origW + dx)
                                newH = newW / aspectRatio
                              } else if (handle.cursor === 'sw-resize') {
                                newW = Math.max(40, origW - dx)
                                newH = newW / aspectRatio
                                newX = origX + dx
                              } else if (handle.cursor === 'ne-resize') {
                                newW = Math.max(40, origW + dx)
                                newH = newW / aspectRatio
                                newY = origY - (newH - origH)
                              } else if (handle.cursor === 'nw-resize') {
                                newW = Math.max(40, origW - dx)
                                newH = newW / aspectRatio
                                newX = origX + dx
                                newY = origY - (newH - origH)
                              }
                              setLayers(ls => ls.map(l =>
                                l.id === layer.id ? { ...l, width: newW, height: newH, x: newX, y: newY } : l
                              ))
                            }
                            const onUp = () => {
                              window.removeEventListener('mousemove', onMove)
                              window.removeEventListener('mouseup', onUp)
                            }
                            window.addEventListener('mousemove', onMove)
                            window.addEventListener('mouseup', onUp)
                          }}
                        />
                      ))}
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right: Edit controls */}
        <div className="space-y-3">
          {selected ? (
            <>
              <div className="card">
                <p className="text-xs font-medium text-gray-600 mb-3">Edit</p>
                <div className="space-y-4">
                  <ControlRow
                    label="Scale"
                    value={Math.round((selected.width / 160) * 100)}
                    unit="%"
                    onDecrement={() => updateSelected({ width: Math.max(40, selected.width - 10), height: Math.max(20, selected.height - 5) })}
                    onIncrement={() => updateSelected({ width: selected.width + 10, height: selected.height + 5 })}
                  />
                  <div>
                    <div className="flex justify-between items-center mb-1.5">
                      <span className="text-xs text-gray-500">Rotate</span>
                      <div className="flex items-center gap-1.5">
                        <button onClick={() => updateSelected({ rotation: selected.rotation - 15 })} className="w-5 h-5 flex items-center justify-center rounded hover:bg-slate-100 text-gray-500 hover:text-gray-900 transition-colors text-xs">−</button>
                        <span className="text-xs text-gray-700 w-10 text-center">{selected.rotation}°</span>
                        <button onClick={() => updateSelected({ rotation: selected.rotation + 15 })} className="w-5 h-5 flex items-center justify-center rounded hover:bg-slate-100 text-gray-500 hover:text-gray-900 transition-colors text-xs">+</button>
                      </div>
                    </div>
                    <input
                      type="range"
                      min={-180}
                      max={180}
                      value={selected.rotation}
                      onChange={e => updateSelected({ rotation: parseInt(e.target.value) })}
                      className="w-full accent-brand-green"
                    />
                  </div>
                  <div>
                    <span className="text-xs text-gray-500 block mb-2">Position</span>
                    <div className="grid grid-cols-3 gap-1">
                      <div/>
                      <button onClick={() => updateSelected({ y: selected.y - 10 })} className="btn-secondary py-1.5 flex items-center justify-center">
                        <ChevronUp size={12}/>
                      </button>
                      <div/>
                      <button onClick={() => updateSelected({ x: selected.x - 10 })} className="btn-secondary py-1.5 flex items-center justify-center">
                        <ArrowLeft size={12}/>
                      </button>
                      <div className="w-6 h-6 rounded-full bg-slate-200 mx-auto self-center"/>
                      <button onClick={() => updateSelected({ x: selected.x + 10 })} className="btn-secondary py-1.5 flex items-center justify-center">
                        <ArrowRight size={12}/>
                      </button>
                      <div/>
                      <button onClick={() => updateSelected({ y: selected.y + 10 })} className="btn-secondary py-1.5 flex items-center justify-center">
                        <ChevronDown size={12}/>
                      </button>
                      <div/>
                    </div>
                  </div>
                </div>
              </div>

              <div className="card">
                <p className="text-xs font-medium text-gray-600 mb-2">Layer</p>
                <div className="grid grid-cols-2 gap-1.5">
                  <button onClick={() => moveLayer('up')} className="btn-secondary flex items-center justify-center gap-1 text-xs py-2">
                    <ChevronUp size={12}/> Bring Fwd
                  </button>
                  <button onClick={() => moveLayer('down')} className="btn-secondary flex items-center justify-center gap-1 text-xs py-2">
                    <ChevronDown size={12}/> Send Bkwd
                  </button>
                  <button onClick={duplicateSelected} className="btn-secondary flex items-center justify-center gap-1 text-xs py-2">
                    <Copy size={12}/> Duplicate
                  </button>
                  <button onClick={deleteSelected} className="flex items-center justify-center gap-1 text-xs py-2 rounded-lg bg-red-50 hover:bg-red-100 text-red-500 hover:text-red-600 transition-colors border border-red-200">
                    <Trash2 size={12}/> Delete
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="card">
              <div className="text-center py-8">
                <Layers size={24} className="mx-auto text-gray-300 mb-2"/>
                <p className="text-xs text-gray-400">Select a layer to edit</p>
              </div>
            </div>
          )}

          {state.garment?.dataUrl && (
            <button
              onClick={async () => {
                const composite = await compositeDesign()
                const a = document.createElement('a')
                a.href = composite || state.garment!.dataUrl
                a.download = 'design_composite.png'
                a.click()
              }}
              className="btn-secondary w-full flex items-center justify-center gap-2"
            >
              <Download size={13}/> Download Design
            </button>
          )}

          <button
            onClick={handleConfirm}
            className="w-full flex items-center justify-center gap-2 font-medium py-3 px-4 rounded-xl transition-colors text-sm bg-brand-green hover:bg-brand-green-light text-white"
          >
            Confirm Design
            <ArrowRight size={15}/>
          </button>
        </div>
      </div>
    </div>
  )
}

function ControlRow({
  label, value, unit, onDecrement, onIncrement
}: {
  label: string; value: number; unit: string;
  onDecrement: () => void; onIncrement: () => void
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-gray-500">{label}</span>
      <div className="flex items-center gap-1.5">
        <button onClick={onDecrement} className="w-5 h-5 flex items-center justify-center rounded hover:bg-slate-100 text-gray-500 hover:text-gray-900 transition-colors text-xs">−</button>
        <span className="text-xs text-gray-700 w-12 text-center">{value}{unit}</span>
        <button onClick={onIncrement} className="w-5 h-5 flex items-center justify-center rounded hover:bg-slate-100 text-gray-500 hover:text-gray-900 transition-colors text-xs">+</button>
      </div>
    </div>
  )
}
