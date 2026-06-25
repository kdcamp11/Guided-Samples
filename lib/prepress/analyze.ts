// Prepress analysis runner. Classifies uploaded files, derives a shared context,
// runs every registered check, and produces a scored production-readiness report.

import { CHECKS, STATUS_WEIGHT, type CheckContext } from './checks'
import type { FileKind, PrepressReport, UploadedFile } from './types'

const VECTOR = ['svg', 'ai', 'eps']
const RASTER = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'tif', 'tiff', 'bmp', 'heic']
const SPREADSHEET = ['csv', 'xls', 'xlsx', 'numbers']
const DOCUMENT = ['pdf']
const MIN_PRINT_PX = 1500

const extOf = (name: string) => (name.split('.').pop() || '').toLowerCase()

function kindOf(ext: string): FileKind {
  if (VECTOR.includes(ext)) return 'vector'
  if (RASTER.includes(ext)) return 'raster'
  if (DOCUMENT.includes(ext)) return 'document'
  if (SPREADSHEET.includes(ext)) return 'spreadsheet'
  return 'other'
}

// Read raster dimensions + a preview data URL (best effort; never throws).
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
  if (kind === 'raster') {
    const meta = await loadRasterMeta(file)
    return { ...base, ...meta }
  }
  return base
}

const any = (names: string[], re: RegExp) => names.some(n => re.test(n))

function buildContext(files: UploadedFile[]): CheckContext {
  const names = files.map(f => f.name.toLowerCase())
  const rasterFiles = files.filter(f => f.kind === 'raster')
  const lowRes = rasterFiles.filter(f => Math.max(f.width ?? 0, f.height ?? 0) > 0 && Math.max(f.width ?? 0, f.height ?? 0) < MIN_PRINT_PX)

  return {
    files,
    hasVector: files.some(f => f.kind === 'vector'),
    hasRaster: rasterFiles.length > 0,
    hasDocument: files.some(f => f.kind === 'document'),
    rasterFiles,
    lowRes,
    views: {
      front: any(names, /front|[-_ ]f[-_. ]|chest/),
      back: any(names, /back|[-_ ]b[-_. ]|rear/),
      side: any(names, /side|sleeve|left|right/),
    },
    garmentViews: any(names, /mockup|garment|flat|model|tee|hoodie|shirt|crew|jacket/),
    flags: {
      sizeChart: any(names, /size.?chart|sizing|measurement|grading|spec.?sheet/),
      techPack: any(names, /tech.?pack|techpack|specification|\bspec\b/),
      placement: any(names, /placement|position|layout/),
      fabric: any(names, /fabric|material|composition|cotton|poly|gsm/),
      decoration: any(names, /screen.?print|dtg|embroider|vinyl|sublimation|decoration|print.?method|heat.?press/),
      pantone: any(names, /pantone|pms/),
      cmyk: any(names, /cmyk/),
      bleed: any(names, /bleed|safe.?area|trim/),
      dimensions: any(names, /\d+\s?(x|×)\s?\d+|inch|\bin\b|\bcm\b|\bmm\b|dimension/),
    },
  }
}

export async function analyzeFiles(fileList: File[]): Promise<PrepressReport> {
  const files = await Promise.all(Array.from(fileList).map(classify))
  const ctx = buildContext(files)

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
