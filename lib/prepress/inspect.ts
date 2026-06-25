// Real file-content inspection. Parses the actual bytes of supported file types
// — no filename guessing — and returns structured metadata the checks use to
// give meaningful production feedback. Every inspector is defensive: on any
// failure it returns { inspected:false } and the pipeline falls back gracefully.

import type { FileInspection, FileKind } from './types'

const EMPTY: FileInspection = { inspected: false }

export async function inspectFile(file: File, kind: FileKind): Promise<FileInspection> {
  try {
    const ext = (file.name.split('.').pop() || '').toLowerCase()
    if (kind === 'raster') {
      if (ext === 'png') return inspectPng(await file.arrayBuffer())
      if (ext === 'jpg' || ext === 'jpeg') return inspectJpeg(await file.arrayBuffer())
      return EMPTY // other rasters: dimensions still come from the <img> loader
    }
    if (ext === 'svg') return inspectSvg(await file.text())
    if (ext === 'eps' || ext === 'ai') return inspectPostscript(await file.text(), await file.arrayBuffer())
    if (kind === 'document' || ext === 'pdf') return inspectPdf(await file.arrayBuffer())
    if (kind === 'spreadsheet' || ext === 'csv') return inspectCsv(await file.text())
    return EMPTY
  } catch {
    return EMPTY
  }
}

// ── PNG ───────────────────────────────────────────────────────────────────────
function inspectPng(buf: ArrayBuffer): FileInspection {
  const b = new DataView(buf)
  if (b.byteLength < 33 || b.getUint32(0) !== 0x89504e47) return EMPTY
  const width = b.getUint32(16)
  const height = b.getUint32(20)
  const colorByte = b.getUint8(25)
  const colorType =
    colorByte === 0 ? 'gray' : colorByte === 2 ? 'rgb' : colorByte === 3 ? 'indexed'
    : colorByte === 4 ? 'gray' : colorByte === 6 ? 'rgba' : 'unknown'
  const hasAlpha = colorByte === 4 || colorByte === 6
  let dpi: number | undefined
  // Scan chunks for pHYs (physical pixel dimensions).
  let off = 8
  const bytes = new Uint8Array(buf)
  const tag = (o: number) => String.fromCharCode(bytes[o], bytes[o + 1], bytes[o + 2], bytes[o + 3])
  while (off + 8 <= bytes.length) {
    const len = b.getUint32(off)
    const type = tag(off + 4)
    if (type === 'pHYs') {
      const ppuX = b.getUint32(off + 8)
      const unit = b.getUint8(off + 16)
      if (unit === 1 && ppuX > 0) dpi = Math.round(ppuX * 0.0254) // px/m → px/in
      break
    }
    if (type === 'IDAT' || type === 'IEND') break
    off += 12 + len
  }
  return { inspected: true, width, height, colorType: colorType as FileInspection['colorType'], hasAlpha, dpi }
}

// ── JPEG ──────────────────────────────────────────────────────────────────────
function inspectJpeg(buf: ArrayBuffer): FileInspection {
  const b = new DataView(buf)
  if (b.getUint16(0) !== 0xffd8) return EMPTY
  let off = 2, dpi: number | undefined, width: number | undefined, height: number | undefined, components = 0
  while (off + 4 < b.byteLength) {
    if (b.getUint8(off) !== 0xff) { off++; continue }
    const marker = b.getUint8(off + 1)
    if (marker === 0xd8 || marker === 0xd9) { off += 2; continue }
    const len = b.getUint16(off + 2)
    if (marker === 0xe0 && off + 11 < b.byteLength) { // APP0 / JFIF
      const units = b.getUint8(off + 11)
      const x = b.getUint16(off + 12)
      if (units === 1 && x > 0) dpi = x          // dots per inch
      else if (units === 2 && x > 0) dpi = Math.round(x * 2.54) // dots per cm → in
    }
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      height = b.getUint16(off + 5)
      width = b.getUint16(off + 7)
      components = b.getUint8(off + 9)
      break
    }
    off += 2 + len
  }
  const colorType = components === 4 ? 'cmyk' : components === 1 ? 'gray' : components === 3 ? 'rgb' : 'unknown'
  return { inspected: true, width, height, dpi, colorType, cmyk: components === 4 }
}

// ── SVG ───────────────────────────────────────────────────────────────────────
function inspectSvg(text: string): FileInspection {
  const hasLiveText = /<text[\s>]/i.test(text)
  const vectorEmbeddedRaster = /<image[\s>]/i.test(text) || /xlink:href\s*=\s*["']data:image/i.test(text)
  let pageSizeIn: { w: number; h: number } | undefined
  const vb = text.match(/viewBox\s*=\s*["']\s*[\d.]+\s+[\d.]+\s+([\d.]+)\s+([\d.]+)/i)
  const wAttr = text.match(/\bwidth\s*=\s*["']([\d.]+)(in|mm|cm|px|pt)?/i)
  const hAttr = text.match(/\bheight\s*=\s*["']([\d.]+)(in|mm|cm|px|pt)?/i)
  const toIn = (v: number, unit?: string) => unit === 'in' ? v : unit === 'mm' ? v / 25.4 : unit === 'cm' ? v / 2.54 : unit === 'pt' ? v / 72 : v / 96
  if (wAttr && hAttr) pageSizeIn = { w: round2(toIn(+wAttr[1], wAttr[2])), h: round2(toIn(+hAttr[1], hAttr[2])) }
  else if (vb) pageSizeIn = { w: round2(+vb[1] / 96), h: round2(+vb[2] / 96) }
  return {
    inspected: true, hasLiveText, vectorEmbeddedRaster, pageSizeIn,
    pantone: /pantone|pms\s?\d/i.test(text), cmyk: /device-?cmyk|cmyk\(/i.test(text),
  }
}

// ── EPS / AI (PostScript or PDF-compatible) ─────────────────────────────────────
async function inspectPostscript(text: string, buf: ArrayBuffer): Promise<FileInspection> {
  if (text.slice(0, 1024).includes('%PDF')) return inspectPdf(buf) // many .ai are PDF
  const bbox = text.match(/%%BoundingBox:\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)/)
  const pageSizeIn = bbox ? { w: round2((+bbox[3] - +bbox[1]) / 72), h: round2((+bbox[4] - +bbox[2]) / 72) } : undefined
  return {
    inspected: true,
    hasLiveText: /\b(show|Tj|TJ)\b/.test(text) || /\/Font\b/.test(text),
    cmyk: /setcmykcolor|DeviceCMYK/i.test(text),
    pantone: /pantone|pms\s?\d/i.test(text),
    vectorEmbeddedRaster: /beginimage|colorimage|BeginBinary/i.test(text),
    pageSizeIn,
  }
}

// ── PDF (pdfjs, best-effort) ────────────────────────────────────────────────────
async function inspectPdf(buf: ArrayBuffer): Promise<FileInspection> {
  try {
    const pdfjs = await import('pdfjs-dist')
    pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'
    const doc = await pdfjs.getDocument({ data: new Uint8Array(buf) }).promise
    const page = await doc.getPage(1)
    const vp = page.getViewport({ scale: 1 })
    const pageSizeIn = { w: round2(vp.width / 72), h: round2(vp.height / 72) }
    let hasLiveText = false
    try { const tc = await page.getTextContent(); hasLiveText = tc.items.length > 0 } catch {}
    let embeddedImages = 0
    try {
      const ops = await page.getOperatorList()
      const OPS = (pdfjs as { OPS: Record<string, number> }).OPS
      for (const fn of ops.fnArray) {
        if (fn === OPS.paintImageXObject || fn === OPS.paintInlineImageXObject || fn === OPS.paintImageMaskXObject) embeddedImages++
      }
    } catch {}
    const notes: string[] = []
    const result: FileInspection = { inspected: true, pages: doc.numPages, pageSizeIn, hasLiveText, embeddedImages, notes }
    try { await (doc as { destroy?: () => Promise<void> }).destroy?.() } catch {}
    return result
  } catch {
    return EMPTY
  }
}

// ── CSV (size-chart detection + extraction) ─────────────────────────────────────
function inspectCsv(text: string): FileInspection {
  const rows = text.split(/\r?\n/).filter(l => l.trim().length).map(splitCsvLine)
  if (rows.length < 2) return { inspected: true, isSizeChart: false }
  const headers = rows[0]
  const body = rows.slice(1)
  const SIZE = /^(xs|s|m|l|xl|2xl|3xl|xxl|xxxl|small|medium|large|x-?large)$/i
  const sizeHeaderCount = headers.filter(h => SIZE.test(h.trim())).length
  // numeric-heavy table with a labeled first column also reads as a size chart
  const numericCols = headers.length > 1 && body.length > 0 &&
    body.every(r => r.slice(1).filter(c => c.trim() && !isNaN(parseFloat(c))).length >= Math.max(1, headers.length - 2))
  const isSizeChart = sizeHeaderCount >= 2 || (numericCols && body.length >= 2 && headers.length >= 3)
  return { inspected: true, isSizeChart, table: { headers, rows: body } }
}

function splitCsvLine(line: string): string[] {
  const out: string[] = []
  let cur = '', q = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (c === '"') { if (q && line[i + 1] === '"') { cur += '"'; i++ } else q = !q }
    else if (c === ',' && !q) { out.push(cur); cur = '' }
    else cur += c
  }
  out.push(cur)
  return out.map(s => s.trim())
}

const round2 = (n: number) => Math.round(n * 100) / 100
