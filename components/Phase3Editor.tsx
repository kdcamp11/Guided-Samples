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
import { downloadDataUrl, downloadAssetsZip } from '@/lib/downloadAssets'

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
  isLogo?: boolean
}

interface TextLayer extends BaseLayer {
  type: 'text'
  text: string
  fontFamily: string
  fontSize: number
  color: string
  fontWeight?: 'normal' | 'bold'
  fontStyle?: 'normal' | 'italic'
  strokeColor?: string
  strokeWidth?: number
  archAmount?: number
}

type LogoLayer = ImageLayer | TextLayer
export type ViewLayers = Record<string, LogoLayer[]>

interface Props {
  state: AppState
  onComplete: (design: AppState['design']) => void
  onSetGarment: (garment: AppState['garment']) => void
  onBack: () => void
  hideHeader?: boolean
  hideSidebar?: boolean
  pendingArtwork?: string | null
  onArtworkConsumed?: () => void
  onStudioStateChange?: (s: { layersByView: ViewLayers; garmentColor: string }) => void
}

// ─── Constants ────────────────────────────────────────────────────────────────

// Fixed logical display box — all garment views render at the same size
// regardless of source image dimensions, keeping front/back/side consistent.
const GARMENT_DISPLAY_W = 320
const GARMENT_DISPLAY_H = 400

const GOOGLE_FONTS_URL =
  'https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Anton&family=Oswald:wght@400;700&family=Barlow+Condensed:wght@400;700&family=Montserrat:wght@400;700&family=Pacifico&family=Racing+Sans+One&family=Space+Grotesk:wght@400;700&family=Unbounded:wght@400;700&family=Righteous&family=Orbitron:wght@400;700&family=Permanent+Marker&family=Black+Ops+One&family=Graduate&family=Bungee&family=Archivo+Black&display=swap'

const FONT_LIBRARY = [
  { name: 'Bebas Neue',        label: 'BEBAS NEUE'     },
  { name: 'Anton',             label: 'ANTON'           },
  { name: 'Racing Sans One',   label: 'Racing Sans'     },
  { name: 'Oswald',            label: 'Oswald'          },
  { name: 'Barlow Condensed',  label: 'Barlow'          },
  { name: 'Montserrat',        label: 'Montserrat'      },
  { name: 'Pacifico',          label: 'Pacifico'        },
  { name: 'Space Grotesk',     label: 'Space Grotesk'   },
  { name: 'Unbounded',         label: 'Unbounded'       },
  { name: 'Righteous',         label: 'Righteous'       },
  { name: 'Orbitron',          label: 'Orbitron'        },
  { name: 'Permanent Marker',  label: 'Marker'          },
  { name: 'Black Ops One',     label: 'Black Ops'       },
  { name: 'Graduate',          label: 'Graduate'        },
  { name: 'Bungee',            label: 'Bungee'          },
  { name: 'Archivo Black',     label: 'Archivo Black'   },
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

// ─── Arch/curve text helpers ──────────────────────────────────────────────────

function archTextSvg(layer: TextLayer, w: number, h: number): string {
  const arch = layer.archAmount ?? 0
  const text = layer.text || 'Your Text'
  const fw = layer.fontWeight ?? 'bold'
  const fi = layer.fontStyle ?? 'normal'
  const sw = layer.strokeWidth ?? 0
  const strokeAttr = sw > 0
    ? `stroke="${layer.strokeColor ?? '#000000'}" stroke-width="${sw * 2}" paint-order="stroke fill" stroke-linejoin="round"`
    : ''

  const fontAttr = `font-family="${layer.fontFamily}, sans-serif" font-size="${layer.fontSize}" fill="${layer.color}" font-weight="${fw}" font-style="${fi}"`

  if (!arch) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><text x="${w/2}" y="${h/2}" text-anchor="middle" dominant-baseline="middle" ${fontAttr} ${strokeAttr}>${text}</text></svg>`
  }

  const lift = Math.abs(arch / 100) * h * 0.75
  const r = (w * w / 4 + lift * lift) / (2 * lift)
  const baseY = arch > 0 ? h * 0.7 : h * 0.3
  const sweep = arch > 0 ? 1 : 0

  const pathD = `M 0,${baseY} A ${r},${r} 0 0,${sweep} ${w},${baseY}`
  const pid = 'ap'
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" overflow="visible"><defs><path id="${pid}" d="${pathD}"/></defs><text ${fontAttr} ${strokeAttr} text-anchor="middle"><textPath href="#${pid}" startOffset="50%">${text}</textPath></text></svg>`
}

async function archTextToDataUrl(layer: TextLayer, w: number, h: number): Promise<string> {
  const svg = archTextSvg(layer, w, h)
  const blob = new Blob([svg], { type: 'image/svg+xml' })
  const url = URL.createObjectURL(blob)
  try {
    const img = await loadImage(url)
    const canvas = document.createElement('canvas')
    canvas.width = w * 2; canvas.height = h * 2
    const ctx = canvas.getContext('2d')!
    ctx.scale(2, 2)
    ctx.drawImage(img, 0, 0, w, h)
    return canvas.toDataURL('image/png')
  } finally {
    URL.revokeObjectURL(url)
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

function ArchTextPreview({ layer }: { layer: TextLayer }) {
  const [src, setSrc] = useState('')
  useEffect(() => {
    const svg = archTextSvg(layer, layer.width, layer.height)
    const blob = new Blob([svg], { type: 'image/svg+xml' })
    const url = URL.createObjectURL(blob)
    setSrc(url)
    return () => URL.revokeObjectURL(url)
  }, [layer.text, layer.fontFamily, layer.fontSize, layer.color, layer.fontWeight, layer.fontStyle, layer.strokeWidth, layer.strokeColor, layer.archAmount, layer.width, layer.height])
  if (!src) return null
  return <img src={src} alt={layer.text} className="w-full h-full object-contain" draggable={false} style={{ pointerEvents: 'none' }}/>
}

export default function Phase3Editor({ state, onComplete, onSetGarment, onBack, hideHeader, hideSidebar, pendingArtwork, onArtworkConsumed, onStudioStateChange }: Props) {
  const canvasRef = useRef<HTMLDivElement>(null)
  const [zoom, setZoom] = useState(100)
  const [garmentScale, setGarmentScale] = useState(100)
  const [garmentOffset, setGarmentOffset] = useState({ x: 0, y: 0 })
  const [garmentDragging, setGarmentDragging] = useState(false)
  // Restore garment color and layers — prefer persisted studioState (for project loads),
  // then fall back to the module-level SPA cache (for back-navigation within a session).
  const [garmentColor, setGarmentColor] = useState(
    state.studioState?.garmentColor ?? _cachedGarmentColor
  )
  const [leftTab, setLeftTab] = useState<'logoart' | 'garment' | 'text'>('logoart')

  // Per-view layer state — prefer persisted studioState, fall back to SPA cache
  const [layersByView, setLayersByView] = useState<ViewLayers>(
    (state.studioState?.layersByView as ViewLayers | undefined) ?? _cachedLayersByView
  )
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
  const [tintedDataUrls, setTintedDataUrls] = useState<Record<string, string>>({})

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

  // Load Google Fonts once
  useEffect(() => {
    if (document.getElementById('grace-fonts')) return
    const link = document.createElement('link')
    link.id = 'grace-fonts'
    link.rel = 'stylesheet'
    link.href = GOOGLE_FONTS_URL
    document.head.appendChild(link)
  }, [])

  // Compute tinted data URLs for image layers with tintColor.
  // Uses 'color' blend mode (applies hue+saturation of tint, keeps luminosity of original),
  // then 'destination-in' to restore the original's alpha channel exactly.
  useEffect(() => {
    layers.forEach(layer => {
      if (layer.type !== 'image' || !layer.tintColor) return
      const key = `${layer.id}_${layer.tintColor}`
      if (tintedDataUrls[key]) return
      ;(async () => {
        const img = await loadImage(layer.dataUrl)
        const off = document.createElement('canvas')
        off.width = img.width; off.height = img.height
        const offCtx = off.getContext('2d')!
        // Step 1: draw original
        offCtx.drawImage(img, 0, 0)
        // Step 2: apply tint hue+saturation while keeping original luminosity
        offCtx.globalCompositeOperation = 'color'
        offCtx.fillStyle = (layer as ImageLayer).tintColor!
        offCtx.fillRect(0, 0, off.width, off.height)
        // Step 3: restore original alpha channel (transparent pixels stay transparent)
        offCtx.globalCompositeOperation = 'destination-in'
        offCtx.drawImage(img, 0, 0)
        offCtx.globalCompositeOperation = 'source-over'
        setTintedDataUrls(prev => ({ ...prev, [key]: off.toDataURL('image/png') }))
      })()
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layers])

  // Init: restore active view from available garment views. Don't reset layers —
  // they are already initialised from the module-level cache above.
  useEffect(() => {
    if (availableViews.length > 0) setActiveEditorView(availableViews[0])
    hydrated.current = true
    // Update any logo layers to use the current logo dataUrl (handles logo updates in Phase 1)
    if (state.logo?.dataUrl) {
      setLayersByView(prev => {
        const updated: ViewLayers = {}
        for (const view in prev) {
          updated[view] = prev[view].map(l =>
            l.type === 'image' && (l as ImageLayer).isLogo
              ? { ...l, dataUrl: state.logo!.dataUrl }
              : l
          )
        }
        return updated
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Write to module-level SPA cache on every layer change so back-navigation restores state
  useEffect(() => {
    if (!hydrated.current) return
    _cachedLayersByView = layersByView
    setSaveStatus('saving')
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      setSaveStatus('saved')
      onStudioStateChange?.({ layersByView, garmentColor })
    }, 800)
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layersByView])

  // Keep garment color in sync with the cache and parent
  useEffect(() => {
    _cachedGarmentColor = garmentColor
    if (hydrated.current) onStudioStateChange?.({ layersByView, garmentColor })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [garmentColor])

  // Add artwork layer when parent passes a new image (from the asset panel upload)
  useEffect(() => {
    if (!pendingArtwork) return
    const id = crypto.randomUUID()
    snapshot()
    setLayers(ls => [...ls, { id, type: 'image', dataUrl: pendingArtwork, x: 60, y: 80, width: 160, height: 80, rotation: 0 }])
    setSelectedId(id)
    onArtworkConsumed?.()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingArtwork])

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
    const layer = layers.find(l => l.id === id)
    setSelectedId(id)
    if (layer) setLeftTab(layer.type === 'text' ? 'text' : 'logoart')
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

  // Drag the garment itself around the canvas (offset in artboard units)
  const startGarmentDrag = (e: React.MouseEvent | React.TouchEvent) => {
    e.stopPropagation()
    setSelectedId(null)
    setGarmentDragging(true)
    const start = 'touches' in e
      ? { x: e.touches[0].clientX, y: e.touches[0].clientY }
      : { x: e.clientX, y: e.clientY }
    const orig = { ...garmentOffset }
    const z = zoom / 100
    const onMove = (ev: MouseEvent | TouchEvent) => {
      if ('touches' in ev) ev.preventDefault()
      const p = getPoint(ev)
      setGarmentOffset({ x: orig.x + (p.x - start.x) / z, y: orig.y + (p.y - start.y) / z })
    }
    const onUp = () => {
      setGarmentDragging(false)
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
    setLeftTab('text')
  }

  // Select a layer and switch to the tab that controls it
  const selectLayer = (id: string) => {
    setSelectedId(id)
    const layer = layers.find(l => l.id === id)
    if (layer) setLeftTab(layer.type === 'text' ? 'text' : 'logoart')
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
    } catch (err) { console.error('Upload failed', err) }
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

  // Render the design (current view) to a PNG.
  //  - includeLayers: draw artwork/text layers on top of the garment
  //  - includeGarment: draw the garment itself
  //  - transparent: skip the white background fill (exports a cut-out PNG)
  const renderDesign = async (opts: {
    includeLayers?: boolean
    includeGarment?: boolean
    transparent?: boolean
  } = {}): Promise<string> => {
    const { includeLayers = true, includeGarment = true, transparent = false } = opts
    // Use the same cropped (padding-removed) source the canvas displays so the
    // download matches exactly what the user sees on screen.
    const garmentSrc = displaySrcs[activeEditorView] || garmentSrcForView(activeEditorView)
    if (!garmentSrc) return ''
    // Ensure custom fonts are loaded before rendering text
    for (const layer of layers) {
      if (layer.type === 'text') {
        const fw = (layer as TextLayer).fontWeight ?? 'bold'
        const fi = (layer as TextLayer).fontStyle ?? 'normal'
        try { await document.fonts.load(`${fi} ${fw} ${layer.fontSize}px "${layer.fontFamily}"`) } catch {}
      }
    }
    const W = 380, H = 460, SCALE = 2
    const canvas = document.createElement('canvas')
    canvas.width = W * SCALE; canvas.height = H * SCALE
    const ctx = canvas.getContext('2d')
    if (!ctx) return ''
    ctx.scale(SCALE, SCALE)
    if (!transparent) {
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, W, H)
    }

    const g = await loadImage(garmentSrc)
    const fit = Math.min(GARMENT_DISPLAY_W / g.width, GARMENT_DISPLAY_H / g.height) * (garmentScale / 100)
    const gw = g.width * fit, gh = g.height * fit
    const gx = (W - gw) / 2 + garmentOffset.x, gy = (H - gh) / 2 + garmentOffset.y

    if (includeGarment && garmentColor) {
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
      // Composite the tinted garment onto the main canvas
      ctx.drawImage(gc, 0, 0, gc.width, gc.height, gx, gy, gw, gh)
    } else if (includeGarment) {
      ctx.drawImage(g, gx, gy, gw, gh)
    }

    if (includeLayers) for (const layer of layers) {
      ctx.save()
      ctx.translate(layer.x + layer.width / 2, layer.y + layer.height / 2)
      ctx.rotate((layer.rotation * Math.PI) / 180)
      if (layer.type === 'text') {
        const tl = layer as TextLayer
        if (tl.archAmount) {
          const pngUrl = await archTextToDataUrl(tl, layer.width, layer.height)
          const img = await loadImage(pngUrl)
          ctx.drawImage(img, -layer.width / 2, -layer.height / 2, layer.width, layer.height)
        } else {
          const fw = tl.fontWeight ?? 'bold'
          const fi = tl.fontStyle ?? 'normal'
          ctx.font = `${fi} ${fw} ${layer.fontSize}px "${layer.fontFamily}"`
          ctx.textAlign = 'center'
          ctx.textBaseline = 'middle'
          const sw = tl.strokeWidth ?? 0
          if (sw > 0) {
            ctx.lineWidth = sw
            ctx.strokeStyle = tl.strokeColor ?? '#000000'
            ctx.lineJoin = 'round'
            ctx.strokeText(layer.text, 0, 0)
          }
          ctx.fillStyle = layer.color
          ctx.fillText(layer.text, 0, 0)
        }
      } else {
        const img = await loadImage(layer.dataUrl)
        const lf = Math.min(layer.width / img.width, layer.height / img.height)
        const iw = img.width * lf, ih = img.height * lf
        if (layer.tintColor) {
          const off = document.createElement('canvas')
          off.width = Math.ceil(iw); off.height = Math.ceil(ih)
          const offCtx = off.getContext('2d')!
          offCtx.drawImage(img, 0, 0, off.width, off.height)
          // Apply tint hue+saturation, keep luminosity, then restore alpha
          offCtx.globalCompositeOperation = 'color'
          offCtx.fillStyle = layer.tintColor
          offCtx.fillRect(0, 0, off.width, off.height)
          offCtx.globalCompositeOperation = 'destination-in'
          offCtx.drawImage(img, 0, 0, off.width, off.height)
          offCtx.globalCompositeOperation = 'source-over'
          ctx.drawImage(off, -iw / 2, -ih / 2, iw, ih)
        } else {
          ctx.drawImage(img, -iw / 2, -ih / 2, iw, ih)
        }
      }
      ctx.restore()
    }
    return canvas.toDataURL('image/png')
  }

  // White-background composite used for the AI preview pipeline
  const compositeDesign = () => renderDesign({})

  // Render a single layer to a tightly-cropped transparent PNG
  const renderLayerPng = async (layer: LogoLayer): Promise<string> => {
    const pad = 6
    const W = Math.ceil(layer.width) + pad * 2
    const H = Math.ceil(layer.height) + pad * 2
    const SCALE = 2
    const canvas = document.createElement('canvas')
    canvas.width = W * SCALE; canvas.height = H * SCALE
    const ctx = canvas.getContext('2d')
    if (!ctx) return ''
    ctx.scale(SCALE, SCALE)
    ctx.translate(W / 2, H / 2)
    ctx.rotate((layer.rotation * Math.PI) / 180)
    if (layer.type === 'text') {
      if (layer.archAmount) {
        const pngUrl = await archTextToDataUrl(layer, layer.width, layer.height)
        const img = await loadImage(pngUrl)
        ctx.drawImage(img, -layer.width / 2, -layer.height / 2, layer.width, layer.height)
      } else {
        const fw = layer.fontWeight ?? 'bold'
        const fi = layer.fontStyle ?? 'normal'
        try { await document.fonts.load(`${fi} ${fw} ${layer.fontSize}px "${layer.fontFamily}"`) } catch {}
        ctx.font = `${fi} ${fw} ${layer.fontSize}px "${layer.fontFamily}"`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        const sw = layer.strokeWidth ?? 0
        if (sw > 0) {
          ctx.lineWidth = sw
          ctx.strokeStyle = layer.strokeColor ?? '#000000'
          ctx.lineJoin = 'round'
          ctx.strokeText(layer.text, 0, 0)
        }
        ctx.fillStyle = layer.color
        ctx.fillText(layer.text, 0, 0)
      }
    } else {
      const img = await loadImage(layer.dataUrl)
      const lf = Math.min(layer.width / img.width, layer.height / img.height)
      const iw = img.width * lf, ih = img.height * lf
      if (layer.tintColor) {
        const off = document.createElement('canvas')
        off.width = Math.ceil(iw); off.height = Math.ceil(ih)
        const offCtx = off.getContext('2d')!
        offCtx.drawImage(img, 0, 0, off.width, off.height)
        offCtx.globalCompositeOperation = 'color'
        offCtx.fillStyle = layer.tintColor
        offCtx.fillRect(0, 0, off.width, off.height)
        offCtx.globalCompositeOperation = 'destination-in'
        offCtx.drawImage(img, 0, 0, off.width, off.height)
        ctx.drawImage(off, -iw / 2, -ih / 2, iw, ih)
      } else {
        ctx.drawImage(img, -iw / 2, -ih / 2, iw, ih)
      }
    }
    return cropPadding(canvas.toDataURL('image/png'))
  }

  // Collect every individual design asset as a transparent, cropped PNG
  const collectAssets = async (): Promise<{ name: string; dataUrl: string }[]> => {
    const assets: { name: string; dataUrl: string }[] = []
    // Full design (transparent cut-out)
    const full = await renderDesign({ transparent: true })
    if (full) assets.push({ name: `full-design-${activeEditorView}.png`, dataUrl: full })
    // Garment only (transparent, background stripped)
    let garment = await renderDesign({ includeLayers: false, transparent: true })
    if (garment) {
      try { garment = await removeWhiteBackground(garment) } catch {}
      garment = await cropPadding(garment)
      assets.push({ name: `garment-${activeEditorView}.png`, dataUrl: garment })
    }
    // Each layer — logos and artwork separately
    let artIdx = 0
    for (const layer of layers) {
      const png = await renderLayerPng(layer)
      if (!png) continue
      if (layer.type === 'image' && (layer as ImageLayer).isLogo) {
        assets.push({ name: 'logo.png', dataUrl: png })
      } else if (layer.type === 'text') {
        artIdx++
        assets.push({ name: `text-${artIdx}.png`, dataUrl: png })
      } else {
        artIdx++
        assets.push({ name: `artwork-${artIdx}.png`, dataUrl: png })
      }
    }
    // Fall back to the source logo if it isn't on the canvas as a layer
    if (!assets.some(a => a.name === 'logo.png') && state.logo?.dataUrl) {
      assets.push({ name: 'logo.png', dataUrl: state.logo.dataUrl })
    }
    return assets
  }

  const buildDesignAssets = async () => {
    const list = await collectAssets()
    const find = (pred: (n: string) => boolean) => list.find(a => pred(a.name))?.dataUrl
    return {
      full: find(n => n.startsWith('full-design')),
      garment: find(n => n.startsWith('garment')),
      logo: find(n => n === 'logo.png'),
      artworks: list.filter(a => a.name.startsWith('artwork') || a.name.startsWith('text')).map(a => a.dataUrl),
    }
  }

  const handleConfirm = async () => {
    let composite = ''
    try { composite = await compositeDesign() } catch (e) { console.error(e) }
    let assets
    try { assets = await buildDesignAssets() } catch (e) { console.error(e) }
    if (garmentColor && state.garment) onSetGarment({ ...state.garment, color: garmentColor })
    prefetchPreview(state, composite)
    onComplete({ confirmed: true, previewDataUrl: composite, assets })
  }

  const downloadAll = async () => {
    const assets = await collectAssets()
    if (assets.length) await downloadAssetsZip(assets, `grace-design-${activeEditorView}.zip`)
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

  // ─── Reusable control cards ────────────────────────────────────────────────
  const transformCard = (sel: LogoLayer) => (
    <div className="card">
      <p className="text-xs font-medium text-gray-600 mb-3">Scale &amp; Position</p>
      <div className="space-y-3">
        <ControlRow
          label="Scale"
          value={Math.round((sel.width / 160) * 100)}
          unit="%"
          onDecrement={() => updateSelected({ width: Math.max(40, sel.width - 10), height: Math.max(20, sel.height - 5) })}
          onIncrement={() => updateSelected({ width: sel.width + 10, height: sel.height + 5 })}
        />
        <div>
          <div className="flex justify-between items-center mb-1.5">
            <span className="text-xs text-gray-500">Rotate</span>
            <div className="flex items-center gap-1.5">
              <button onClick={() => updateSelected({ rotation: sel.rotation - 15 })} className="w-5 h-5 flex items-center justify-center rounded hover:bg-slate-100 text-gray-500 text-xs">−</button>
              <span className="text-xs text-gray-700 w-10 text-center">{sel.rotation}°</span>
              <button onClick={() => updateSelected({ rotation: sel.rotation + 15 })} className="w-5 h-5 flex items-center justify-center rounded hover:bg-slate-100 text-gray-500 text-xs">+</button>
            </div>
          </div>
          <input type="range" min={-180} max={180} value={sel.rotation}
            onChange={e => updateSelected({ rotation: parseInt(e.target.value) })}
            className="w-full accent-brand-green"/>
        </div>
        <div>
          <span className="text-xs text-gray-500 block mb-2">Position</span>
          <div className="grid grid-cols-3 gap-1">
            <div/>
            <button onClick={() => updateSelected({ y: sel.y - 10 })} className="btn-secondary py-1.5 flex items-center justify-center"><ChevronUp size={12}/></button>
            <div/>
            <button onClick={() => updateSelected({ x: sel.x - 10 })} className="btn-secondary py-1.5 flex items-center justify-center"><ArrowLeft size={12}/></button>
            <div className="w-6 h-6 rounded-full bg-slate-200 mx-auto self-center"/>
            <button onClick={() => updateSelected({ x: sel.x + 10 })} className="btn-secondary py-1.5 flex items-center justify-center"><ArrowRight size={12}/></button>
            <div/>
            <button onClick={() => updateSelected({ y: sel.y + 10 })} className="btn-secondary py-1.5 flex items-center justify-center"><ChevronDown size={12}/></button>
            <div/>
          </div>
        </div>
      </div>
    </div>
  )

  const layerControlsCard = () => (
    <div className="card">
      <p className="text-xs font-medium text-gray-600 mb-2">Layer Controls</p>
      <div className="grid grid-cols-2 gap-1.5">
        <button onClick={() => moveLayer('up')} className="btn-secondary flex items-center justify-center gap-1 text-xs py-2"><ChevronUp size={12}/> Bring Fwd</button>
        <button onClick={() => moveLayer('down')} className="btn-secondary flex items-center justify-center gap-1 text-xs py-2"><ChevronDown size={12}/> Send Bkwd</button>
        <button onClick={duplicateSelected} className="btn-secondary flex items-center justify-center gap-1 text-xs py-2"><Copy size={12}/> Duplicate</button>
        <button onClick={deleteSelected} className="flex items-center justify-center gap-1 text-xs py-2 rounded-lg bg-red-50 hover:bg-red-100 text-red-500 border border-red-200 transition-colors"><Trash2 size={12}/> Delete</button>
      </div>
    </div>
  )

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className={hideHeader ? (hideSidebar ? 'w-full' : 'px-6 pb-6 w-full') : 'p-6 w-full'}>
      {!hideHeader && (
        <div className="mb-5 flex items-start justify-between">
          <div>
            <p className="phase-header">Phase 2</p>
            <h1 className="text-xl font-bold text-gray-900">Apply Design to Garment</h1>
            <p className="text-gray-500 text-sm mt-1">Place artwork, text, and adjust the garment color</p>
          </div>
          <button onClick={onBack} className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-700 transition-colors mt-1">
            <ArrowLeft size={14}/> Back
          </button>
        </div>
      )}

      <div className={hideSidebar ? '' : 'grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-4'}>

        {/* ── Left panel ── */}
        {!hideSidebar && <div className="space-y-3">
          {/* Tab bar */}
          <div className="flex rounded-lg border border-slate-200 overflow-hidden">
            {([
              { id: 'logoart', label: 'Logo/Art', icon: <Upload  size={11}/> },
              { id: 'garment', label: 'Garment',  icon: <Palette size={11}/> },
              { id: 'text',    label: 'Text',     icon: <Type    size={11}/> },
            ] as const).map(tab => (
              <button key={tab.id} onClick={() => setLeftTab(tab.id)}
                className={`flex-1 flex items-center justify-center gap-1 py-2 text-[10px] font-semibold uppercase tracking-wider transition-colors ${
                  leftTab === tab.id ? 'bg-grace-ink text-white' : 'text-grace-stone hover:bg-grace-mist'
                }`}>
                {tab.icon} {tab.label}
              </button>
            ))}
          </div>

          {/* ── Logo / Art tab ── */}
          {leftTab === 'logoart' && (
            <>
              <div className="card space-y-3">
                <p className="text-xs font-medium text-gray-600">Logo &amp; Artwork</p>
                {state.logo ? (
                  <button
                    onClick={() => {
                      const id = crypto.randomUUID()
                      snapshot()
                      const newLayer: ImageLayer = { id, type: 'image', isLogo: true, dataUrl: state.logo!.dataUrl, x: 60, y: 80, width: 160, height: 80, rotation: 0 }
                      setLayers(ls => [...ls, newLayer])
                      setSelectedId(id)
                    }}
                    className="w-full bg-slate-50 hover:bg-slate-100 rounded-lg overflow-hidden transition-colors">
                    <div className="checkerboard rounded-t-lg" style={{ height: 64 }}>
                      <img src={state.logo.dataUrl} alt="logo" className="w-full h-full object-contain p-2"/>
                    </div>
                    <p className="text-[11px] text-gray-500 py-1.5 px-2 text-left">Add logo to canvas</p>
                  </button>
                ) : (
                  <p className="text-[11px] text-gray-400 leading-relaxed">Add a logo or upload artwork from the panel on the left, then select it here to recolor, scale, and position it.</p>
                )}
              </div>

              {selected?.type === 'image' ? (
                <>
                  {/* Recolor artwork */}
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
                  {transformCard(selected)}
                  {layerControlsCard()}
                </>
              ) : (
                <div className="card">
                  <div className="text-center py-6">
                    <Layers size={22} className="mx-auto text-gray-300 mb-2"/>
                    <p className="text-xs text-gray-400">Select a logo or artwork layer</p>
                    <p className="text-[11px] text-gray-300 mt-1">to recolor, scale &amp; position it</p>
                  </div>
                </div>
              )}
            </>
          )}

          {/* ── Garment tab ── */}
          {leftTab === 'garment' && (
            <>
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

              {state.garment && (
                <div className="card">
                  <div className="flex justify-between items-center mb-2">
                    <p className="text-xs font-medium text-gray-600">Garment Fit</p>
                    <span className="text-xs text-gray-700">{garmentScale}%</span>
                  </div>
                  <input type="range" min={25} max={200} value={garmentScale}
                    onChange={e => setGarmentScale(parseInt(e.target.value))}
                    className="w-full accent-brand-green"/>
                  <p className="text-[11px] text-gray-400 mt-2 leading-relaxed">Drag the garment on the canvas to reposition it.</p>
                  <button onClick={() => { setGarmentScale(100); setGarmentOffset({ x: 0, y: 0 }) }} className="mt-1.5 text-[11px] text-gray-400 hover:text-gray-700 transition-colors">
                    Reset size &amp; position
                  </button>
                </div>
              )}
            </>
          )}

          {/* ── Text tab ── */}
          {leftTab === 'text' && (
            <>
              <div className="card space-y-3">
                <p className="text-xs font-medium text-gray-600">Add Text</p>
                <button onClick={addTextLayer} className="btn-primary w-full flex items-center justify-center gap-2">
                  <Type size={13}/> Add Text Layer
                </button>
                <p className="text-[11px] text-gray-400 leading-relaxed">
                  Adds a draggable text layer. Select it to change font, size, color, and border.
                </p>
              </div>

              {selected?.type === 'text' ? (
                <>
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

                    {/* Bold / Italic */}
                    <div className="flex gap-1.5">
                      <button
                        onClick={() => updateSelected({ fontWeight: (selected as TextLayer).fontWeight === 'bold' ? 'normal' : 'bold' })}
                        className={`flex-1 py-1.5 rounded-lg border text-xs font-bold transition-all ${
                          (selected as TextLayer).fontWeight !== 'normal' ? 'bg-grace-ink text-white border-grace-ink' : 'border-slate-200 text-gray-600 hover:border-gray-400'
                        }`}
                      >B</button>
                      <button
                        onClick={() => updateSelected({ fontStyle: (selected as TextLayer).fontStyle === 'italic' ? 'normal' : 'italic' })}
                        className={`flex-1 py-1.5 rounded-lg border text-xs italic transition-all ${
                          (selected as TextLayer).fontStyle === 'italic' ? 'bg-grace-ink text-white border-grace-ink' : 'border-slate-200 text-gray-600 hover:border-gray-400'
                        }`}
                      >I</button>
                    </div>

                    <div>
                      <div className="flex justify-between items-center mb-1.5">
                        <span className="text-xs text-gray-500">Size</span>
                        <div className="flex items-center gap-1.5">
                          <button onClick={() => updateSelected({ fontSize: Math.max(8, (selected as TextLayer).fontSize - 2) })} className="w-5 h-5 flex items-center justify-center rounded hover:bg-slate-100 text-gray-500 text-xs">−</button>
                          <span className="text-xs text-gray-700 w-10 text-center">{(selected as TextLayer).fontSize}px</span>
                          <button onClick={() => updateSelected({ fontSize: Math.min(120, (selected as TextLayer).fontSize + 2) })} className="w-5 h-5 flex items-center justify-center rounded hover:bg-slate-100 text-gray-500 text-xs">+</button>
                        </div>
                      </div>
                    </div>

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

                    {/* Border / outline */}
                    <div>
                      <div className="flex justify-between items-center mb-1.5">
                        <span className="text-xs text-gray-500">Border</span>
                        <div className="flex items-center gap-1.5">
                          <button onClick={() => updateSelected({ strokeWidth: Math.max(0, ((selected as TextLayer).strokeWidth ?? 0) - 1) })} className="w-5 h-5 flex items-center justify-center rounded hover:bg-slate-100 text-gray-500 text-xs">−</button>
                          <span className="text-xs text-gray-700 w-10 text-center">{(selected as TextLayer).strokeWidth ?? 0}px</span>
                          <button onClick={() => updateSelected({ strokeWidth: Math.min(20, ((selected as TextLayer).strokeWidth ?? 0) + 1), strokeColor: (selected as TextLayer).strokeColor ?? '#000000' })} className="w-5 h-5 flex items-center justify-center rounded hover:bg-slate-100 text-gray-500 text-xs">+</button>
                        </div>
                      </div>
                      {((selected as TextLayer).strokeWidth ?? 0) > 0 && (
                        <div className="grid grid-cols-6 gap-1.5 mt-2">
                          {COLOR_SWATCHES.map(c => (
                            <button key={c} onClick={() => updateSelected({ strokeColor: c })}
                              style={{ backgroundColor: c }}
                              className={`aspect-square rounded border-2 transition-all ${(selected as TextLayer).strokeColor === c ? 'border-grace-ink scale-110' : 'border-transparent hover:border-slate-300'} ${c === '#FFFFFF' ? 'border-slate-200' : ''}`}
                            />
                          ))}
                        </div>
                      )}
                      {((selected as TextLayer).strokeWidth ?? 0) > 0 && (
                        <input type="color" value={(selected as TextLayer).strokeColor || '#000000'}
                          onChange={e => updateSelected({ strokeColor: e.target.value })}
                          className="w-full h-7 rounded cursor-pointer border border-slate-200 mt-2"/>
                      )}
                    </div>

                    {/* Arch */}
                    <div>
                      <div className="flex justify-between items-center mb-1.5">
                        <span className="text-xs text-gray-500">Arch</span>
                        <div className="flex items-center gap-1.5">
                          <button onClick={() => updateSelected({ archAmount: Math.max(-100, ((selected as TextLayer).archAmount ?? 0) - 10) })} className="w-5 h-5 flex items-center justify-center rounded hover:bg-slate-100 text-gray-500 text-xs">−</button>
                          <span className="text-xs text-gray-700 w-10 text-center">{(selected as TextLayer).archAmount ?? 0}</span>
                          <button onClick={() => updateSelected({ archAmount: Math.min(100, ((selected as TextLayer).archAmount ?? 0) + 10) })} className="w-5 h-5 flex items-center justify-center rounded hover:bg-slate-100 text-gray-500 text-xs">+</button>
                        </div>
                      </div>
                      <input type="range" min={-100} max={100} value={(selected as TextLayer).archAmount ?? 0}
                        onChange={e => updateSelected({ archAmount: parseInt(e.target.value) })}
                        className="w-full accent-brand-green"/>
                      <p className="text-[11px] text-gray-400 mt-1">Positive curves up, negative curves down.</p>
                    </div>
                  </div>
                  {transformCard(selected)}
                  {layerControlsCard()}
                </>
              ) : (
                <div className="card">
                  <div className="text-center py-6">
                    <Type size={22} className="mx-auto text-gray-300 mb-2"/>
                    <p className="text-xs text-gray-400">Select a text layer</p>
                    <p className="text-[11px] text-gray-300 mt-1">to edit font, color &amp; border</p>
                  </div>
                </div>
              )}
            </>
          )}

          {/* Layers list */}
          {layers.length > 0 && (
            <div className="card">
              <p className="text-xs font-medium text-gray-600 mb-2">Layers</p>
              <div className="space-y-1">
                {[...layers].reverse().map((layer, i) => (
                  <button key={layer.id} onClick={() => selectLayer(layer.id)}
                    className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs transition-colors ${
                      selectedId === layer.id ? 'bg-brand-green/10 text-gray-900' : 'hover:bg-slate-100 text-gray-500'
                    }`}>
                    {layer.type === 'text' ? <Type size={11}/> : <Layers size={11}/>}
                    <span className="truncate flex-1 text-left">
                      {layer.type === 'text' ? (layer.text.slice(0, 16) || 'Text') : ((layer as ImageLayer).isLogo ? 'Logo' : `Artwork ${layers.length - i}`)}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {garmentSrcForView(activeEditorView) && (
            <div className="card space-y-2">
              <p className="text-xs font-medium text-gray-600">Downloads</p>
              <p className="text-[11px] text-gray-400 leading-relaxed">Each file exports as a transparent PNG with the background removed.</p>
              <button onClick={async () => {
                const png = await renderDesign({ transparent: true })
                if (png) downloadDataUrl(png, `full-design-${activeEditorView}.png`)
              }} className="btn-secondary w-full flex items-center justify-center gap-2 text-xs">
                <Download size={13}/> Full Design
              </button>
              <button onClick={async () => {
                let png = await renderDesign({ includeLayers: false, transparent: true })
                if (!png) return
                try { png = await removeWhiteBackground(png) } catch {}
                png = await cropPadding(png)
                downloadDataUrl(png, `garment-${activeEditorView}.png`)
              }} className="btn-secondary w-full flex items-center justify-center gap-2 text-xs">
                <Download size={13}/> Garment Only
              </button>
              {layers.map((layer, i) => {
                const isLogo = layer.type === 'image' && (layer as ImageLayer).isLogo
                const label = isLogo ? 'Logo' : layer.type === 'text' ? `Text ${i + 1}` : `Artwork ${i + 1}`
                return (
                  <button key={layer.id} onClick={async () => {
                    const png = await renderLayerPng(layer)
                    if (png) downloadDataUrl(png, `${label.toLowerCase().replace(/\s+/g, '-')}.png`)
                  }} className="btn-secondary w-full flex items-center justify-center gap-2 text-xs">
                    <Download size={13}/> {label}
                  </button>
                )
              })}
              <button onClick={downloadAll} className="btn-primary w-full flex items-center justify-center gap-2 text-xs">
                <Download size={13}/> Download All (.zip)
              </button>
            </div>
          )}
        </div>}

        {/* ── Canvas ── */}
        <div className={`card p-0 overflow-hidden${hideSidebar ? ' h-full' : ''}`}>
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
                  style={{ transform: `translate(${garmentOffset.x}px, ${garmentOffset.y}px) scale(${garmentScale / 100})`, transformOrigin: 'center center' }}>
                  {/* isolation:isolate scopes mix-blend-mode to this container only */}
                  <div
                    onMouseDown={startGarmentDrag}
                    onTouchStart={startGarmentDrag}
                    style={{
                    position: 'relative', width: GARMENT_DISPLAY_W, height: GARMENT_DISPLAY_H, flexShrink: 0,
                    isolation: garmentColor ? 'isolate' : undefined,
                    pointerEvents: 'auto',
                    cursor: garmentDragging ? 'grabbing' : 'grab',
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
                    {/* Layer 3 — soft-light texture overlay: adds midtone depth, fabric
                        wrinkle highlights, fold contrast, and stitch/seam detail above the
                        color. Opacity ~0.5 keeps the selected color vibrant. Only rendered
                        when a garment color is active; does not affect the artwork layers
                        above (they live outside this isolated container). */}
                    {garmentColor && (
                      <img src={garmentDisplaySrc} alt="" aria-hidden draggable={false}
                        style={{
                          position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain',
                          mixBlendMode: 'soft-light',
                          opacity: 0.5,
                          pointerEvents: 'none',
                        } as React.CSSProperties}/>
                    )}
                    {/* Invisible spacer keeps the container at the right height */}
                    <div style={{ width: '100%', height: '100%' }}/>
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
                    (layer as TextLayer).archAmount ? (
                      <ArchTextPreview layer={layer as TextLayer} />
                    ) : (
                    <div style={{
                      width: '100%', height: '100%',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontFamily: `"${layer.fontFamily}", sans-serif`,
                      fontSize: layer.fontSize,
                      color: layer.color,
                      fontWeight: (layer as TextLayer).fontWeight ?? 'bold',
                      fontStyle: (layer as TextLayer).fontStyle ?? 'normal',
                      WebkitTextStrokeWidth: (layer as TextLayer).strokeWidth ? `${(layer as TextLayer).strokeWidth}px` : undefined,
                      WebkitTextStrokeColor: (layer as TextLayer).strokeColor ?? '#000000',
                      paintOrder: 'stroke fill',
                      whiteSpace: 'nowrap', overflow: 'hidden',
                      pointerEvents: 'none',
                    } as React.CSSProperties}>
                      {layer.text || 'Your Text'}
                    </div>
                    )
                  ) : (
                    <img
                      src={(layer.tintColor ? tintedDataUrls[`${layer.id}_${layer.tintColor}`] : undefined) ?? layer.dataUrl}
                      alt="artwork"
                      className="w-full h-full object-contain"
                      draggable={false}
                      style={{ pointerEvents: 'none' }}
                    />
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
