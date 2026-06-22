'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import {
  Undo2, Redo2, Minus, Plus, Upload, Layers, ArrowLeft, ArrowRight,
  Trash2, Copy, ChevronUp, ChevronDown, Check, Loader2, Download, Type, Palette, X, Save,
  Shirt, Image as ImageIcon, SlidersHorizontal, AlignCenter,
} from 'lucide-react'
import { AppState } from '@/app/page'
import { streamGenerate } from '@/lib/streamGenerate'
import { cacheGet, cacheSet, cacheKey } from '@/lib/generateCache'
import { removeWhiteBackground, removeBackgroundClean } from '@/lib/removeWhiteBg'
import { fileToDataUrl } from '@/lib/fileToDataUrl'
import { downloadDataUrl, downloadAssetsZip } from '@/lib/downloadAssets'
import GarmentAssetPanel from './GarmentAssetPanel'
import LogoAssetPanel from './LogoAssetPanel'
import AccordionSection from './AccordionSection'

// ─── Types ────────────────────────────────────────────────────────────────────

// CSS mix-blend-mode values exposed in the Studio. Preview-only realism control —
// never baked into exported production artwork (see collectAssets/renderLayerPng).
type BlendMode =
  | 'normal' | 'multiply' | 'screen' | 'overlay'
  | 'soft-light' | 'hard-light' | 'color-burn' | 'color-dodge'

interface BaseLayer {
  id: string
  x: number
  y: number
  width: number
  height: number
  rotation: number
  /** Editable layer property. Applied via CSS mix-blend-mode in the live preview only. */
  blendMode?: BlendMode
  /** Editable layer property, 0–100. Defaults to 100 when unset. */
  opacity?: number
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

const BLEND_MODES: { value: BlendMode; label: string }[] = [
  { value: 'normal',      label: 'Normal' },
  { value: 'multiply',    label: 'Multiply' },
  { value: 'screen',      label: 'Screen' },
  { value: 'overlay',     label: 'Overlay' },
  { value: 'soft-light',  label: 'Soft Light' },
  { value: 'hard-light',  label: 'Hard Light' },
  { value: 'color-burn',  label: 'Color Burn' },
  { value: 'color-dodge', label: 'Color Dodge' },
]

interface Props {
  state: AppState
  onComplete: (design: AppState['design']) => void
  onSetGarment: (garment: AppState['garment']) => void
  onLogoUpdate?: (logo: AppState['logo']) => void
  onBack: () => void
  hideHeader?: boolean
  pendingArtwork?: string | null
  onArtworkConsumed?: () => void
  onStudioStateChange?: (s: { layersByView: ViewLayers; garmentColor: string; logoGallery: string[]; artworkGallery: string[]; thumbnailDataUrl?: string }) => void
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

// Shared arch geometry so the on-screen preview (SVG) and the rasterized export
// (canvas) agree exactly. The sagitta (lift) scales up to nearly a full
// semicircle of the text's width at archAmount ±100 for an aggressive curve, and
// the render box grows vertically (RH) so deep arches are never clipped. The box
// is centered on the layer's center in both the DOM and the composite.
function archGeometry(layer: TextLayer) {
  const w = layer.width
  const h = layer.height
  const arch = layer.archAmount ?? 0
  const cap = layer.fontSize * 0.78
  const desc = layer.fontSize * 0.24
  // Aggressive: allow the sagitta to reach ~92% of the half-chord (near-semicircle).
  const maxLift = (w / 2) * 0.92
  const lift = Math.min(maxLift, Math.max(0, (Math.abs(arch) / 100) * maxLift))
  const r = lift > 0 ? (w * w / 4 + lift * lift) / (2 * lift) : 0
  // Intrinsic height needed to contain the full curve plus glyph asc/descent.
  // Independent of the current box height so the box can be sized to fit it
  // (see archBoxHeight) and the text never spills outside its bounds.
  const RH = lift + cap + desc + 4
  const baseY = arch > 0 ? RH - desc - 2 : cap + 2
  const cy = arch > 0 ? baseY - r : baseY + r
  return { w, h, cap, desc, arch, lift, r, RH, baseY, cy }
}

// The box height that fully contains a given arched text layer.
function archBoxHeight(layer: TextLayer): number {
  return Math.round(archGeometry(layer).RH)
}

// Rasterize arched text to a PNG using canvas arc-path drawing so page fonts apply.
async function archTextToDataUrl(layer: TextLayer, w: number, h: number): Promise<string> {
  const SCALE = 2
  const arch = layer.archAmount ?? 0
  const fw = layer.fontWeight ?? 'bold'
  const fi = layer.fontStyle ?? 'normal'
  const fontStr = `${fi} ${fw} ${layer.fontSize}px "${layer.fontFamily}"`
  try { await document.fonts.load(fontStr) } catch {}

  if (!arch) {
    const canvas = document.createElement('canvas')
    canvas.width = w * SCALE; canvas.height = h * SCALE
    const ctx = canvas.getContext('2d')!
    ctx.scale(SCALE, SCALE)
    ctx.font = fontStr
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    const sw = layer.strokeWidth ?? 0
    if (sw > 0) { ctx.lineWidth = sw * 2; ctx.strokeStyle = layer.strokeColor ?? '#000000'; ctx.lineJoin = 'round'; ctx.strokeText(layer.text, w / 2, h / 2) }
    ctx.fillStyle = layer.color; ctx.fillText(layer.text, w / 2, h / 2)
    return canvas.toDataURL('image/png')
  }

  const { RH, r, baseY, cy } = archGeometry(layer)
  const canvas = document.createElement('canvas')
  canvas.width = w * SCALE; canvas.height = RH * SCALE
  const ctx = canvas.getContext('2d')!
  ctx.scale(SCALE, SCALE)

  ctx.font = fontStr
  ctx.textAlign = 'center'
  ctx.textBaseline = 'alphabetic'
  const sw = layer.strokeWidth ?? 0

  const text = layer.text || 'Your Text'
  const totalWidth = ctx.measureText(text).width
  let cursor = -totalWidth / 2

  for (const char of text) {
    const cw = ctx.measureText(char).width
    const charCenter = cursor + cw / 2
    // angle along arc: 0 at midpoint of chord, positive = right
    const angle = Math.asin(Math.max(-1, Math.min(1, charCenter / r)))
    const finalAngle = arch > 0 ? -Math.PI / 2 + angle : Math.PI / 2 - angle
    const cx2 = w / 2 + r * Math.cos(finalAngle)
    const cy2 = cy + r * Math.sin(finalAngle)
    const rotate = arch > 0 ? angle : -angle

    ctx.save()
    ctx.translate(cx2, cy2)
    ctx.rotate(rotate)
    ctx.textAlign = 'center'
    ctx.textBaseline = 'alphabetic'
    if (sw > 0) { ctx.lineWidth = sw * 2; ctx.strokeStyle = layer.strokeColor ?? '#000000'; ctx.lineJoin = 'round'; ctx.strokeText(char, 0, 0) }
    ctx.fillStyle = layer.color; ctx.fillText(char, 0, 0)
    ctx.restore()
    cursor += cw
  }
  return canvas.toDataURL('image/png')
}

// ─── Component ────────────────────────────────────────────────────────────────

// Renders arched text as an INLINE SVG so the page's Google Fonts CSS applies.
// (An <img src={svgDataUrl}> runs sandboxed and cannot use @font-face from the
// parent page, causing every arched font to fall back to sans-serif.)
function ArchTextPreview({ layer }: { layer: TextLayer }) {
  const w = layer.width
  const h = layer.height
  const arch = layer.archAmount ?? 0
  const fw = layer.fontWeight ?? 'bold'
  const fi = layer.fontStyle ?? 'normal'
  const sw = layer.strokeWidth ?? 0
  const strokeProps = sw > 0 ? { stroke: layer.strokeColor ?? '#000000', strokeWidth: sw * 2, paintOrder: 'stroke fill' as const, strokeLinejoin: 'round' as const } : {}
  const textProps = { fontFamily: `"${layer.fontFamily}", sans-serif`, fontSize: layer.fontSize, fill: layer.color, fontWeight: fw, fontStyle: fi, ...strokeProps }

  if (!arch) {
    return (
      <svg xmlns="http://www.w3.org/2000/svg" width={w} height={h} style={{ width: '100%', height: '100%', pointerEvents: 'none' }}>
        <text x={w / 2} y={h / 2} textAnchor="middle" dominantBaseline="middle" {...textProps}>{layer.text || 'Your Text'}</text>
      </svg>
    )
  }

  const { RH, r, baseY } = archGeometry(layer)
  const sweep = arch > 0 ? 1 : 0
  const pathD = `M 0,${baseY} A ${r},${r} 0 0,${sweep} ${w},${baseY}`
  // Unique id per layer so multiple arched layers don't collide on "#ap".
  const pathId = `ap-${layer.id}`

  // Render the curve in a vertically-expanded box centered on the layer box so
  // deep arches aren't clipped and the preview matches the rasterized export.
  return (
    <div style={{ position: 'absolute', left: 0, top: (h - RH) / 2, width: w, height: RH, pointerEvents: 'none' }}>
      <svg xmlns="http://www.w3.org/2000/svg" width={w} height={RH} viewBox={`0 0 ${w} ${RH}`} overflow="visible" style={{ width: '100%', height: '100%', pointerEvents: 'none' }}>
        <defs><path id={pathId} d={pathD}/></defs>
        <text {...textProps} textAnchor="middle">
          <textPath href={`#${pathId}`} startOffset="50%">{layer.text || 'Your Text'}</textPath>
        </text>
      </svg>
    </div>
  )
}

// Compute a layer box that preserves an image's natural aspect ratio, scaled so
// its longest side is ~160px. Falls back to a square if dimensions can't load.
async function imageLayerBox(dataUrl: string, target = 160): Promise<{ width: number; height: number }> {
  try {
    const dims = await new Promise<{ w: number; h: number }>((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight })
      img.onerror = reject
      img.src = dataUrl
    })
    if (!dims.w || !dims.h) return { width: target, height: target }
    const scale = target / Math.max(dims.w, dims.h)
    return { width: Math.round(dims.w * scale), height: Math.round(dims.h * scale) }
  } catch {
    return { width: target, height: target }
  }
}

export default function Phase3Editor({ state, onComplete, onSetGarment, onLogoUpdate, onBack, hideHeader, pendingArtwork, onArtworkConsumed, onStudioStateChange }: Props) {
  const canvasRef = useRef<HTMLDivElement>(null)
  const [zoom, setZoom] = useState(100)
  const [garmentScale, setGarmentScale] = useState(100)
  const [garmentOffset, setGarmentOffset] = useState({ x: 0, y: 0 })
  const [garmentDragging, setGarmentDragging] = useState(false)
  const [garmentSelected, setGarmentSelected] = useState(false)
  // Restore garment color and layers — prefer persisted studioState (for project loads),
  // then fall back to the module-level SPA cache (for back-navigation within a session).
  const [garmentColor, setGarmentColor] = useState(
    state.studioState?.garmentColor ?? _cachedGarmentColor
  )
  const [leftTab, setLeftTab] = useState<'logoart' | 'garment' | 'text' | null>('garment')
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  // Mobile bottom sheet
  const [sheetExpanded, setSheetExpanded] = useState(false)
  const [mobileSection, setMobileSection] = useState<string | null>(null)
  const toggleMobileSection = (id: string) => setMobileSection(s => s === id ? null : id)
  const [localLogo, setLocalLogo] = useState<AppState['logo']>(state.logo)
  const artworkFileRef = useRef<HTMLInputElement>(null)

  // Galleries of available assets to drop on the canvas (support multiple of each).
  const [logoGallery, setLogoGallery] = useState<string[]>(
    state.studioState?.logoGallery ?? (state.logo?.dataUrl ? [state.logo.dataUrl] : [])
  )
  const [artworkGallery, setArtworkGallery] = useState<string[]>(
    state.studioState?.artworkGallery ?? []
  )

  const handleLogoUpdate = (logo: AppState['logo']) => {
    setLocalLogo(logo)
    onLogoUpdate?.(logo)
    if (logo?.dataUrl) setLogoGallery(g => g.includes(logo.dataUrl) ? g : [...g, logo.dataUrl])
  }

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
  // Refs for fresh values in async callbacks / debounced effects
  const layersByViewRef = useRef(layersByView)
  const garmentColorRef = useRef(garmentColor)
  const logoGalleryRef = useRef(logoGallery)
  const artworkGalleryRef = useRef(artworkGallery)
  const onStudioStateChangeRef = useRef(onStudioStateChange)
  // Always points at the latest renderDesign closure so async thumbnail captures
  // don't use a stale first-render snapshot with empty layers.
  const renderDesignRef = useRef<((opts?: { includeLayers?: boolean; includeGarment?: boolean; transparent?: boolean }) => Promise<string>) | null>(null)
  // Mirrors displaySrcs in a ref so renderDesign uses the cropped garment source
  // even when called from a memoized callback (avoids the padded fallback that
  // makes the garment render tiny relative to logo layers).
  const displaySrcsRef = useRef<Record<string, string>>({})
  // Last successfully rendered thumbnail — re-used on every emit so garmentColor/
  // gallery saves don't accidentally overwrite it with a bare-garment fallback.
  const lastThumbRef = useRef<string | undefined>(undefined)
  useEffect(() => { layersByViewRef.current = layersByView }, [layersByView])
  useEffect(() => { garmentColorRef.current = garmentColor }, [garmentColor])
  useEffect(() => { logoGalleryRef.current = logoGallery }, [logoGallery])
  useEffect(() => { artworkGalleryRef.current = artworkGallery }, [artworkGallery])
  useEffect(() => { onStudioStateChangeRef.current = onStudioStateChange }, [onStudioStateChange])

  // Bundle the full studio state from refs so every emit captures the latest values.
  // Always sends the last known thumbnail so garmentColor/gallery saves don't
  // overwrite a good thumbnail with a bare-garment fallback.
  const emitStudioState = useCallback((thumbnailDataUrl?: string) => {
    const thumb = thumbnailDataUrl ?? lastThumbRef.current
    onStudioStateChangeRef.current?.({
      layersByView: layersByViewRef.current,
      garmentColor: garmentColorRef.current,
      logoGallery: logoGalleryRef.current,
      artworkGallery: artworkGalleryRef.current,
      thumbnailDataUrl: thumb,
    })
  }, [])

  const emitStudioStateWithThumb = useCallback(async () => {
    try {
      const thumb = await renderDesignRef.current?.({})
      if (thumb) lastThumbRef.current = thumb
      emitStudioState(thumb || undefined)
    } catch {
      emitStudioState()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [emitStudioState])

  // Flush on unmount — the 800ms debounce cleanup would otherwise cancel the
  // save if the user navigates away before the timer fires.
  useEffect(() => {
    return () => {
      if (saveTimer.current) { clearTimeout(saveTimer.current); saveTimer.current = null }
      emitStudioState()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const croppedCache = useRef<Record<string, string>>({})
  const [displaySrcs, setDisplaySrcs] = useState<Record<string, string>>({})
  useEffect(() => { displaySrcsRef.current = displaySrcs }, [displaySrcs])
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
  // Uses source-atop to paint the tint color over all visible (non-transparent) pixels —
  // reliable on white, black, and colorful artwork unlike the 'color' blend mode which
  // fails on luminosity extremes (white stays white, black stays black).
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
        // Draw original (establishes the alpha mask)
        offCtx.drawImage(img, 0, 0)
        // Paint tint color over every visible pixel (source-atop respects existing alpha)
        offCtx.globalCompositeOperation = 'source-atop'
        offCtx.fillStyle = (layer as ImageLayer).tintColor!
        offCtx.fillRect(0, 0, off.width, off.height)
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

  // Write to module-level SPA cache on every layer change so back-navigation restores state.
  // Uses refs so the debounced callback always captures the latest values.
  useEffect(() => {
    if (!hydrated.current) return
    _cachedLayersByView = layersByView
    setSaveStatus('saving')
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      setSaveStatus('saved')
      emitStudioStateWithThumb()
    }, 800)
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layersByView])

  // Keep garment color in sync with the cache and parent
  useEffect(() => {
    _cachedGarmentColor = garmentColor
    if (hydrated.current) emitStudioState()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [garmentColor])

  // Persist gallery changes (new logo/artwork uploads)
  useEffect(() => {
    if (hydrated.current) emitStudioState()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [logoGallery, artworkGallery])

  // Add artwork layer when parent passes a new image (from the asset panel upload)
  useEffect(() => {
    if (!pendingArtwork) return
    const id = crypto.randomUUID()
    snapshot()
    setLayers(ls => [...ls, { id, type: 'image', dataUrl: pendingArtwork, x: 60, y: 80, width: 160, height: 80, rotation: 0, blendMode: 'multiply', opacity: 100 }])
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

  // Upload one or more artwork files into the gallery (multiple supported).
  const handleArtworkFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    if (!files.length) return
    e.target.value = ''
    for (const file of files) {
      try {
        let dataUrl = await fileToDataUrl(file)
        try { dataUrl = await removeBackgroundClean(dataUrl) } catch {}
        setArtworkGallery(g => g.includes(dataUrl) ? g : [...g, dataUrl])
      } catch (err) { console.error('Artwork upload failed', err) }
    }
  }

  // Drop a gallery asset onto the canvas as a new layer, sized to preserve the
  // image's natural aspect ratio (trimmed logos are no longer squashed to 160×80).
  const addAssetToCanvas = async (dataUrl: string, isLogo: boolean) => {
    const id = crypto.randomUUID()
    const { width, height } = await imageLayerBox(dataUrl)
    snapshot()
    setLayers(ls => [...ls, { id, type: 'image', dataUrl, isLogo, x: 60, y: 80, width, height, rotation: 0, blendMode: isLogo ? 'normal' : 'multiply', opacity: 100 }])
    setSelectedId(id)
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const updateSelected = (updates: Record<string, any>) => {
    if (!selectedId) return
    snapshot()
    setLayers(ls => ls.map(l => l.id === selectedId ? { ...l, ...updates } as LogoLayer : l))
  }

  // Set arch amount and grow/shrink the layer box so the curved text stays fully
  // contained — preventing the text from spilling outside its bounding box.
  const setArch = (amount: number) => {
    if (!selected || selected.type !== 'text') return
    const clamped = Math.max(-100, Math.min(100, amount))
    const probe = { ...(selected as TextLayer), archAmount: clamped }
    const newH = clamped === 0 ? Math.round(selected.fontSize * 1.6) : archBoxHeight(probe)
    const dy = (newH - selected.height) / 2
    // Keep the visual center fixed as the box grows by shifting y up by half the delta.
    updateSelected({ archAmount: clamped, height: newH, y: Math.round(selected.y - dy) })
  }

  // Drag handlers
  const handlePointerDown = (e: React.MouseEvent | React.TouchEvent, id: string) => {
    e.stopPropagation()
    setGarmentSelected(false)
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
    setGarmentSelected(true)
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

  // Scale the garment with the scroll wheel (replaces the Garment Fit slider).
  const handleGarmentWheel = (e: React.WheelEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const delta = e.deltaY < 0 ? 4 : -4
    setGarmentScale(s => Math.min(200, Math.max(25, s + delta)))
  }

  // Corner-handle resize for the garment — mirrors the logo layer startResize behavior.
  const startGarmentResize = (e: React.MouseEvent | React.TouchEvent) => {
    e.stopPropagation()
    e.preventDefault()
    const startPt = 'touches' in e
      ? { x: e.touches[0].clientX, y: e.touches[0].clientY }
      : { x: (e as React.MouseEvent).clientX, y: (e as React.MouseEvent).clientY }
    const origScale = garmentScale
    const z = zoom / 100
    const onMove = (ev: MouseEvent | TouchEvent) => {
      if ('touches' in ev) ev.preventDefault()
      const p = getPoint(ev)
      const dx = (p.x - startPt.x) / z
      const dy = (p.y - startPt.y) / z
      const delta = (Math.abs(dx) > Math.abs(dy) ? dx : dy)
      const next = Math.min(200, Math.max(25, origScale + delta * 0.4))
      setGarmentScale(next)
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
      try { dataUrl = await removeBackgroundClean(dataUrl) } catch {}
      const id = crypto.randomUUID()
      const { width, height } = await imageLayerBox(dataUrl)
      snapshot()
      setLayers(ls => [...ls, { id, type: 'image', dataUrl, x: 60, y: 80, width, height, rotation: 0, blendMode: 'normal', opacity: 100 }])
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
    // Use the cropped (padding-removed) garment source — same as the live canvas.
    // Read from the ref so this works correctly when called from memoized/async
    // contexts where the displaySrcs closure would be stale.
    const garmentSrc = displaySrcsRef.current[activeEditorView] || garmentSrcForView(activeEditorView)
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
      // Render each layer defensively — a single failing layer (e.g. a font/arch
      // edge case) must not abort the whole composite, which would leave the
      // thumbnail stuck on the previous (pre-edit) snapshot.
      try {
      ctx.save()
      ctx.translate(layer.x + layer.width / 2, layer.y + layer.height / 2)
      ctx.rotate((layer.rotation * Math.PI) / 180)
      if (layer.type === 'text') {
        const tl = layer as TextLayer
        if (tl.archAmount) {
          const pngUrl = await archTextToDataUrl(tl, layer.width, layer.height)
          const img = await loadImage(pngUrl)
          const { RH } = archGeometry(tl)
          ctx.drawImage(img, -layer.width / 2, -RH / 2, layer.width, RH)
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
          offCtx.globalCompositeOperation = 'source-atop'
          offCtx.fillStyle = layer.tintColor
          offCtx.fillRect(0, 0, off.width, off.height)
          offCtx.globalCompositeOperation = 'source-over'
          ctx.drawImage(off, -iw / 2, -ih / 2, iw, ih)
        } else {
          ctx.drawImage(img, -iw / 2, -ih / 2, iw, ih)
        }
      }
      ctx.restore()
      } catch (e) { console.error('layer render failed', e); try { ctx.restore() } catch {} }
    }
    return canvas.toDataURL('image/png')
  }

  // Keep the ref pointing at the current closure so async thumbnail captures use
  // the latest layers/garment color rather than a stale first-render snapshot.
  renderDesignRef.current = renderDesign

  // White-background composite used for the AI preview pipeline
  const compositeDesign = () => renderDesign({})

  // Render a single layer to a tightly-cropped transparent PNG
  const renderLayerPng = async (layer: LogoLayer): Promise<string> => {
    const pad = 6
    // Arched text needs the expanded render height so the curve isn't clipped.
    const layerH = (layer.type === 'text' && layer.archAmount)
      ? archGeometry(layer).RH
      : layer.height
    const W = Math.ceil(layer.width) + pad * 2
    const H = Math.ceil(layerH) + pad * 2
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
        const { RH } = archGeometry(layer)
        ctx.drawImage(img, -layer.width / 2, -RH / 2, layer.width, RH)
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
        offCtx.globalCompositeOperation = 'source-atop'
        offCtx.fillStyle = layer.tintColor
        offCtx.fillRect(0, 0, off.width, off.height)
        offCtx.globalCompositeOperation = 'source-over'
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

  // Explicit save — flushes the debounce and pushes the full studio snapshot to
  // the parent (which writes it to Supabase). Complements the 800ms autosave.
  const handleManualSave = async () => {
    if (saveTimer.current) { clearTimeout(saveTimer.current); saveTimer.current = null }
    setSaveStatus('saving')
    if (garmentColor && state.garment) onSetGarment({ ...state.garment, color: garmentColor })
    await emitStudioStateWithThumb()
    setSaveStatus('saved')
  }

  const handleConfirm = async () => {
    // Flush any pending debounced save so layers are persisted before phase advance
    if (saveTimer.current) { clearTimeout(saveTimer.current); saveTimer.current = null }
    emitStudioState()
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

  // Delete / Backspace removes the currently selected canvas layer, unless the
  // user is typing in a text field.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Delete' && e.key !== 'Backspace') return
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      if (!selectedId) return
      e.preventDefault()
      deleteSelected()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId])

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

  // Blend mode + opacity — editable, preview-only properties for image layers.
  const blendCard = (sel: ImageLayer) => (
    <div className="card space-y-3">
      <p className="text-xs font-medium text-gray-600">Blending</p>
      <div>
        <label className="text-xs text-gray-500 block mb-1.5">Blend Mode</label>
        <select
          value={sel.blendMode ?? 'normal'}
          onChange={e => updateSelected({ blendMode: e.target.value as BlendMode })}
          className="w-full text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white text-gray-700 focus:outline-none focus:border-grace-ink">
          {BLEND_MODES.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
        </select>
      </div>
      <div>
        <div className="flex justify-between items-center mb-1.5">
          <span className="text-xs text-gray-500">Opacity</span>
          <span className="text-xs text-gray-700 w-10 text-center tabular-nums">{sel.opacity ?? 100}%</span>
        </div>
        <input type="range" min={0} max={100} value={sel.opacity ?? 100}
          onChange={e => updateSelected({ opacity: parseInt(e.target.value) })}
          className="w-full accent-brand-green"/>
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
    <div className={hideHeader ? 'px-6 pb-6 w-full' : 'p-6 w-full'}>
      {!hideHeader && (
        <div className="mb-5 flex items-start justify-between">
          <div>
            <p className="phase-header">Phase 2</p>
            <h1 className="text-xl font-bold text-gray-900">Design Studio</h1>
            <p className="text-gray-500 text-sm mt-1">Select a garment, add your logo and artwork, style text</p>
          </div>
          <button onClick={onBack} className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-700 transition-colors mt-1">
            <ArrowLeft size={14}/> Back
          </button>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────────
          Main layout — responsive wrapper
          Mobile:  single column, canvas on top, accordion below
          Desktop: sidebar left + canvas right
      ───────────────────────────────────────────────────────────────────── */}
      <div className={`transition-all duration-300 ${sidebarCollapsed ? 'lg:grid lg:grid-cols-[1fr]' : 'lg:grid lg:grid-cols-[280px_1fr]'} lg:gap-4`}>

        {/* Desktop sidebar (hidden on mobile) */}
        <div className={`hidden lg:block space-y-3 transition-all duration-300 ${sidebarCollapsed ? 'lg:hidden' : ''}`}>
          {/* Tab bar — click the active tab again to collapse its panel */}
          <div className="flex rounded-lg border border-slate-200 overflow-hidden">
            {([
              { id: 'garment', label: 'Garment',  icon: <Palette size={11}/> },
              { id: 'logoart', label: 'Logo/Art', icon: <Upload  size={11}/> },
              { id: 'text',    label: 'Text',     icon: <Type    size={11}/> },
            ] as const).map(tab => (
              <button key={tab.id} onClick={() => setLeftTab(t => t === tab.id ? null : tab.id)}
                title={leftTab === tab.id ? 'Collapse' : tab.label}
                className={`flex-1 flex items-center justify-center gap-1 py-2 text-[10px] font-semibold uppercase tracking-wider transition-colors ${
                  leftTab === tab.id ? 'bg-grace-ink text-white' : 'text-grace-stone hover:bg-grace-mist'
                }`}>
                {tab.icon} {tab.label}
                {leftTab === tab.id && <ChevronUp size={11} className="ml-0.5"/>}
              </button>
            ))}
          </div>
          {/* ── Logo / Art tab ── */}
          {leftTab === 'logoart' && (
            <>
              <div className="card p-0 overflow-hidden">
                <div className="px-3 py-2 border-b border-slate-200">
                  <p className="text-[10px] font-bold tracking-[0.15em] text-gray-400 uppercase">Logo</p>
                </div>
                <LogoAssetPanel state={{ ...state, logo: localLogo }} onLogoUpdate={handleLogoUpdate} />
              </div>
              <div className="card space-y-2">
                <p className="text-xs font-medium text-gray-600">Artwork</p>
                <label className="flex items-center gap-2 w-full px-3 py-2.5 rounded-lg border border-dashed border-slate-300 hover:border-brand-green cursor-pointer transition-colors text-xs text-gray-500 hover:text-gray-700">
                  <Upload size={13}/> Upload Artwork
                  <input ref={artworkFileRef} type="file" multiple className="hidden"
                    accept="image/png,image/svg+xml,image/jpeg,image/webp" onChange={handleArtworkFile}/>
                </label>
              </div>
              <div className="card space-y-3">
                <p className="text-xs font-medium text-gray-600">Add to Canvas</p>
                {logoGallery.length === 0 && artworkGallery.length === 0 ? (
                  <p className="text-[11px] text-gray-400 leading-relaxed">Generate or upload a logo, or upload artwork above. Each appears here — click to place it on the canvas.</p>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    {logoGallery.map((src, i) => (
                      <AssetThumb key={`logo-${i}`} src={src} label="Logo"
                        onAdd={() => addAssetToCanvas(src, true)}
                        onRemove={() => setLogoGallery(g => g.filter(s => s !== src))}/>
                    ))}
                    {artworkGallery.map((src, i) => (
                      <AssetThumb key={`art-${i}`} src={src} label="Artwork"
                        onAdd={() => addAssetToCanvas(src, false)}
                        onRemove={() => setArtworkGallery(g => g.filter(s => s !== src))}/>
                    ))}
                  </div>
                )}
              </div>
              {selected?.type === 'image' ? (
                <>{transformCard(selected)}{blendCard(selected as ImageLayer)}{layerControlsCard()}</>
              ) : (
                <div className="card"><div className="text-center py-6">
                  <Layers size={22} className="mx-auto text-gray-300 mb-2"/>
                  <p className="text-xs text-gray-400">Select a logo or artwork layer</p>
                  <p className="text-[11px] text-gray-300 mt-1">to scale, position &amp; recolor it</p>
                </div></div>
              )}
            </>
          )}

          {/* ── Garment tab ── */}
          {leftTab === 'garment' && (
            <>
              <div className="card p-0 overflow-hidden">
                <div className="px-3 py-2 border-b border-slate-200">
                  <p className="text-[10px] font-bold tracking-[0.15em] text-gray-400 uppercase">Garment</p>
                </div>
                <GarmentAssetPanel route={state.route ?? 'apparel'} state={state} onSetGarment={onSetGarment} />
              </div>
              <div className="card space-y-3">
                <p className="text-xs font-medium text-gray-600">Garment Color</p>
                <div className="grid grid-cols-6 gap-1.5">
                  {GARMENT_COLORS.map(c => (
                    <button key={c} onClick={() => setGarmentColor(c === garmentColor ? '' : c)}
                      title={c} style={{ backgroundColor: c }}
                      className={`w-full aspect-square rounded border-2 transition-all ${garmentColor === c ? 'border-grace-ink scale-110' : 'border-transparent hover:border-slate-300'} ${c === '#FFFFFF' || c === '#F5F5F5' ? 'border-slate-200' : ''}`}
                    />
                  ))}
                  <label title="Custom color"
                    className="w-full aspect-square rounded border-2 border-dashed border-slate-300 hover:border-grace-ink transition-all cursor-pointer relative overflow-hidden flex items-center justify-center">
                    <Plus size={12} className="text-gray-400"/>
                    <input type="color" value={garmentColor || '#FFFFFF'} onChange={e => setGarmentColor(e.target.value)}
                      className="absolute inset-0 opacity-0 cursor-pointer"/>
                  </label>
                </div>
                {garmentColor && <button onClick={() => setGarmentColor('')} className="text-[11px] text-gray-400 hover:text-gray-700 transition-colors">Clear color</button>}
              </div>
              {selected?.type === 'image' && (
                <div className="card space-y-2">
                  <p className="text-xs font-medium text-gray-600">Recolor Artwork</p>
                  <div className="grid grid-cols-6 gap-1.5">
                    {COLOR_SWATCHES.map(c => (
                      <button key={c} onClick={() => updateSelected({ tintColor: (selected as ImageLayer).tintColor === c ? undefined : c })}
                        style={{ backgroundColor: c }}
                        className={`w-full aspect-square rounded border-2 transition-all ${(selected as ImageLayer).tintColor === c ? 'border-grace-ink scale-110' : 'border-transparent hover:border-slate-300'} ${c === '#FFFFFF' ? 'border-slate-200' : ''}`}
                      />
                    ))}
                    <label title="Custom color"
                      className="w-full aspect-square rounded border-2 border-dashed border-slate-300 hover:border-grace-ink transition-all cursor-pointer relative overflow-hidden flex items-center justify-center">
                      <Plus size={12} className="text-gray-400"/>
                      <input type="color" value={(selected as ImageLayer).tintColor || '#000000'}
                        onChange={e => updateSelected({ tintColor: e.target.value })}
                        className="absolute inset-0 opacity-0 cursor-pointer"/>
                    </label>
                  </div>
                  {(selected as ImageLayer).tintColor && <button onClick={() => updateSelected({ tintColor: undefined })} className="text-[11px] text-gray-400 hover:text-gray-700 transition-colors">Clear tint</button>}
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
                <p className="text-[11px] text-gray-400 leading-relaxed">Adds a draggable text layer. Select it to change font, size, color, and border.</p>
              </div>
              {selected?.type === 'text' ? (
                <>
                  <div className="card space-y-3">
                    <p className="text-xs font-medium text-gray-600">Text</p>
                    <textarea value={selected.text} onChange={e => updateSelected({ text: e.target.value })}
                      className="textarea-field text-sm resize-none" rows={2} placeholder="Your text here"/>
                    <div>
                      <p className="text-[11px] text-gray-500 mb-1.5">Font Library</p>
                      <div className="grid grid-cols-2 gap-1">
                        {FONT_LIBRARY.map(f => (
                          <button key={f.name} onClick={() => updateSelected({ fontFamily: f.name })}
                            style={{ fontFamily: `"${f.name}", sans-serif` }}
                            className={`px-2 py-1.5 rounded border text-xs truncate transition-all text-left ${(selected as TextLayer).fontFamily === f.name ? 'border-grace-ink bg-grace-ink text-white' : 'border-slate-200 hover:border-slate-300 text-gray-700'}`}>
                            {f.label}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="flex gap-1.5">
                      <button onClick={() => updateSelected({ fontWeight: (selected as TextLayer).fontWeight === 'bold' ? 'normal' : 'bold' })}
                        className={`flex-1 py-1.5 rounded-lg border text-xs font-bold transition-all ${(selected as TextLayer).fontWeight !== 'normal' ? 'bg-grace-ink text-white border-grace-ink' : 'border-slate-200 text-gray-600 hover:border-gray-400'}`}>B</button>
                      <button onClick={() => updateSelected({ fontStyle: (selected as TextLayer).fontStyle === 'italic' ? 'normal' : 'italic' })}
                        className={`flex-1 py-1.5 rounded-lg border text-xs italic transition-all ${(selected as TextLayer).fontStyle === 'italic' ? 'bg-grace-ink text-white border-grace-ink' : 'border-slate-200 text-gray-600 hover:border-gray-400'}`}>I</button>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-gray-500">Size</span>
                      <div className="flex items-center gap-1.5">
                        <button onClick={() => updateSelected({ fontSize: Math.max(8, (selected as TextLayer).fontSize - 2) })} className="w-5 h-5 flex items-center justify-center rounded hover:bg-slate-100 text-gray-500 text-xs">−</button>
                        <span className="text-xs text-gray-700 w-10 text-center">{(selected as TextLayer).fontSize}px</span>
                        <button onClick={() => updateSelected({ fontSize: Math.min(120, (selected as TextLayer).fontSize + 2) })} className="w-5 h-5 flex items-center justify-center rounded hover:bg-slate-100 text-gray-500 text-xs">+</button>
                      </div>
                    </div>
                    <div>
                      <p className="text-[11px] text-gray-500 mb-1.5">Color</p>
                      <div className="grid grid-cols-6 gap-1.5 mb-2">
                        {COLOR_SWATCHES.map(c => (
                          <button key={c} onClick={() => updateSelected({ color: c })}
                            style={{ backgroundColor: c }}
                            className={`aspect-square rounded border-2 transition-all ${(selected as TextLayer).color === c ? 'border-grace-ink scale-110' : 'border-transparent hover:border-slate-300'} ${c === '#FFFFFF' ? 'border-slate-200' : ''}`}/>
                        ))}
                      </div>
                      <input type="color" value={(selected as TextLayer).color} onChange={e => updateSelected({ color: e.target.value })} className="w-full h-7 rounded cursor-pointer border border-slate-200"/>
                    </div>
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
                        <>
                          <div className="grid grid-cols-6 gap-1.5 mt-2">
                            {COLOR_SWATCHES.map(c => (
                              <button key={c} onClick={() => updateSelected({ strokeColor: c })}
                                style={{ backgroundColor: c }}
                                className={`aspect-square rounded border-2 transition-all ${(selected as TextLayer).strokeColor === c ? 'border-grace-ink scale-110' : 'border-transparent hover:border-slate-300'} ${c === '#FFFFFF' ? 'border-slate-200' : ''}`}/>
                            ))}
                          </div>
                          <input type="color" value={(selected as TextLayer).strokeColor || '#000000'}
                            onChange={e => updateSelected({ strokeColor: e.target.value })}
                            className="w-full h-7 rounded cursor-pointer border border-slate-200 mt-2"/>
                        </>
                      )}
                    </div>
                    <div>
                      <div className="flex justify-between items-center mb-1.5">
                        <span className="text-xs text-gray-500">Arch</span>
                        <div className="flex items-center gap-1.5">
                          <button onClick={() => setArch(((selected as TextLayer).archAmount ?? 0) - 10)} className="w-5 h-5 flex items-center justify-center rounded hover:bg-slate-100 text-gray-500 text-xs">−</button>
                          <span className="text-xs text-gray-700 w-10 text-center">{(selected as TextLayer).archAmount ?? 0}</span>
                          <button onClick={() => setArch(((selected as TextLayer).archAmount ?? 0) + 10)} className="w-5 h-5 flex items-center justify-center rounded hover:bg-slate-100 text-gray-500 text-xs">+</button>
                        </div>
                      </div>
                      <input type="range" min={-100} max={100} value={(selected as TextLayer).archAmount ?? 0}
                        onChange={e => setArch(parseInt(e.target.value))} className="w-full accent-brand-green"/>
                      <p className="text-[11px] text-gray-400 mt-1">Positive curves up, negative curves down.</p>
                    </div>
                  </div>
                  {transformCard(selected)}
                  {layerControlsCard()}
                </>
              ) : (
                <div className="card"><div className="text-center py-6">
                  <Type size={22} className="mx-auto text-gray-300 mb-2"/>
                  <p className="text-xs text-gray-400">Select a text layer</p>
                  <p className="text-[11px] text-gray-300 mt-1">to edit font, color &amp; border</p>
                </div></div>
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
                    className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs transition-colors ${selectedId === layer.id ? 'bg-brand-green/10 text-gray-900' : 'hover:bg-slate-100 text-gray-500'}`}>
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
        </div>

        {/* Canvas — always visible on both mobile and desktop */}
        <div className="card p-0 overflow-hidden">
          {/* Toolbar — desktop only (mobile actions live in the bottom sheet) */}
          <div className="hidden lg:flex items-center justify-between px-4 py-2.5 border-b border-slate-200 gap-2">
            <div className="flex items-center gap-1">
              <button onClick={() => setSidebarCollapsed(c => !c)}
                title={sidebarCollapsed ? 'Show panel' : 'Hide panel'}
                className="p-1.5 rounded hover:bg-slate-100 text-gray-400 hover:text-gray-700 transition-colors mr-1">
                {sidebarCollapsed ? <ArrowRight size={14}/> : <ArrowLeft size={14}/>}
              </button>
              <button onClick={undo} disabled={past.length === 0} title="Undo"
                className="p-1.5 rounded hover:bg-slate-100 text-gray-400 hover:text-gray-700 transition-colors disabled:opacity-30">
                <Undo2 size={14}/>
              </button>
              <button onClick={redo} disabled={future.length === 0} title="Redo"
                className="p-1.5 rounded hover:bg-slate-100 text-gray-400 hover:text-gray-700 transition-colors disabled:opacity-30">
                <Redo2 size={14}/>
              </button>
              {availableViews.length > 1 && (
                <div className="flex items-center gap-1 ml-3 border-l border-slate-200 pl-3">
                  {availableViews.map(v => (
                    <button key={v} onClick={() => { setActiveEditorView(v); setSelectedId(null) }}
                      className={`px-2.5 py-1 rounded-md text-[11px] font-medium capitalize transition-colors ${activeEditorView === v ? 'bg-grace-ink text-white' : 'text-gray-500 hover:bg-slate-100'}`}>
                      {v}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <button onClick={() => setZoom(z => Math.max(25, z - 25))} className="p-1 rounded hover:bg-slate-100 hover:text-gray-700 transition-colors"><Minus size={12}/></button>
              <span className="w-12 text-center">{zoom}%</span>
              <button onClick={() => setZoom(z => Math.min(200, z + 25))} className="p-1 rounded hover:bg-slate-100 hover:text-gray-700 transition-colors"><Plus size={12}/></button>
            </div>
            <div className="flex items-center gap-2.5">
              <span className="text-[11px] text-gray-400 flex items-center gap-1">
                {saveStatus === 'saving' && <><Loader2 size={11} className="animate-spin"/> Saving…</>}
                {saveStatus === 'saved'  && <><Check   size={11} className="text-brand-green"/> Saved</>}
              </span>
              <button onClick={handleManualSave} className="btn-secondary flex items-center gap-1.5">
                <Save size={13}/> Save
              </button>
              <button onClick={handleConfirm} className="btn-primary flex items-center gap-1.5">
                Confirm Design <ArrowRight size={13}/>
              </button>
            </div>
          </div>

          {/* Mobile mini-toolbar: undo/redo + view tabs */}
          <div className="lg:hidden flex items-center justify-between px-3 py-2 border-b border-slate-100 bg-white/80 backdrop-blur-sm">
            <div className="flex items-center gap-0.5">
              <button onClick={undo} disabled={past.length === 0} title="Undo"
                className="p-2 rounded-lg hover:bg-slate-100 text-gray-500 disabled:opacity-30 active:bg-slate-200">
                <Undo2 size={16}/>
              </button>
              <button onClick={redo} disabled={future.length === 0} title="Redo"
                className="p-2 rounded-lg hover:bg-slate-100 text-gray-500 disabled:opacity-30 active:bg-slate-200">
                <Redo2 size={16}/>
              </button>
            </div>
            {availableViews.length > 1 && (
              <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-0.5">
                {availableViews.map(v => (
                  <button key={v} onClick={() => { setActiveEditorView(v); setSelectedId(null) }}
                    className={`px-3 py-1.5 rounded-md text-xs font-medium capitalize transition-colors ${activeEditorView === v ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}>
                    {v}
                  </button>
                ))}
              </div>
            )}
            <div className="flex items-center gap-1 text-xs text-gray-500">
              <button onClick={() => setZoom(z => Math.max(50, z - 25))} className="p-2 rounded-lg hover:bg-slate-100 text-gray-500 active:bg-slate-200"><Minus size={14}/></button>
              <span className="w-10 text-center text-xs">{zoom}%</span>
              <button onClick={() => setZoom(z => Math.min(200, z + 25))} className="p-2 rounded-lg hover:bg-slate-100 text-gray-500 active:bg-slate-200"><Plus size={14}/></button>
            </div>
          </div>

          {/* Canvas area */}
          <div ref={canvasRef}
            className="relative bg-white overflow-hidden flex items-center justify-center"
            style={{ minHeight: 'calc(100svh - 160px)' }}
            onClick={e => { if (e.target === e.currentTarget) { setSelectedId(null); setGarmentSelected(false) } }}>
            <div style={{ transform: `scale(${zoom / 100})`, transformOrigin: 'center center', position: 'relative', width: 380, height: 460 }}>
              {/* Garment */}
              {(() => {
                const garmentDisplaySrc = displaySrcs[activeEditorView] || garmentSrcForView(activeEditorView)
                return garmentSrcForView(activeEditorView) ? (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none"
                  style={{ transform: `translate(${garmentOffset.x}px, ${garmentOffset.y}px) scale(${garmentScale / 100})`, transformOrigin: 'center center' }}>
                  <div onMouseDown={startGarmentDrag} onTouchStart={startGarmentDrag} onWheel={handleGarmentWheel}
                    style={{ position: 'relative', width: GARMENT_DISPLAY_W, height: GARMENT_DISPLAY_H, flexShrink: 0, isolation: garmentColor ? 'isolate' : undefined, pointerEvents: 'auto', cursor: garmentDragging ? 'grabbing' : 'grab', outline: garmentSelected ? '2px solid #0A0A0A' : 'none', outlineOffset: 2 }}>
                    {garmentColor && (
                      <div style={{ position: 'absolute', inset: 0, backgroundColor: garmentColor, WebkitMaskImage: `url("${garmentDisplaySrc}")`, WebkitMaskSize: 'contain', WebkitMaskRepeat: 'no-repeat', WebkitMaskPosition: 'center', maskImage: `url("${garmentDisplaySrc}")`, maskSize: 'contain', maskRepeat: 'no-repeat', maskPosition: 'center', pointerEvents: 'none' } as React.CSSProperties}/>
                    )}
                    <img src={garmentDisplaySrc} alt="garment" draggable={false}
                      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain', mixBlendMode: garmentColor ? 'multiply' : 'normal', pointerEvents: 'none' } as React.CSSProperties}/>
                    {garmentColor && (
                      <img src={garmentDisplaySrc} alt="" aria-hidden draggable={false}
                        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain', mixBlendMode: 'soft-light', opacity: 0.5, pointerEvents: 'none' } as React.CSSProperties}/>
                    )}
                    <div style={{ width: '100%', height: '100%' }}/>
                    {garmentSelected && ([
                      { cursor: 'nw-resize', top: -4, left: -4 },
                      { cursor: 'ne-resize', top: -4, right: -4 },
                      { cursor: 'sw-resize', bottom: -4, left: -4 },
                      { cursor: 'se-resize', bottom: -4, right: -4 },
                    ] as const).map((handle, i) => (
                      <div key={i}
                        style={{ position: 'absolute', width: 18, height: 18, background: 'white', border: '2px solid #0A0A0A', borderRadius: 3, touchAction: 'none', zIndex: 10, ...handle }}
                        onMouseDown={startGarmentResize}
                        onTouchStart={startGarmentResize}
                      />
                    ))}
                  </div>
                </div>
                ) : null
              })()}
              {!garmentSrcForView(activeEditorView) && state.garment?.svg && (
                <div className="absolute inset-0 pointer-events-none"
                  style={{ transform: `scale(${garmentScale / 100})`, transformOrigin: 'center center' }}
                  dangerouslySetInnerHTML={{ __html: state.garment.svg }}
                />
              )}
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
                  style={{ position: 'absolute', left: layer.x, top: layer.y, width: layer.width, height: layer.height, transform: `rotate(${layer.rotation}deg)`, cursor: dragging?.id === layer.id ? 'grabbing' : 'grab', outline: selectedId === layer.id ? '2px solid #0A0A0A' : 'none', outlineOffset: 2, userSelect: 'none', touchAction: 'none' }}>
                  {layer.type === 'text' ? (
                    (layer as TextLayer).archAmount ? (
                      <ArchTextPreview layer={layer as TextLayer} />
                    ) : (
                    <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: `"${layer.fontFamily}", sans-serif`, fontSize: layer.fontSize, color: layer.color, fontWeight: (layer as TextLayer).fontWeight ?? 'bold', fontStyle: (layer as TextLayer).fontStyle ?? 'normal', WebkitTextStrokeWidth: (layer as TextLayer).strokeWidth ? `${(layer as TextLayer).strokeWidth}px` : undefined, WebkitTextStrokeColor: (layer as TextLayer).strokeColor ?? '#000000', paintOrder: 'stroke fill', whiteSpace: 'nowrap', overflow: 'hidden', pointerEvents: 'none' } as React.CSSProperties}>
                      {layer.text || 'Your Text'}
                    </div>
                    )
                  ) : (
                    <img src={(layer.tintColor ? tintedDataUrls[`${layer.id}_${layer.tintColor}`] : undefined) ?? layer.dataUrl} alt="artwork" className="w-full h-full object-contain" draggable={false} style={{ pointerEvents: 'none', mixBlendMode: (layer.blendMode ?? 'normal') as React.CSSProperties['mixBlendMode'], opacity: (layer.opacity ?? 100) / 100 }}/>
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

      </div>{/* end main layout */}

      {/* ─────────────────────────────────────────────────────────────────────
          Mobile bottom sheet (hidden on desktop lg+)
      ───────────────────────────────────────────────────────────────────── */}
      <div className="lg:hidden fixed bottom-0 left-0 right-0 z-30 flex flex-col"
        style={{ maxHeight: '72vh', transform: sheetExpanded ? 'translateY(0)' : 'translateY(calc(100% - 56px))', transition: 'transform 0.35s cubic-bezier(0.32,0.72,0,1)' }}>

        {/* Sheet card */}
        <div className="flex flex-col bg-white rounded-t-2xl shadow-[0_-4px_24px_rgba(0,0,0,0.12)] overflow-hidden" style={{ maxHeight: '72vh' }}>

          {/* Drag handle + parent header */}
          <button type="button" onClick={() => setSheetExpanded(e => !e)}
            className="flex-shrink-0 flex flex-col items-center pt-2 pb-0 w-full focus:outline-none">
            <div className="w-10 h-1 rounded-full bg-slate-300 mb-2"/>
            <div className="w-full flex items-center justify-between px-4 py-3">
              <div className="flex items-center gap-2">
                <SlidersHorizontal size={16} className="text-gray-500"/>
                <span className="text-sm font-semibold text-gray-900">Customize Garment</span>
              </div>
              <ChevronDown size={16} className={`text-gray-400 transition-transform duration-300 ${sheetExpanded ? 'rotate-180' : ''}`}/>
            </div>
          </button>

          {/* Scrollable child sections */}
          <div className="overflow-y-auto overscroll-contain flex-1 divide-y divide-slate-100">

            <AccordionSection title="Garment Source" icon={<Shirt size={16}/>}
              isOpen={mobileSection === 'garment-source'} onToggle={() => toggleMobileSection('garment-source')}>
              <GarmentAssetPanel route={state.route ?? 'apparel'} state={state} onSetGarment={onSetGarment} />
            </AccordionSection>

            <AccordionSection title="Garment Colors" icon={<Palette size={16}/>}
              isOpen={mobileSection === 'garment-colors'} onToggle={() => toggleMobileSection('garment-colors')}>
              <div className="space-y-3">
                <div className="grid grid-cols-6 gap-1.5">
                  {GARMENT_COLORS.map(c => (
                    <button key={c} onClick={() => setGarmentColor(c === garmentColor ? '' : c)}
                      title={c} style={{ backgroundColor: c }}
                      className={`w-full aspect-square rounded border-2 transition-all ${garmentColor === c ? 'border-grace-ink scale-110' : 'border-transparent hover:border-slate-300'} ${c === '#FFFFFF' || c === '#F5F5F5' ? 'border-slate-200' : ''}`}
                    />
                  ))}
                  <label title="Custom color"
                    className="w-full aspect-square rounded border-2 border-dashed border-slate-300 hover:border-grace-ink transition-all cursor-pointer relative overflow-hidden flex items-center justify-center">
                    <Plus size={12} className="text-gray-400"/>
                    <input type="color" value={garmentColor || '#FFFFFF'} onChange={e => setGarmentColor(e.target.value)}
                      className="absolute inset-0 opacity-0 cursor-pointer"/>
                  </label>
                </div>
                {garmentColor && <button onClick={() => setGarmentColor('')} className="text-xs text-gray-400 hover:text-gray-700 transition-colors">Clear color</button>}
              </div>
            </AccordionSection>

            <AccordionSection title="Logo Placement" icon={<AlignCenter size={16}/>}
              isOpen={mobileSection === 'logo'} onToggle={() => toggleMobileSection('logo')}>
              <LogoAssetPanel state={{ ...state, logo: localLogo }} onLogoUpdate={handleLogoUpdate} />
            </AccordionSection>

            <AccordionSection title="Artwork" icon={<ImageIcon size={16}/>}
              badge={artworkGallery.length || undefined}
              isOpen={mobileSection === 'artwork'} onToggle={() => toggleMobileSection('artwork')}>
              <div className="space-y-3">
                <label className="flex items-center gap-2 w-full px-3 py-2.5 rounded-lg border border-dashed border-slate-300 hover:border-brand-green cursor-pointer transition-colors text-xs text-gray-500">
                  <Upload size={13}/> Upload Artwork
                  <input ref={artworkFileRef} type="file" multiple className="hidden"
                    accept="image/png,image/svg+xml,image/jpeg,image/webp" onChange={handleArtworkFile}/>
                </label>
                {(logoGallery.length > 0 || artworkGallery.length > 0) && (
                  <div className="grid grid-cols-3 gap-2">
                    {logoGallery.map((src, i) => (
                      <AssetThumb key={`logo-${i}`} src={src} label="Logo"
                        onAdd={() => addAssetToCanvas(src, true)}
                        onRemove={() => setLogoGallery(g => g.filter(s => s !== src))}/>
                    ))}
                    {artworkGallery.map((src, i) => (
                      <AssetThumb key={`art-${i}`} src={src} label="Artwork"
                        onAdd={() => addAssetToCanvas(src, false)}
                        onRemove={() => setArtworkGallery(g => g.filter(s => s !== src))}/>
                    ))}
                  </div>
                )}
                {selected?.type === 'image' && (
                  <div className="space-y-2 pt-1 border-t border-slate-100">
                    <p className="text-xs font-medium text-gray-600">Recolor Selected</p>
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
                    {(selected as ImageLayer).tintColor && <button onClick={() => updateSelected({ tintColor: undefined })} className="text-xs text-gray-400 hover:text-gray-700 transition-colors">Clear tint</button>}
                    <div className="pt-2">
                      <label className="text-xs text-gray-500 block mb-1.5">Blend Mode</label>
                      <select
                        value={(selected as ImageLayer).blendMode ?? 'normal'}
                        onChange={e => updateSelected({ blendMode: e.target.value as BlendMode })}
                        className="w-full text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white text-gray-700 focus:outline-none focus:border-grace-ink">
                        {BLEND_MODES.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                      </select>
                    </div>
                    <div className="pt-1">
                      <div className="flex justify-between items-center mb-1.5">
                        <span className="text-xs text-gray-500">Opacity</span>
                        <span className="text-xs text-gray-700 w-10 text-center tabular-nums">{(selected as ImageLayer).opacity ?? 100}%</span>
                      </div>
                      <input type="range" min={0} max={100} value={(selected as ImageLayer).opacity ?? 100}
                        onChange={e => updateSelected({ opacity: parseInt(e.target.value) })}
                        className="w-full accent-brand-green"/>
                    </div>
                  </div>
                )}
              </div>
            </AccordionSection>

            <AccordionSection title="Text" icon={<Type size={16}/>}
              badge={layers.filter(l => l.type === 'text').length || undefined}
              isOpen={mobileSection === 'text'} onToggle={() => toggleMobileSection('text')}>
              <div className="space-y-3">
                <button onClick={addTextLayer} className="btn-primary w-full flex items-center justify-center gap-2 text-sm">
                  <Type size={13}/> Add Text Layer
                </button>
                {selected?.type === 'text' && (
                  <>
                    <textarea value={selected.text} onChange={e => updateSelected({ text: e.target.value })}
                      className="textarea-field text-sm resize-none" rows={2} placeholder="Your text here"/>
                    <div className="grid grid-cols-2 gap-1">
                      {FONT_LIBRARY.map(f => (
                        <button key={f.name} onClick={() => updateSelected({ fontFamily: f.name })}
                          style={{ fontFamily: `"${f.name}", sans-serif` }}
                          className={`px-2 py-1.5 rounded border text-xs truncate transition-all text-left ${(selected as TextLayer).fontFamily === f.name ? 'border-grace-ink bg-grace-ink text-white' : 'border-slate-200 text-gray-700'}`}>
                          {f.label}
                        </button>
                      ))}
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => updateSelected({ fontWeight: (selected as TextLayer).fontWeight === 'bold' ? 'normal' : 'bold' })}
                        className={`flex-1 py-2 rounded-lg border text-sm font-bold transition-all ${(selected as TextLayer).fontWeight !== 'normal' ? 'bg-grace-ink text-white border-grace-ink' : 'border-slate-200 text-gray-600'}`}>B</button>
                      <button onClick={() => updateSelected({ fontStyle: (selected as TextLayer).fontStyle === 'italic' ? 'normal' : 'italic' })}
                        className={`flex-1 py-2 rounded-lg border text-sm italic transition-all ${(selected as TextLayer).fontStyle === 'italic' ? 'bg-grace-ink text-white border-grace-ink' : 'border-slate-200 text-gray-600'}`}>I</button>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-gray-500">Size</span>
                      <div className="flex items-center gap-2">
                        <button onClick={() => updateSelected({ fontSize: Math.max(8, (selected as TextLayer).fontSize - 2) })} className="w-7 h-7 flex items-center justify-center rounded-lg border border-slate-200 text-gray-600 text-sm">−</button>
                        <span className="text-sm text-gray-700 w-12 text-center">{(selected as TextLayer).fontSize}px</span>
                        <button onClick={() => updateSelected({ fontSize: Math.min(120, (selected as TextLayer).fontSize + 2) })} className="w-7 h-7 flex items-center justify-center rounded-lg border border-slate-200 text-gray-600 text-sm">+</button>
                      </div>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 mb-2">Color</p>
                      <div className="grid grid-cols-6 gap-1.5 mb-2">
                        {COLOR_SWATCHES.map(c => (
                          <button key={c} onClick={() => updateSelected({ color: c })} style={{ backgroundColor: c }}
                            className={`aspect-square rounded border-2 transition-all ${(selected as TextLayer).color === c ? 'border-grace-ink scale-110' : 'border-transparent'} ${c === '#FFFFFF' ? 'border-slate-200' : ''}`}/>
                        ))}
                      </div>
                      <input type="color" value={(selected as TextLayer).color} onChange={e => updateSelected({ color: e.target.value })} className="w-full h-8 rounded cursor-pointer border border-slate-200"/>
                    </div>
                    <div>
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-xs text-gray-500">Border</span>
                        <div className="flex items-center gap-2">
                          <button onClick={() => updateSelected({ strokeWidth: Math.max(0, ((selected as TextLayer).strokeWidth ?? 0) - 1) })} className="w-7 h-7 flex items-center justify-center rounded-lg border border-slate-200 text-gray-600 text-sm">−</button>
                          <span className="text-sm text-gray-700 w-10 text-center">{(selected as TextLayer).strokeWidth ?? 0}px</span>
                          <button onClick={() => updateSelected({ strokeWidth: Math.min(20, ((selected as TextLayer).strokeWidth ?? 0) + 1), strokeColor: (selected as TextLayer).strokeColor ?? '#000000' })} className="w-7 h-7 flex items-center justify-center rounded-lg border border-slate-200 text-gray-600 text-sm">+</button>
                        </div>
                      </div>
                      {((selected as TextLayer).strokeWidth ?? 0) > 0 && (
                        <>
                          <div className="grid grid-cols-6 gap-1.5 mb-2">
                            {COLOR_SWATCHES.map(c => (
                              <button key={c} onClick={() => updateSelected({ strokeColor: c })} style={{ backgroundColor: c }}
                                className={`aspect-square rounded border-2 transition-all ${(selected as TextLayer).strokeColor === c ? 'border-grace-ink scale-110' : 'border-transparent'} ${c === '#FFFFFF' ? 'border-slate-200' : ''}`}/>
                            ))}
                          </div>
                          <input type="color" value={(selected as TextLayer).strokeColor || '#000000'} onChange={e => updateSelected({ strokeColor: e.target.value })} className="w-full h-8 rounded cursor-pointer border border-slate-200"/>
                        </>
                      )}
                    </div>
                    <div>
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-xs text-gray-500">Arch</span>
                        <div className="flex items-center gap-2">
                          <button onClick={() => setArch(((selected as TextLayer).archAmount ?? 0) - 10)} className="w-7 h-7 flex items-center justify-center rounded-lg border border-slate-200 text-gray-600 text-sm">−</button>
                          <span className="text-sm text-gray-700 w-10 text-center">{(selected as TextLayer).archAmount ?? 0}</span>
                          <button onClick={() => setArch(((selected as TextLayer).archAmount ?? 0) + 10)} className="w-7 h-7 flex items-center justify-center rounded-lg border border-slate-200 text-gray-600 text-sm">+</button>
                        </div>
                      </div>
                      <input type="range" min={-100} max={100} value={(selected as TextLayer).archAmount ?? 0}
                        onChange={e => setArch(parseInt(e.target.value))} className="w-full accent-brand-green"/>
                    </div>
                    {transformCard(selected)}
                    {layerControlsCard()}
                  </>
                )}
              </div>
            </AccordionSection>

            {layers.length > 0 && (
              <AccordionSection title="Layers" icon={<Layers size={16}/>} badge={layers.length}
                isOpen={mobileSection === 'layers'} onToggle={() => toggleMobileSection('layers')}>
                <div className="space-y-1">
                  {[...layers].reverse().map((layer, i) => (
                    <button key={layer.id} onClick={() => { selectLayer(layer.id); setMobileSection('text') }}
                      className={`w-full flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm transition-colors ${selectedId === layer.id ? 'bg-brand-green/10 text-gray-900' : 'hover:bg-slate-50 text-gray-600'}`}>
                      {layer.type === 'text' ? <Type size={13}/> : <ImageIcon size={13}/>}
                      <span className="truncate flex-1 text-left">
                        {layer.type === 'text' ? (layer.text.slice(0, 20) || 'Text') : ((layer as ImageLayer).isLogo ? 'Logo' : `Artwork ${layers.length - i}`)}
                      </span>
                    </button>
                  ))}
                </div>
              </AccordionSection>
            )}
          </div>

          {/* Sticky bottom action bar */}
          <div className="flex-shrink-0 border-t border-slate-100 px-4 py-3 bg-white flex items-center gap-3" style={{ paddingBottom: 'max(12px, env(safe-area-inset-bottom))' }}>
            <span className="text-[11px] text-gray-400 flex items-center gap-1 mr-auto">
              {saveStatus === 'saving' && <><Loader2 size={11} className="animate-spin"/> Saving…</>}
              {saveStatus === 'saved'  && <><Check   size={11} className="text-brand-green"/> Saved</>}
            </span>
            <button onClick={handleManualSave} className="btn-secondary flex items-center gap-1.5 text-sm px-4 py-2">
              <Save size={14}/> Save
            </button>
            <button onClick={handleConfirm} className="btn-primary flex items-center gap-1.5 text-sm px-4 py-2">
              Confirm <ArrowRight size={14}/>
            </button>
          </div>
        </div>
      </div>

      {/* Spacer so content isn't hidden behind the collapsed bottom sheet on mobile */}
      <div className="lg:hidden" style={{ height: 64 }}/>

    </div>
  )
}

// A clickable gallery thumbnail that adds its asset to the canvas, with a
// hover remove button to drop it from the gallery.
function AssetThumb({ src, label, onAdd, onRemove }: {
  src: string; label: string; onAdd: () => void; onRemove: () => void
}) {
  return (
    <div className="relative group">
      <button onClick={onAdd}
        className="w-full bg-slate-50 hover:bg-slate-100 rounded-lg overflow-hidden transition-colors border border-slate-200">
        <div className="checkerboard rounded-t-lg" style={{ height: 56 }}>
          <img src={src} alt={label} className="w-full h-full object-contain p-1.5"/>
        </div>
        <p className="text-[10px] text-gray-500 py-1 px-1.5 text-left truncate">{label}</p>
      </button>
      <button onClick={onRemove} title="Remove"
        className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-white border border-slate-200 shadow-sm flex items-center justify-center text-gray-400 hover:text-red-500 hover:border-red-200 opacity-0 group-hover:opacity-100 transition-opacity">
        <X size={11}/>
      </button>
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
