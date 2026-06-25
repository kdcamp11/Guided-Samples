// Modular prepress check registry. Each check is a small, independent inspector
// that reads a shared, pre-computed context and returns a result. Add new
// production checks here — the runner and UI pick them up automatically.

import type { CheckCategory, CheckResult, FixAction, Severity, UploadedFile } from './types'

export interface CheckContext {
  files: UploadedFile[]
  hasVector: boolean
  hasRaster: boolean
  hasDocument: boolean
  rasterFiles: UploadedFile[]
  lowRes: UploadedFile[]
  views: { front: boolean; back: boolean; side: boolean }
  garmentViews: boolean
  flags: {
    sizeChart: boolean
    techPack: boolean
    placement: boolean
    fabric: boolean
    decoration: boolean
    pantone: boolean
    cmyk: boolean
    bleed: boolean
    dimensions: boolean
  }
}

type CheckBody = Pick<CheckResult, 'status' | 'detail' | 'evidence' | 'fixes'>

export interface CheckDef {
  id: string
  label: string
  category: CheckCategory
  run: (ctx: CheckContext) => CheckBody
}

const fix = (id: string, label: string, description?: string): FixAction => ({ id, label, description })
const MIN_PRINT_PX = 1500 // ~5in @ 300dpi — below this we flag raster as low-res

export const CHECKS: CheckDef[] = [
  // ── Artwork ────────────────────────────────────────────────────────────────
  {
    id: 'artwork-views', label: 'Front / back / side artwork', category: 'artwork',
    run: ({ views }) => {
      const found = Object.entries(views).filter(([, v]) => v).map(([k]) => k)
      const missing = Object.entries(views).filter(([, v]) => !v).map(([k]) => k)
      if (found.length === 0) return {
        status: 'critical', detail: 'No print artwork could be identified by placement.',
        fixes: [fix('generate-placement', 'Detect & label placements')],
      }
      if (missing.length) return {
        status: 'warning',
        detail: `Detected ${found.join(', ')} artwork. No ${missing.join(', ')} placement found — confirm this is front-only.`,
        evidence: found.map(f => `${f} artwork`),
        fixes: [fix('generate-mockups', 'Generate missing views')],
      }
      return { status: 'pass', detail: 'Front, back and side artwork all present.', evidence: found.map(f => `${f} artwork`) }
    },
  },
  {
    id: 'garment-views', label: 'Garment mockups', category: 'artwork',
    run: ({ garmentViews }) => garmentViews
      ? { status: 'pass', detail: 'Garment mockup/flat provided for visual reference.' }
      : { status: 'warning', detail: 'No garment mockup found — suppliers prefer a visual reference.', fixes: [fix('generate-mockups', 'Generate garment mockups')] },
  },
  {
    id: 'vector-artwork', label: 'Vector vs raster artwork', category: 'artwork',
    run: ({ hasVector, hasRaster, rasterFiles }) => {
      if (hasVector && !hasRaster) return { status: 'pass', detail: 'Artwork is vector — scales cleanly at any print size.' }
      if (hasVector && hasRaster) return {
        status: 'warning', detail: 'Mixed vector and raster artwork. Raster elements may not print crisply at scale.',
        evidence: rasterFiles.map(f => f.name), fixes: [fix('vectorize', 'Recreate raster as vector')],
      }
      return {
        status: 'critical', detail: 'Artwork is raster only. For screen print / large formats, vector is strongly recommended.',
        evidence: rasterFiles.map(f => f.name), fixes: [fix('vectorize', 'Recreate raster as vector')],
      }
    },
  },
  {
    id: 'image-resolution', label: 'Image resolution', category: 'artwork',
    run: ({ rasterFiles, lowRes }) => {
      if (rasterFiles.length === 0) return { status: 'pass', detail: 'No raster images to evaluate.' }
      if (lowRes.length === 0) return {
        status: 'pass', detail: 'All raster artwork meets print resolution.',
        evidence: rasterFiles.map(f => `${f.name} — ${f.width}×${f.height}px`),
      }
      return {
        status: 'warning', detail: `${lowRes.length} image(s) below ${MIN_PRINT_PX}px — may look soft when printed.`,
        evidence: lowRes.map(f => `${f.name} — ${f.width}×${f.height}px`),
        fixes: [fix('upscale', 'AI upscale to print resolution')],
      }
    },
  },

  // ── Color ────────────────────────────────────────────────────────────────
  {
    id: 'color-mode', label: 'Color mode (RGB / CMYK)', category: 'color',
    run: ({ flags, hasRaster }) => flags.cmyk
      ? { status: 'pass', detail: 'CMYK color profile detected — ready for print.' }
      : {
        status: hasRaster ? 'warning' : 'info',
        detail: 'No CMYK profile detected. Screen artwork is usually RGB and shifts in print.',
        fixes: [fix('convert-cmyk', 'Convert to CMYK')],
      },
  },
  {
    id: 'pantone', label: 'Pantone references', category: 'color',
    run: ({ flags }) => flags.pantone
      ? { status: 'pass', detail: 'Pantone references found — spot colors can be matched.' }
      : { status: 'warning', detail: 'No Pantone references — exact color matching across runs isn’t guaranteed.', fixes: [fix('convert-pantone', 'Map colors to Pantone')] },
  },

  // ── Typography ─────────────────────────────────────────────────────────────
  {
    id: 'fonts-outlined', label: 'Fonts outlined', category: 'typography',
    run: ({ hasDocument, hasVector }) => (hasDocument || hasVector)
      ? { status: 'warning', detail: 'Live text may be present. Fonts must be outlined so they render identically at the supplier.', fixes: [fix('outline-fonts', 'Convert fonts to outlines')] }
      : { status: 'info', detail: 'No vector/document files with text to evaluate.' },
  },

  // ── Dimensions & bleed ──────────────────────────────────────────────────────
  {
    id: 'print-dimensions', label: 'Print dimensions', category: 'dimensions',
    run: ({ flags }) => flags.dimensions
      ? { status: 'pass', detail: 'Print dimensions are specified.' }
      : { status: 'critical', detail: 'No print dimensions found. The supplier needs exact print size per placement.', fixes: [fix('set-dimensions', 'Generate print dimensions')] },
  },
  {
    id: 'bleed-safe', label: 'Bleed & safe area', category: 'dimensions',
    run: ({ flags }) => flags.bleed
      ? { status: 'pass', detail: 'Bleed and safe margins detected.' }
      : { status: 'warning', detail: 'No bleed / safe-area defined. Edge artwork can clip during production.', fixes: [fix('add-bleed', 'Add bleed & safe area')] },
  },

  // ── Specifications ───────────────────────────────────────────────────────────
  {
    id: 'size-chart', label: 'Size chart', category: 'specs',
    run: ({ flags }) => flags.sizeChart
      ? { status: 'pass', detail: 'Size chart / measurement spec provided.' }
      : { status: 'critical', detail: 'No size chart found. Manufacturing needs graded measurements.', fixes: [fix('generate-sizechart', 'Generate size chart')] },
  },
  {
    id: 'placement-spec', label: 'Placement specifications', category: 'specs',
    run: ({ flags }) => flags.placement
      ? { status: 'pass', detail: 'Placement specifications provided.' }
      : { status: 'warning', detail: 'No placement spec (offset from collar, width, alignment). Without it, placement is guesswork.', fixes: [fix('generate-placement', 'Generate placement spec')] },
  },
  {
    id: 'tech-pack', label: 'Tech pack', category: 'specs',
    run: ({ flags }) => flags.techPack
      ? { status: 'pass', detail: 'Tech pack provided.' }
      : { status: 'critical', detail: 'No tech pack found — the core production document is missing.', fixes: [fix('generate-techpack', 'Generate full tech pack')] },
  },
  {
    id: 'decoration', label: 'Decoration method', category: 'specs',
    run: ({ flags }) => flags.decoration
      ? { status: 'pass', detail: 'Decoration method specified.' }
      : { status: 'warning', detail: 'No decoration method (screen print, DTG, embroidery…) specified.', fixes: [fix('specify-decoration', 'Recommend decoration method')] },
  },
  {
    id: 'fabric', label: 'Fabric information', category: 'specs',
    run: ({ flags }) => flags.fabric
      ? { status: 'pass', detail: 'Fabric composition / weight specified.' }
      : { status: 'warning', detail: 'No fabric composition or weight specified.', fixes: [fix('specify-fabric', 'Fill in fabric info')] },
  },
]

export const STATUS_WEIGHT: Record<Severity, number> = { pass: 0, info: 0, warning: 5, critical: 16 }
