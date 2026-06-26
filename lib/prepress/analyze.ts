// Prepress analysis runner. Classifies uploaded files, inspects their real
// contents, derives a shared context from that real data (with filename heuristics
// only as a fallback), runs every registered check, and scores readiness.

import { CHECKS, STATUS_WEIGHT, type CheckContext } from './checks'
import { inspectFile } from './inspect'
import { classifyImage, previewDataUrl } from './classify'
import type { FileKind, PrepressReport, UploadedFile } from './types'
import type { SizeProfile } from '@/lib/sizing/types'

export interface AnalyzeOptions {
  /** The user's saved default size profile (sizing source of truth), if any. */
  sizeProfile?: SizeProfile | null
}

const VECTOR = ['svg', 'ai', 'eps']
const RASTER = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'tif', 'tiff', 'bmp', 'heic']
const SPREADSHEET = ['csv', 'xls', 'xlsx', 'numbers']
const DOCUMENT = ['pdf']
const MIN_PRINT_PX = 1500
const MIN_PRINT_DPI = 200

const extOf = (name: string) => (name.split('.').pop() || '').toLowerCase()

function kindOf(ext: string): FileKind {
  if (VECTOR.includes(ext)) return 'vector'
  if (RASTER.includes(ext)) return 'raster'
  if (DOCUMENT.includes(ext)) return 'document'
  if (SPREADSHEET.includes(ext)) return 'spreadsheet'
  return 'other'
}

// Preview + fallback dimensions for rasters (never throws).
function loadRasterMeta(file: File): Promise<{ width?: number; height?: number; dataUrl?: string }> {
  return new Promise(resolve => {
    try {
      const reader = new FileReader()
      reader.onload = () => {
        const dataUrl = String(reader.result)
        const img = new Image()
        img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight, dataUrl })
        img.onerror = () => resolve({ dataUrl })
        img.src = dataUrl
      }
      reader.onerror = () => resolve({})
      reader.readAsDataURL(file)
    } catch { resolve({}) }
  })
}

async function classify(file: File): Promise<UploadedFile> {
  const ext = extOf(file.name)
  const kind = kindOf(ext)
  const base: UploadedFile = {
    id: (globalThis.crypto?.randomUUID?.() ?? `${file.name}-${file.size}-${Math.random()}`),
    name: file.name, size: file.size, type: file.type, ext, kind,
  }
  const inspection = await inspectFile(file, kind)
  const uploaded: UploadedFile = { ...base, inspection }
  if (kind === 'raster') {
    const meta = await loadRasterMeta(file)
    uploaded.width = inspection.width ?? meta.width
    uploaded.height = inspection.height ?? meta.height
    uploaded.dataUrl = meta.dataUrl
  }

  // Real vision classification: does the image show a garment mockup, and which
  // views? Only for image-bearing files; falls back to null (→ filename) on failure.
  if (kind === 'raster' || kind === 'document' || kind === 'vector') {
    const preview = await previewDataUrl(file, kind, uploaded.dataUrl)
    if (preview) {
      const classification = await classifyImage(preview)
      if (classification) uploaded.classification = classification
    }
  }
  return uploaded
}

const any = (names: string[], re: RegExp) => names.some(n => re.test(n))

function buildContext(files: UploadedFile[], opts: AnalyzeOptions = {}): CheckContext {
  const names = files.map(f => f.name.toLowerCase())
  const rasterFiles = files.filter(f => f.kind === 'raster')

  // Real low-res detection: prefer DPI when known, else fall back to pixel size.
  const lowRes = rasterFiles.filter(f => {
    const dpi = f.inspection?.dpi
    if (dpi && dpi > 0) return dpi < MIN_PRINT_DPI
    const maxDim = Math.max(f.width ?? 0, f.height ?? 0)
    return maxDim > 0 && maxDim < MIN_PRINT_PX
  })

  // Real signals parsed from file contents.
  const insp = files.map(f => f.inspection).filter((i): i is NonNullable<typeof i> => !!i?.inspected)
  const realCmyk = insp.some(i => i.cmyk || i.colorType === 'cmyk')
  const realPantone = insp.some(i => i.pantone)
  const liveText = insp.some(i => i.hasLiveText)
  const dimFile = files.find(f => f.inspection?.pageSizeIn)
  const sizeChartFile = files.find(f => f.inspection?.isSizeChart)
  const embeddedImages = insp.reduce((n, i) => n + (i.embeddedImages ?? 0), 0)

  // Real vision classification (what the model actually saw), with filename
  // heuristics only as a fallback when no image could be classified.
  const classified = files.map(f => f.classification).filter((c): c is NonNullable<typeof c> => !!c?.classified)
  const visionViews = classified.length
    ? {
        front: classified.some(c => c.views.front),
        back: classified.some(c => c.views.back),
        side: classified.some(c => c.views.side),
      }
    : null
  const visionMockup = classified.length ? classified.some(c => c.isGarmentMockup) : null

  return {
    files,
    hasVector: files.some(f => f.kind === 'vector'),
    hasRaster: rasterFiles.length > 0,
    hasDocument: files.some(f => f.kind === 'document'),
    rasterFiles,
    lowRes,
    views: visionViews ?? {
      front: any(names, /front|[-_ ]f[-_. ]|chest/),
      back: any(names, /back|[-_ ]b[-_. ]|rear/),
      side: any(names, /side|sleeve|left|right/),
    },
    garmentViews: visionMockup ?? any(names, /mockup|garment|flat|model|tee|hoodie|shirt|crew|jacket/),
    // Real-content signals, with filename heuristics only as fallback.
    liveTextDetected: liveText,
    inspectedText: insp.some(i => i.hasLiveText !== undefined || i.pages !== undefined),
    embeddedImages,
    printSize: dimFile?.inspection?.pageSizeIn,
    sizeChartFile: sizeChartFile?.name,
    savedSizeProfileName: opts.sizeProfile?.name,
    flags: {
      sizeChart: !!sizeChartFile || any(names, /size.?chart|sizing|measurement|grading|spec.?sheet/),
      techPack: any(names, /tech.?pack|techpack|specification|\bspec\b/),
      placement: any(names, /placement|position|layout/),
      fabric: any(names, /fabric|material|composition|cotton|poly|gsm/),
      decoration: any(names, /screen.?print|dtg|embroider|vinyl|sublimation|decoration|print.?method|heat.?press/),
      pantone: realPantone || any(names, /pantone|pms/),
      cmyk: realCmyk || any(names, /cmyk/),
      bleed: any(names, /bleed|safe.?area|trim/),
      dimensions: !!dimFile || any(names, /\d+\s?(x|×)\s?\d+|inch|\bin\b|\bcm\b|\bmm\b|dimension/),
    },
  }
}

export async function analyzeFiles(fileList: File[], opts: AnalyzeOptions = {}): Promise<PrepressReport> {
  const files = await Promise.all(Array.from(fileList).map(classify))
  const ctx = buildContext(files, opts)

  const results = CHECKS.map(def => ({ id: def.id, label: def.label, category: def.category, ...def.run(ctx) }))

  const summary = { pass: 0, warning: 0, critical: 0 }
  let penalty = 0
  for (const r of results) {
    if (r.status === 'pass') summary.pass++
    else if (r.status === 'warning') summary.warning++
    else if (r.status === 'critical') summary.critical++
    penalty += STATUS_WEIGHT[r.status] ?? 0
  }

  const score = files.length === 0 ? 0 : Math.max(0, Math.min(100, 100 - penalty))
  return {
    score,
    ready: summary.critical === 0 && files.length > 0,
    generatedAt: new Date().toISOString(),
    files,
    results,
    summary,
  }
}
