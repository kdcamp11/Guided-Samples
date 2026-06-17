'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import {
  Undo2, Redo2, Minus, Plus, Upload, Layers, ArrowLeft, ArrowRight,
  Trash2, Copy, ChevronUp, ChevronDown, Check, Loader2, Download, Type, Palette,
} from 'lucide-react'
import { AppState } from '@/app/page'
import { streamGenerate } from '@/lib/streamGenerate'
import { cacheGet, cacheSet, cacheKey } from '@/lib/generateCache'
import { removeWhiteBackground } from '@/lib/removeWhiteBg'
import { fileToDataUrl } from '@/lib/fileToDataUrl'

// ─── Types ────────────────────────────────────────────────────────────────────

interface BaseLayer {
  id: string
  x: number
  y: number
  width: number
  height: number
  rotation: number
}

interface ImageLayer extends BaseLayer {
  type: 'image'
  dataUrl: string
  tintColor?: string
}

interface TextLayer extends BaseLayer {
  type: 'text'
  text: string
  fontFamily: string
  fontSize: number
  color: string
}

type LogoLayer = ImageLayer | TextLayer
type ViewLayers = Record<string, LogoLayer[]>

interface Props {
  state: AppState
  onComplete: (design: AppState['design']) => void
  onSetGarment: (garment: AppState['garment']) => void
  onBack: () => void
}

// ─── Constants ────────────────────────────────────────────────────────────────

// Fixed logical display box — all garment views render at the same size
// regardless of source image dimensions, keeping front/back/side consistent.
const GARMENT_DISPLAY_W = 320
const GARMENT_DISPLAY_H = 400

const GOOGLE_FONTS_URL =
  'https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Anton&family=Oswald:wght@400;700&family=Barlow+Condensed:wght@400;700&family=Montserrat:wght@400;700&family=Raleway:wght@400;700&family=Playfair+Display:ital,wght@0,400;0,700;1,400&family=Pacifico&family=Racing+Sans+One&display=swap'

const FONT_LIBRARY = [
  { name: 'Bebas Neue',        label: 'BEBAS NEUE'     },
  { name: 'Anton',             label: 'ANTON'           },
  { name: 'Racing Sans One',   label: 'Racing Sans'     },
  { name: 'Oswald',            label: 'Oswald'          },
  { name: 'Barlow Condensed',  label: 'Barlow'          },
  { name: 'Montserrat',        label: 'Montserrat'      },
  { name: 'Raleway',           label: 'Raleway'         },
  { name: 'Playfair Display',  label: 'Playfair'        },
  { name: 'Pacifico',          label: 'Pacifico'        },
  { name: 'serif',             label: 'Serif'           },
  { name: 'sans-serif',        label: 'Sans-Serif'      },
  { name: 'monospace',         label: 'Monospace'       },
]

const GARMENT_COLORS = [
  '#FFFFFF', '#F5F5F5', '#0A0A0A', '#2D2D2D',
  '#1E3A5F', '#2B4ED6', '#C8372D', '#8B1A1A',
  '#2D6A4F', '#1B7A2F', '#F4B942', '#E85D04',
  '#5E2D7B', '#9B59B6', '#808080', '#B0B0B0',
]

const COLOR_SWATCHES = [
  '#FFFFFF', '#0A0A0A', '#1E3A5F', '#C8372D',
  '#2D6A4F', '#2B4ED6', '#F4B942', '#E85D04',
  '#5E2D7B', '#808080', '#FF69B4', '#00CED1',
]

// Module-level SPA cache — persists across phase back/forward navigation without
// requiring localStorage. Call clearDesignCache() when starting a new project.
let _cachedLayersByView: ViewLayers = {}
let _cachedGarmentColor = ''
export function clearDesignCache() { _cachedLayersByView = {}; _cachedGarmentColor = '' }

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function prefetchPreview(state: AppState, compositeImage: string) {
  const designImage = compositeImage || state.garment?.dataUrl || ''
  const key = cacheKey('preview', designImage.slice(-40))
  if (cacheGet(key)) return
  try {
    const data = await streamGenerate('/api/generate-preview', {
      garmentImage: designImage || null,
      logoImage: compositeImage ? null : (state.logo?.dataUrl ?? null),
      placement: 'center chest',
    }, () => {})
    cacheSet(key, data)
  } catch { /* silent — Phase 4 generates on demand */ }
}

function getPoint(e: MouseEvent | TouchEvent): { x: number; y: number } {
  if ('touches' in e) {
    const t = e.touches[0] ?? e.changedTouches[0]
    return { x: t?.clientX ?? 0, y: t?.clientY ?? 0 }
  }
  return { x: e.clientX, y: e.clientY }
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

// Auto-crop transparent padding so front/back/side views render at consistent sizes
async function cropPadding(src: string, pad = 6): Promise<string> {
  return new Promise(resolve => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      try {
        const c = document.createElement('canvas')
        c.width = img.width; c.height = img.height
        const ctx = c.getContext('2d')!
        ctx.drawImage(img, 0, 0)
        const d = ctx.getImageData(0, 0, img.width, img.height).data
        let x0 = img.width, y0 = img.height, x1 = 0, y1 = 0
        for (let y = 0; y < img.height; y++) {
          for (let x = 0; x < img.width; x++) {
            if (d[(y * img.width + x) * 4 + 3] > 6) {
              if (x < x0) x0 = x; if (y < y0) y0 = y
              if (x > x1) x1 = x; if (y > y1) y1 = y
            }
          }
        }
        if (x1 <= x0 || y1 <= y0) { resolve(src); return }
        const sx = Math.max(0, x0 - pad), sy = Math.max(0, y0 - pad)
        const sw = Math.min(img.width - sx, x1 - sx + pad + 1)
        const sh = Math.min(img.height - sy, y1 - sy + pad + 1)
        const out = document.createElement('canvas')
        out.width = sw; out.height = sh
        out.getContext('2d')!.drawImage(c, sx, sy, sw, sh, 0, 0, sw, sh)
        resolve(out.toDataURL('image/png'))
      } catch { resolve(src) }
    }
    img.onerror = () => resolve(src)
    img.src = src
  })
}

// Extract hardware pixels (zippers, buttons, metal) from a garment PNG.
// Returns a data URL that is transparent except where hardware is detected,
// so it can be composited on top of the color fill to preserve original metal tones.
// Detection: low saturation + mid luminance range (metallic neutral grays).
async function extractHardwareMask(src: string): Promise<string | null> {
  return new Promise(resolve => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      try {
        const W = img.width, H = img.height
        const c = document.createElement('canvas')
        c.width = W; c.height = H
        const ctx = c.getContext('2d')!
        ctx.drawImage(img, 0, 0)
        const src = ctx.getImageData(0, 0, W, H)
        const d = src.data
        const out = ctx.createImageData(W, H)

        for (let i = 0; i < W * H; i++) {
          const r = d[i*4], g = d[i*4+1], b = d[i*4+2], a = d[i*4+3]
          if (a < 30) continue
          const rf = r/255, gf = g/255, bf = b/255
          const max = Math.max(rf, gf, bf), min = Math.min(rf, gf, bf)
          const l = (max + min) / 2
          const s = max === min ? 0 : l < 0.5
            ? (max - min) / (max + min)
            : (max - min) / (2 - max - min)
          // Metallic hardware: low saturation, mid luminance (not bright fabric, not deep shadow)
          if (s < 0.08 && l >= 0.08 && l <= 0.52) {
            out.data[i*4] = r; out.data[i*4+1] = g; out.data[i*4+2] = b; out.data[i*4+3] = a
          }
        }
        ctx.putImageData(out, 0, 0)
        const dataUrl = c.toDataURL('image/png')
        // Reject if almost no hardware was found (fabric-only garment)
        let found = false
        for (let i = 3; i < out.data.length; i += 4) { if (out.data[i] > 0) { found = true; break } }
        resolve(found ? dataUrl : null)
      } catch { resolve(null) }
    }
    img.onerror = () => resolve(null)
    img.src = src
  })
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function Phase3Editor({ state, onComplete, onSetGarment, onBack }: Props) {
  const canvasRef = useRef<HTMLDivElement>(null)
  const [zoom, setZoom] = useState(100)
  const [garmentScale, setGarmentScale] = useState(100)
  // Restore garment color and layers from the module-level cache so back-navigation
  // returns the canvas exactly as the user left it.
  const [garmentColor, setGarmentColor] = useState(_cachedGarmentColor)
  const [leftTab, setLeftTab] = useState<'assets' | 'color' | 'text'>('assets')

  // Per-view layer state — restore from SPA cache on mount
  const [layersByView, setLayersByView] = useState<ViewLayers>(_cachedLayersByView)
  const [activeEditorView, setActiveEditorView] = useState('front')

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [dragging, setDragging] = useState<{ id: string; startX: number; startY: number; origX: number; origY: number } | null>(null)
  const [past, setPast] = useState<ViewLayers[]>([])
  const [future, setFuture] = useState<ViewLayers[]>([])
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle')
  const hydrated = useRef(false)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const croppedCache = useRef<Record<string, string>>({})
  const [displaySrcs, setDisplaySrcs] = useState<Record<string, string>>({})
  const hardwareCache = useRef<Record<string, string | null>>({})
  const [hardwareSrcs, setHardwareSrcs] = useState<Record<string, string | null>>({})

  // Derived
  const layers: LogoLayer[] = layersByView[activeEditorView] ?? []
  const selected = layers.find(l => l.id === selectedId) ?? null

  const setLayers = useCallback((updater: LogoLayer[] | ((prev: LogoLayer[]) => LogoLayer[])) => {
    setLayersByView(prev => ({
      ...prev,
      [activeEditorView]: typeof updater === 'function' ? updater(prev[activeEditorView] ?? []) : updater,
    }))
  }, [activeEditorView])

  // Available garment views
  const availableViews = (() => {
    const v = state.garment?.views
    const views: string[] = []
    if (v?.front) views.push('front')
    if (v?.back)  views.push('back')
    if (v?.side)  views.push('side')
    if (views.length === 0 && state.garment?.dataUrl) views.push('front')
    return views
  })()

  const garmentSrcForView = (view: string) =>
    state.garment?.views?.[view as 'front' | 'back' | 'side'] ?? state.garment?.dataUrl ?? ''

  // Crop transparent padding from garment assets per view for size normalisation
  useEffect(() => {
    const src = garmentSrcForView(activeEditorView)
    if (!src) return
    if (croppedCache.current[src]) {
      setDisplaySrcs(prev => ({ ...prev, [activeEditorView]: croppedCache.current[src] }))
      return
    }
    cropPadding(src).then(cropped => {
      croppedCache.current[src] = cropped
      setDisplaySrcs(prev => ({ ...prev, [activeEditorView]: cropped }))
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeEditorView, state.garment])

  // Extract hardware mask per view (zippers, metal) so they stay original-colored over the fill
  useEffect(() => {
    const src = displaySrcs[activeEditorView] || garmentSrcForView(activeEditorView)
    if (!src) return
    if (hardwareCache.current[src] !== undefined) {
      setHardwareSrcs(prev => ({ ...prev, [activeEditorView]: hardwareCache.current[src] ?? null }))
      return
    }
    extractHardwareMask(src).then(hw => {
      hardwareCache.current[src] = hw
      setHardwareSrcs(prev => ({ ...prev, [activeEditorView]: hw }))
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeEditorView, displaySrcs[activeEditorView], state.garment])

  // Load Google Fonts once
  useEffect(() => {
    if (document.getElementById('grace-fonts')) return
    const link = document.createElement('link')
    link.id = 'grace-fonts'
    link.rel = 'stylesheet'
    link.href = GOOGLE_FONTS_URL
    document.head.appendChild(link)
  }, [])

  // Init: restore active view from available garment views. Don't reset layers —
  // they are already initialised from the module-level cache above.
  useEffect(() => {
    if (availableViews.length > 0) setActiveEditorView(availableViews[0])
    hydrated.current = true
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Write to module-level SPA cache on every layer change so back-navigation restores state
  useEffect(() => {
    if (!hydrated.current) return
    _cachedLayersByView = layersByView
    setSaveStatus('saving')
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => setSaveStatus('saved'), 400)
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current) }
  }, [layersByView])

  // Keep garment color in sync with the cache
  useEffect(() => { _cachedGarmentColor = garmentColor }, [garmentColor])

  const snapshot = useCallback(() => {
    setPast(p => [...p.slice(-49), layersByView])
    setFuture([])
  }, [layersByView])

  const undo = () => {
    setPast(p => {
      if (!p.length) return p
      const prev = p[p.length - 1]
      setFuture(f => [layersByView, ...f])
      setLayersByView(prev)
      return p.slice(0, -1)
    })
  }

  const redo = () => {
    setFuture(f => {
      if (!f.length) return f
      const next = f[0]
      setPast(p => [...p, layersByView])
      setLayersByView(next)
      return f.slice(1)
    })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const updateSelected = (updates: Record<string, any>) => {
    if (!selectedId) return
    snapshot()
    setLayers(ls => ls.map(l => l.id === selectedId ? { ...l, ...updates } as LogoLayer : l))
  }

  // Drag handlers
  const handlePointerDown = (e: React.MouseEvent | React.TouchEvent, id: string) => {
    e.stopPropagation()
    setSelectedId(id)
    const layer = layers.find(l => l.id === id)
    if (!layer) return
    snapshot()
    const p = 'touches' in e
      ? { x: e.touches[0].clientX, y: e.touches[0].clientY }
      : { x: e.clientX, y: e.clientY }
    setDragging({ id, startX: p.x, startY: p.y, origX: layer.x, origY: layer.y })
  }

  const handlePointerMove = useCallback((e: MouseEvent | TouchEvent) => {
    if (!dragging) return
    if ('touches' in e) e.preventDefault()
    const p = getPoint(e)
    const dx = p.x - dragging.startX
    const dy = p.y - dragging.startY
    setLayers(ls => ls.map(l =>
      l.id === dragging.id ? { ...l, x: dragging.origX + dx, y: dragging.origY + dy } : l
    ))
  }, [dragging, setLayers])

  const handlePointerUp = useCallback(() => setDragging(null), [])

  useEffect(() => {
    window.addEventListener('mousemove', handlePointerMove)
    window.addEventListener('mouseup', handlePointerUp)
    window.addEventListener('touchmove', handlePointerMove, { passive: false })
    window.addEventListener('touchend', handlePointerUp)
    return () => {
      window.removeEventListener('mousemove', handlePointerMove)
      window.removeEventListener('mouseup', handlePointerUp)
      window.removeEventListener('touchmove', handlePointerMove)
      window.removeEventListener('touchend', handlePointerUp)
    }
  }, [handlePointerMove, handlePointerUp])

  const startResize = (e: React.MouseEvent | React.TouchEvent, layer: LogoLayer, cursor: string) => {
    e.stopPropagation()
    snapshot()
    const start = 'touches' in e
      ? { x: e.touches[0].clientX, y: e.touches[0].clientY }
      : { x: e.clientX, y: e.clientY }
    const { width: origW, height: origH, x: origX, y: origY } = layer
    const ar = origW / origH
    const origFontSize = layer.type === 'text' ? layer.fontSize : null

    const onMove = (ev: MouseEvent | TouchEvent) => {
      if ('touches' in ev) ev.preventDefault()
      const p = getPoint(ev)
      const dx = p.x - start.x
      let [newW, newH, newX, newY] = [origW, origH, origX, origY]
      if (cursor === 'se-resize') { newW = Math.max(40, origW + dx); newH = newW / ar }
      else if (cursor === 'sw-resize') { newW = Math.max(40, origW - dx); newH = newW / ar; newX = origX + dx }
      else if (cursor === 'ne-resize') { newW = Math.max(40, origW + dx); newH = newW / ar; newY = origY - (newH - origH) }
      else if (cursor === 'nw-resize') { newW = Math.max(40, origW - dx); newH = newW / ar; newX = origX + dx; newY = origY - (newH - origH) }
      setLayers(ls => ls.map(l => {
        if (l.id !== layer.id) return l
        const updated: Record<string, unknown> = { ...l, width: newW, height: newH, x: newX, y: newY }
        // Scale font size proportionally for text layers
        if (l.type === 'text' && origFontSize) updated.fontSize = Math.max(8, Math.round(origFontSize * (newW / origW)))
        return updated as unknown as LogoLayer
      }))
    }
    const onUp = () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      window.removeEventListener('touchmove', onMove)
      window.removeEventListener('touchend', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    window.addEventListener('touchmove', onMove, { passive: false })
    window.addEventListener('touchend', onUp)
  }

  const addTextLayer = () => {
    const id = crypto.randomUUID()
    snapshot()
    const newLayer: TextLayer = { id, type: 'text', text: 'YOUR TEXT', fontFamily: 'Bebas Neue', fontSize: 36, color: '#0A0A0A', x: 80, y: 180, width: 220, height: 60, rotation: 0 }
    setLayers(ls => [...ls, newLayer])
    setSelectedId(id)
    setLeftTab('assets')
  }

  const handleUploadLogo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return
    e.target.value = ''
    try {
      let dataUrl = await fileToDataUrl(file)
      try { dataUrl = await removeWhiteBackground(dataUrl) } catch {}
      const id = crypto.randomUUID()
      snapshot()
      setLayers(ls => [...ls, { id, type: 'image', dataUrl, x: 60, y: 80, width: 160, height: 80, rotation: 0 }])
      setSelectedId(id)
    } catch (err) {
      console.error('Upload failed', err)
    }
  }

  const handleUploadGarment = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return
    const reader = new FileReader()
    reader.onload = ev => {
      const url = ev.target?.result as string
      onSetGarment({ svg: '', dataUrl: url, views: { front: url }, type: 'custom', color: 'custom' })
    }
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  // Composite all layers + garment (current view) to a single PNG
  const compositeDesign = async (): Promise<string> => {
    const garmentSrc = garmentSrcForView(activeEditorView)
    if (!garmentSrc) return ''
    // Ensure custom fonts are loaded before rendering text
    for (const layer of layers) {
      if (layer.type === 'text') {
        try { await document.fonts.load(`bold ${layer.fontSize}px "${layer.fontFamily}"`) } catch {}
      }
    }
    const W = 380, H = 460, SCALE = 2
    const canvas = document.createElement('canvas')
    canvas.width = W * SCALE; canvas.height = H * SCALE
    const ctx = canvas.getContext('2d')
    if (!ctx) return ''
    ctx.scale(SCALE, SCALE)
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, W, H)

    const g = await loadImage(garmentSrc)
    const fit = Math.min(GARMENT_DISPLAY_W / g.width, GARMENT_DISPLAY_H / g.height) * (garmentScale / 100)
    const gw = g.width * fit, gh = g.height * fit
    const gx = (W - gw) / 2, gy = (H - gh) / 2

    if (garmentColor) {
      // Build colored garment on a transparent offscreen canvas so the color is
      // clipped strictly to the garment's alpha channel — not the full artboard.
      const gc = document.createElement('canvas')
      gc.width = Math.ceil(gw * SCALE)
      gc.height = Math.ceil(gh * SCALE)
      const gctx = gc.getContext('2d')!
      gctx.scale(SCALE, SCALE)
      gctx.drawImage(g, 0, 0, gw, gh)              // establishes garment alpha mask
      gctx.globalCompositeOperation = 'source-atop' // paint color only inside alpha
      gctx.fillStyle = garmentColor
      gctx.fillRect(0, 0, gw, gh)
      // Layer 2: multiply — dark pixels (shadows/seams/stitching) absorb into the color
      gctx.globalCompositeOperation = 'multiply'
      gctx.drawImage(g, 0, 0, gw, gh)
      // Layer 3: soft-light — adds wrinkle highlights, fold depth, and fabric contrast
      gctx.globalCompositeOperation = 'soft-light'
      gctx.globalAlpha = 0.5
      gctx.drawImage(g, 0, 0, gw, gh)
      gctx.globalAlpha = 1.0
      gctx.globalCompositeOperation = 'source-over'
      // Composite the tinted garment onto the white main canvas
      ctx.drawImage(gc, 0, 0, gc.width, gc.height, gx, gy, gw, gh)

      // Hardware overlay — draw original hardware pixels (zippers, buttons, metal) on top
      const hwSrc = hardwareSrcs[activeEditorView]
      if (hwSrc) {
        try {
          const hw = await loadImage(hwSrc)
          ctx.drawImage(hw, gx, gy, gw, gh)
        } catch { /* non-fatal */ }
      }
    } else {
      ctx.drawImage(g, gx, gy, gw, gh)
    }

    for (const layer of layers) {
      ctx.save()
      ctx.translate(layer.x + layer.width / 2, layer.y + layer.height / 2)
      ctx.rotate((layer.rotation * Math.PI) / 180)
      if (layer.type === 'text') {
        ctx.font = `bold ${layer.fontSize}px "${layer.fontFamily}"`
        ctx.fillStyle = layer.color
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(layer.text, 0, 0)
      } else {
        const img = await loadImage(layer.dataUrl)
        const lf = Math.min(layer.width / img.width, layer.height / img.height)
        ctx.drawImage(img, (-img.width * lf) / 2, (-img.height * lf) / 2, img.width * lf, img.height * lf)
        if (layer.tintColor) {
          ctx.globalCompositeOperation = 'multiply'
          ctx.fillStyle = layer.tintColor
          ctx.fillRect(-layer.width / 2, -layer.height / 2, layer.width, layer.height)
          ctx.globalCompositeOperation = 'source-over'
        }
      }
      ctx.restore()
    }
    return canvas.toDataURL('image/png')
  }

  const handleConfirm = async () => {
    let composite = ''
    try { composite = await compositeDesign() } catch (e) { console.error(e) }
    if (garmentColor && state.garment) onSetGarment({ ...state.garment, color: garmentColor })
    prefetchPreview(state, composite)
    onComplete({ confirmed: true, previewDataUrl: composite })
  }

  const moveLayer = (direction: 'up' | 'down') => {
    if (!selectedId) return
    snapshot()
    setLayers(ls => {
      const idx = ls.findIndex(l => l.id === selectedId)
      if (idx === -1) return ls
      const next = [...ls]
      if (direction === 'up' && idx < ls.length - 1) [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]]
      if (direction === 'down' && idx > 0) [next[idx], next[idx - 1]] = [next[idx - 1], next[idx]]
      return next
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

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="p-6 w-full">
      <div className="mb-5 flex items-start justify-between">
        <div>
          <p className="phase-header">Phase 3</p>
          <h1 className="text-xl font-bold text-gray-900">Apply Design to Garment</h1>
          <p className="text-gray-500 text-sm mt-1">Place artwork, text, and adjust the garment color</p>
        </div>
        <button onClick={onBack} className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-700 transition-colors mt-1">
          <ArrowLeft size={14}/> Back
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[220px_1fr_240px] gap-4">

        {/* ── Left panel ── */}
        <div className="space-y-3">
          {/* Tab bar */}
          <div className="flex rounded-lg border border-slate-200 overflow-hidden">
            {([
              { id: 'assets', label: 'Art',   icon: <Upload  size={11}/> },
              { id: 'color',  label: 'Color', icon: <Palette size={11}/> },
              { id: 'text',   label: 'Text',  icon: <Type    size={11}/> },
            ] as const).map(tab => (
              <button key={tab.id} onClick={() => setLeftTab(tab.id)}
                className={`flex-1 flex items-center justify-center gap-1 py-2 text-[10px] font-semibold uppercase tracking-wider transition-colors ${
                  leftTab === tab.id ? 'bg-grace-ink text-white' : 'text-grace-stone hover:bg-grace-mist'
                }`}>
                {tab.icon} {tab.label}
              </button>
            ))}
          </div>

          {/* Art tab */}
          {leftTab === 'assets' && (
            <div className="card space-y-3">
              <p className="text-xs font-medium text-gray-600">Artwork</p>
              <label className="btn-secondary w-full flex items-center justify-center gap-2 cursor-pointer">
                <Upload size={13}/> Upload Image
                <input type="file" className="hidden" accept="image/png,image/svg+xml,application/pdf,.png,.svg,.pdf" onChange={handleUploadLogo}/>
              </label>
              {state.logo && (
                <button
                  onClick={() => {
                    const id = crypto.randomUUID()
                    snapshot()
                    const newLayer: ImageLayer = { id, type: 'image', dataUrl: state.logo!.dataUrl, x: 60, y: 80, width: 160, height: 80, rotation: 0 }
                    setLayers(ls => [...ls, newLayer])
                    setSelectedId(id)
                  }}
                  className="w-full bg-slate-50 hover:bg-slate-100 rounded-lg overflow-hidden transition-colors">
                  <div className="checkerboard rounded-t-lg" style={{ height: 64 }}>
                    <img src={state.logo.dataUrl} alt="logo" className="w-full h-full object-contain p-2"/>
                  </div>
                  <p className="text-[11px] text-gray-500 py-1.5 px-2 text-left">Add logo to canvas</p>
                </button>
              )}
            </div>
          )}

          {/* Color tab */}
          {leftTab === 'color' && (
            <div className="card space-y-3">
              <p className="text-xs font-medium text-gray-600">Garment Color</p>
              <div className="grid grid-cols-4 gap-2">
                {GARMENT_COLORS.map(c => (
                  <button key={c} onClick={() => setGarmentColor(c === garmentColor ? '' : c)}
                    title={c}
                    style={{ backgroundColor: c }}
                    className={`w-full aspect-square rounded-lg border-2 transition-all ${
                      garmentColor === c ? 'border-grace-ink scale-110 shadow-md' : 'border-transparent hover:border-slate-300'
                    } ${c === '#FFFFFF' || c === '#F5F5F5' ? 'border-slate-200' : ''}`}
                  />
                ))}
              </div>
              <label className="flex items-center gap-2 text-xs text-gray-500">
                <span className="flex-1">Custom</span>
                <input type="color" value={garmentColor || '#FFFFFF'} onChange={e => setGarmentColor(e.target.value)}
                  className="w-8 h-7 rounded cursor-pointer border border-slate-200"/>
              </label>
              {garmentColor && (
                <button onClick={() => setGarmentColor('')} className="text-[11px] text-gray-400 hover:text-gray-700 transition-colors">
                  Clear color
                </button>
              )}
            </div>
          )}

          {/* Text tab */}
          {leftTab === 'text' && (
            <div className="card space-y-3">
              <p className="text-xs font-medium text-gray-600">Add Text</p>
              <button onClick={addTextLayer} className="btn-primary w-full flex items-center justify-center gap-2">
                <Type size={13}/> Add Text Layer
              </button>
              <p className="text-[11px] text-gray-400 leading-relaxed">
                Adds a draggable text layer. Select it to change font, size, and color.
              </p>
            </div>
          )}

          {/* Layers list */}
          {layers.length > 0 && (
            <div className="card">
              <p className="text-xs font-medium text-gray-600 mb-2">Layers</p>
              <div className="space-y-1">
                {[...layers].reverse().map((layer, i) => (
                  <button key={layer.id} onClick={() => setSelectedId(layer.id)}
                    className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs transition-colors ${
                      selectedId === layer.id ? 'bg-brand-green/10 text-gray-900' : 'hover:bg-slate-100 text-gray-500'
                    }`}>
                    {layer.type === 'text' ? <Type size={11}/> : <Layers size={11}/>}
                    <span className="truncate flex-1 text-left">
                      {layer.type === 'text' ? (layer.text.slice(0, 16) || 'Text') : `Artwork ${layers.length - i}`}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Garment fit */}
          {state.garment && (
            <div className="card">
              <div className="flex justify-between items-center mb-2">
                <p className="text-xs font-medium text-gray-600">Garment Fit</p>
                <span className="text-xs text-gray-700">{garmentScale}%</span>
              </div>
              <input type="range" min={25} max={200} value={garmentScale}
                onChange={e => setGarmentScale(parseInt(e.target.value))}
                className="w-full accent-brand-green"/>
              <button onClick={() => setGarmentScale(100)} className="mt-1.5 text-[11px] text-gray-400 hover:text-gray-700 transition-colors">
                Reset
              </button>
            </div>
          )}
        </div>

        {/* ── Canvas ── */}
        <div className="card p-0 overflow-hidden">
          {/* Toolbar */}
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-200 gap-2">
            <div className="flex items-center gap-1">
              <button onClick={undo} disabled={past.length === 0} title="Undo"
                className="p-1.5 rounded hover:bg-slate-100 text-gray-400 hover:text-gray-700 transition-colors disabled:opacity-30">
                <Undo2 size={14}/>
              </button>
              <button onClick={redo} disabled={future.length === 0} title="Redo"
                className="p-1.5 rounded hover:bg-slate-100 text-gray-400 hover:text-gray-700 transition-colors disabled:opacity-30">
                <Redo2 size={14}/>
              </button>

              {/* View tabs — only shown when multiple views exist */}
              {availableViews.length > 1 && (
                <div className="flex items-center gap-1 ml-3 border-l border-slate-200 pl-3">
                  {availableViews.map(v => (
                    <button key={v} onClick={() => { setActiveEditorView(v); setSelectedId(null) }}
                      className={`px-2.5 py-1 rounded-md text-[11px] font-medium capitalize transition-colors ${
                        activeEditorView === v ? 'bg-grace-ink text-white' : 'text-gray-500 hover:bg-slate-100'
                      }`}>
                      {v}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="flex items-center gap-2 text-xs text-gray-500">
              <button onClick={() => setZoom(z => Math.max(25, z - 25))} className="p-1 rounded hover:bg-slate-100 hover:text-gray-700 transition-colors">
                <Minus size={12}/>
              </button>
              <span className="w-12 text-center">{zoom}%</span>
              <button onClick={() => setZoom(z => Math.min(200, z + 25))} className="p-1 rounded hover:bg-slate-100 hover:text-gray-700 transition-colors">
                <Plus size={12}/>
              </button>
            </div>

            <div className="flex items-center gap-2.5">
              <span className="text-[11px] text-gray-400 flex items-center gap-1">
                {saveStatus === 'saving' && <><Loader2 size={11} className="animate-spin"/> Saving…</>}
                {saveStatus === 'saved'  && <><Check   size={11} className="text-brand-green"/> Saved</>}
              </span>
              <button onClick={handleConfirm} className="btn-primary flex items-center gap-1.5">
                Confirm Design <ArrowRight size={13}/>
              </button>
            </div>
          </div>

          {/* Canvas area */}
          <div ref={canvasRef}
            className="relative bg-white overflow-hidden flex items-center justify-center"
            style={{ minHeight: 480 }}
            onClick={e => { if (e.target === e.currentTarget) setSelectedId(null) }}>
            <div style={{ transform: `scale(${zoom / 100})`, transformOrigin: 'center center', position: 'relative', width: 380, height: 460 }}>

              {/* Garment */}
              {(() => {
                const garmentDisplaySrc = displaySrcs[activeEditorView] || garmentSrcForView(activeEditorView)
                return garmentSrcForView(activeEditorView) ? (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none"
                  style={{ transform: `scale(${garmentScale / 100})`, transformOrigin: 'center center' }}>
                  {/* isolation:isolate scopes mix-blend-mode to this container only */}
                  <div style={{
                    position: 'relative', width: GARMENT_DISPLAY_W, height: GARMENT_DISPLAY_H, flexShrink: 0,
                    isolation: garmentColor ? 'isolate' : undefined,
                  }}>
                    {garmentColor && (
                      // Layer 1 — color fill clipped to garment alpha silhouette
                      <div style={{
                        position: 'absolute', inset: 0,
                        backgroundColor: garmentColor,
                        WebkitMaskImage: `url("${garmentDisplaySrc}")`,
                        WebkitMaskSize: 'contain',
                        WebkitMaskRepeat: 'no-repeat',
                        WebkitMaskPosition: 'center',
                        maskImage: `url("${garmentDisplaySrc}")`,
                        maskSize: 'contain',
                        maskRepeat: 'no-repeat',
                        maskPosition: 'center',
                        pointerEvents: 'none',
                      } as React.CSSProperties}/>
                    )}
                    {/* Layer 2 — multiply: white pixels become transparent, dark pixels
                        (shadows, seams, stitching, zipper) darken the color fill */}
                    <img src={garmentDisplaySrc} alt="garment" draggable={false}
                      style={{
                        position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain',
                        mixBlendMode: garmentColor ? 'multiply' : 'normal',
                        pointerEvents: 'none',
                      } as React.CSSProperties}/>
                    {/* Layer 3 — soft-light: wrinkle highlights, fold depth, fabric texture */}
                    {garmentColor && (
                      <img src={garmentDisplaySrc} alt="" aria-hidden draggable={false}
                        style={{
                          position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain',
                          mixBlendMode: 'soft-light',
                          opacity: 0.5,
                          pointerEvents: 'none',
                        } as React.CSSProperties}/>
                    )}
                    {/* Layer 4 — hardware overlay: zippers, buttons, metal hardware retain
                        their original pixel colors and are composited over the color stack
                        with normal blend (source-over). This layer only appears when a
                        garment color is active so it never affects the uncolored display. */}
                    {garmentColor && hardwareSrcs[activeEditorView] && (
                      <img src={hardwareSrcs[activeEditorView]!} alt="" aria-hidden draggable={false}
                        style={{
                          position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain',
                          mixBlendMode: 'normal',
                          pointerEvents: 'none',
                        }}/>
                    )}
                    {/* Spacer keeps the container at the right height */}
                    <div style={{ width: '100%', height: '100%', visibility: 'hidden' }}/>
                  </div>
                </div>
                ) : null
              })()}
              {/* SVG garment fallback */}
              {!garmentSrcForView(activeEditorView) && state.garment?.svg && (
                <div className="absolute inset-0 pointer-events-none"
                  style={{ transform: `scale(${garmentScale / 100})`, transformOrigin: 'center center' }}
                  dangerouslySetInnerHTML={{ __html: state.garment.svg }}
                />
              )}
              {/* No garment — upload prompt */}
              {!garmentSrcForView(activeEditorView) && !state.garment?.svg && (
                <label className="absolute inset-0 flex flex-col items-center justify-center gap-2 cursor-pointer text-gray-400 hover:text-gray-600 transition-colors">
                  <Upload size={28}/>
                  <span className="text-xs font-medium">Upload a garment</span>
                  <span className="text-[11px] text-gray-400">or generate one in Phase 2</span>
                  <input type="file" className="hidden" accept="image/*" onChange={handleUploadGarment}/>
                </label>
              )}

              {/* Layers */}
              {layers.map(layer => (
                <div key={layer.id}
                  onMouseDown={e => handlePointerDown(e, layer.id)}
                  onTouchStart={e => handlePointerDown(e, layer.id)}
                  style={{
                    position: 'absolute',
                    left: layer.x, top: layer.y,
                    width: layer.width, height: layer.height,
                    transform: `rotate(${layer.rotation}deg)`,
                    cursor: dragging?.id === layer.id ? 'grabbing' : 'grab',
                    outline: selectedId === layer.id ? '2px solid #0A0A0A' : 'none',
                    outlineOffset: 2,
                    userSelect: 'none', touchAction: 'none',
                  }}>
                  {layer.type === 'text' ? (
                    <div style={{
                      width: '100%', height: '100%',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontFamily: `"${layer.fontFamily}", sans-serif`,
                      fontSize: layer.fontSize,
                      color: layer.color,
                      whiteSpace: 'nowrap', overflow: 'hidden',
                      pointerEvents: 'none',
                    }}>
                      {layer.text || 'Your Text'}
                    </div>
                  ) : (
                    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
                      <img src={layer.dataUrl} alt="artwork" className="w-full h-full object-contain" draggable={false}/>
                      {layer.tintColor && (
                        <div style={{ position: 'absolute', inset: 0, backgroundColor: layer.tintColor, mixBlendMode: 'multiply', pointerEvents: 'none' }}/>
                      )}
                    </div>
                  )}

                  {selectedId === layer.id && (
                    <>
                      {([
                        { cursor: 'nw-resize', top: -4, left: -4 },
                        { cursor: 'ne-resize', top: -4, right: -4 },
                        { cursor: 'sw-resize', bottom: -4, left: -4 },
                        { cursor: 'se-resize', bottom: -4, right: -4 },
                      ] as const).map((handle, i) => (
                        <div key={i}
                          style={{ position: 'absolute', width: 18, height: 18, background: 'white', border: '2px solid #0A0A0A', borderRadius: 3, touchAction: 'none', ...handle }}
                          onMouseDown={e => startResize(e, layer, handle.cursor)}
                          onTouchStart={e => startResize(e, layer, handle.cursor)}
                        />
                      ))}
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── Right panel ── */}
        <div className="space-y-3">
          {selected ? (
            <>
              {/* Text controls */}
              {selected.type === 'text' && (
                <div className="card space-y-3">
                  <p className="text-xs font-medium text-gray-600">Text</p>
                  <textarea
                    value={selected.text}
                    onChange={e => updateSelected({ text: e.target.value })}
                    className="textarea-field text-sm resize-none"
                    rows={2}
                    placeholder="Your text here"
                  />

                  <div>
                    <p className="text-[11px] text-gray-500 mb-1.5">Font Library</p>
                    <div className="grid grid-cols-2 gap-1 max-h-44 overflow-y-auto pr-0.5">
                      {FONT_LIBRARY.map(f => (
                        <button key={f.name} onClick={() => updateSelected({ fontFamily: f.name })}
                          style={{ fontFamily: `"${f.name}", sans-serif` }}
                          className={`px-2 py-1.5 rounded border text-xs truncate transition-all text-left ${
                            (selected as TextLayer).fontFamily === f.name
                              ? 'border-grace-ink bg-grace-ink text-white'
                              : 'border-slate-200 hover:border-slate-300 text-gray-700'
                          }`}>
                          {f.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <ControlRow
                    label="Size"
                    value={(selected as TextLayer).fontSize}
                    unit="px"
                    onDecrement={() => updateSelected({ fontSize: Math.max(8, (selected as TextLayer).fontSize - 2) })}
                    onIncrement={() => updateSelected({ fontSize: Math.min(200, (selected as TextLayer).fontSize + 2) })}
                  />

                  <div>
                    <p className="text-[11px] text-gray-500 mb-1.5">Color</p>
                    <div className="grid grid-cols-6 gap-1.5 mb-2">
                      {COLOR_SWATCHES.map(c => (
                        <button key={c} onClick={() => updateSelected({ color: c })}
                          style={{ backgroundColor: c }}
                          className={`aspect-square rounded border-2 transition-all ${(selected as TextLayer).color === c ? 'border-grace-ink scale-110' : 'border-transparent hover:border-slate-300'} ${c === '#FFFFFF' ? 'border-slate-200' : ''}`}
                        />
                      ))}
                    </div>
                    <input type="color" value={(selected as TextLayer).color}
                      onChange={e => updateSelected({ color: e.target.value })}
                      className="w-full h-7 rounded cursor-pointer border border-slate-200"/>
                  </div>
                </div>
              )}

              {/* Artwork recolor */}
              {selected.type === 'image' && (
                <div className="card space-y-2">
                  <p className="text-xs font-medium text-gray-600">Recolor Artwork</p>
                  <div className="grid grid-cols-6 gap-1.5">
                    {COLOR_SWATCHES.map(c => (
                      <button key={c} onClick={() => updateSelected({ tintColor: (selected as ImageLayer).tintColor === c ? undefined : c })}
                        style={{ backgroundColor: c }}
                        className={`aspect-square rounded border-2 transition-all ${(selected as ImageLayer).tintColor === c ? 'border-grace-ink scale-110' : 'border-transparent hover:border-slate-300'} ${c === '#FFFFFF' ? 'border-slate-200' : ''}`}
                      />
                    ))}
                  </div>
                  <input type="color" value={(selected as ImageLayer).tintColor || '#000000'}
                    onChange={e => updateSelected({ tintColor: e.target.value })}
                    className="w-full h-7 rounded cursor-pointer border border-slate-200"/>
                  {(selected as ImageLayer).tintColor && (
                    <button onClick={() => updateSelected({ tintColor: undefined })} className="text-[11px] text-gray-400 hover:text-gray-700 transition-colors">
                      Clear tint
                    </button>
                  )}
                </div>
              )}

              {/* Transform */}
              <div className="card">
                <p className="text-xs font-medium text-gray-600 mb-3">Transform</p>
                <div className="space-y-3">
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
                        <button onClick={() => updateSelected({ rotation: selected.rotation - 15 })} className="w-5 h-5 flex items-center justify-center rounded hover:bg-slate-100 text-gray-500 text-xs">−</button>
                        <span className="text-xs text-gray-700 w-10 text-center">{selected.rotation}°</span>
                        <button onClick={() => updateSelected({ rotation: selected.rotation + 15 })} className="w-5 h-5 flex items-center justify-center rounded hover:bg-slate-100 text-gray-500 text-xs">+</button>
                      </div>
                    </div>
                    <input type="range" min={-180} max={180} value={selected.rotation}
                      onChange={e => updateSelected({ rotation: parseInt(e.target.value) })}
                      className="w-full accent-brand-green"/>
                  </div>
                  <div>
                    <span className="text-xs text-gray-500 block mb-2">Position</span>
                    <div className="grid grid-cols-3 gap-1">
                      <div/>
                      <button onClick={() => updateSelected({ y: selected.y - 10 })} className="btn-secondary py-1.5 flex items-center justify-center"><ChevronUp size={12}/></button>
                      <div/>
                      <button onClick={() => updateSelected({ x: selected.x - 10 })} className="btn-secondary py-1.5 flex items-center justify-center"><ArrowLeft size={12}/></button>
                      <div className="w-6 h-6 rounded-full bg-slate-200 mx-auto self-center"/>
                      <button onClick={() => updateSelected({ x: selected.x + 10 })} className="btn-secondary py-1.5 flex items-center justify-center"><ArrowRight size={12}/></button>
                      <div/>
                      <button onClick={() => updateSelected({ y: selected.y + 10 })} className="btn-secondary py-1.5 flex items-center justify-center"><ChevronDown size={12}/></button>
                      <div/>
                    </div>
                  </div>
                </div>
              </div>

              {/* Layer order */}
              <div className="card">
                <p className="text-xs font-medium text-gray-600 mb-2">Layer Controls</p>
                <div className="grid grid-cols-2 gap-1.5">
                  <button onClick={() => moveLayer('up')} className="btn-secondary flex items-center justify-center gap-1 text-xs py-2"><ChevronUp size={12}/> Bring Fwd</button>
                  <button onClick={() => moveLayer('down')} className="btn-secondary flex items-center justify-center gap-1 text-xs py-2"><ChevronDown size={12}/> Send Bkwd</button>
                  <button onClick={duplicateSelected} className="btn-secondary flex items-center justify-center gap-1 text-xs py-2"><Copy size={12}/> Duplicate</button>
                  <button onClick={deleteSelected} className="flex items-center justify-center gap-1 text-xs py-2 rounded-lg bg-red-50 hover:bg-red-100 text-red-500 border border-red-200 transition-colors"><Trash2 size={12}/> Delete</button>
                </div>
              </div>
            </>
          ) : (
            <div className="card">
              <div className="text-center py-8">
                <Layers size={24} className="mx-auto text-gray-300 mb-2"/>
                <p className="text-xs text-gray-400">Select a layer to edit</p>
                <p className="text-[11px] text-gray-300 mt-1">or add artwork / text from the left panel</p>
              </div>
            </div>
          )}

          {garmentSrcForView(activeEditorView) && (
            <button onClick={async () => {
              const composite = await compositeDesign()
              const a = document.createElement('a')
              a.href = composite || garmentSrcForView(activeEditorView)
              a.download = `design_${activeEditorView}.png`
              a.click()
            }} className="btn-secondary w-full flex items-center justify-center gap-2">
              <Download size={13}/> Download Design
            </button>
          )}

          <button onClick={handleConfirm}
            className="w-full flex items-center justify-center gap-2 font-medium py-3 px-4 rounded-xl transition-colors text-sm bg-brand-green hover:bg-brand-green-light text-white">
            Confirm Design <ArrowRight size={15}/>
          </button>
        </div>

      </div>
    </div>
  )
}

function ControlRow({ label, value, unit, onDecrement, onIncrement }: {
  label: string; value: number; unit: string; onDecrement: () => void; onIncrement: () => void
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-gray-500">{label}</span>
      <div className="flex items-center gap-1.5">
        <button onClick={onDecrement} className="w-5 h-5 flex items-center justify-center rounded hover:bg-slate-100 text-gray-500 text-xs">−</button>
        <span className="text-xs text-gray-700 w-14 text-center">{value}{unit}</span>
        <button onClick={onIncrement} className="w-5 h-5 flex items-center justify-center rounded hover:bg-slate-100 text-gray-500 text-xs">+</button>
      </div>
    </div>
  )
}
