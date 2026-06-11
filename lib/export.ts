// Client-side export helpers for logos and garments.

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export function downloadSVG(svg: string, filename: string) {
  downloadBlob(new Blob([svg], { type: 'image/svg+xml' }), filename)
}

// Rasterize an SVG string to a PNG/JPEG data URL at a given scale.
export function rasterizeSVG(
  svg: string,
  opts: { format?: 'png' | 'jpeg'; scale?: number; background?: string } = {}
): Promise<string> {
  const { format = 'png', scale = 3, background } = opts
  return new Promise((resolve, reject) => {
    const widthMatch = svg.match(/width="(\d+(?:\.\d+)?)"/)
    const heightMatch = svg.match(/height="(\d+(?:\.\d+)?)"/)
    const w = widthMatch ? parseFloat(widthMatch[1]) : 400
    const h = heightMatch ? parseFloat(heightMatch[1]) : 200

    const img = new Image()
    const svgBlob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' })
    const url = URL.createObjectURL(svgBlob)

    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = w * scale
      canvas.height = h * scale
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        URL.revokeObjectURL(url)
        reject(new Error('Canvas not supported'))
        return
      }
      // JPEG has no alpha — fill a background so it isn't black.
      if (background || format === 'jpeg') {
        ctx.fillStyle = background || '#ffffff'
        ctx.fillRect(0, 0, canvas.width, canvas.height)
      }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      URL.revokeObjectURL(url)
      resolve(canvas.toDataURL(format === 'jpeg' ? 'image/jpeg' : 'image/png', 0.95))
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Failed to load SVG'))
    }
    img.src = url
  })
}

function base64ToBytes(base64: string): Uint8Array {
  const bin = atob(base64)
  const arr = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i)
  return arr
}

export function dataUrlToBlob(dataUrl: string): Blob {
  const [header, base64] = dataUrl.split(',')
  const mime = header.match(/:(.*?);/)?.[1] || 'image/png'
  return new Blob([base64ToBytes(base64) as unknown as BlobPart], { type: mime })
}

// Download an SVG in the requested raster/vector format.
export async function exportImage(
  svg: string,
  format: 'svg' | 'png' | 'jpeg' | 'pdf',
  baseName: string,
  background?: string
) {
  if (format === 'svg') {
    downloadSVG(svg, `${baseName}.svg`)
    return
  }
  if (format === 'pdf') {
    const jpeg = await rasterizeSVG(svg, { format: 'jpeg', scale: 3, background: background || '#ffffff' })
    const pdf = await buildSingleImagePdf(jpeg)
    downloadBlob(pdf, `${baseName}.pdf`)
    return
  }
  const dataUrl = await rasterizeSVG(svg, { format, scale: 3, background })
  downloadBlob(dataUrlToBlob(dataUrl), `${baseName}.${format === 'jpeg' ? 'jpg' : 'png'}`)
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })
}

// Export an already-rasterized image (e.g. an AI-generated PNG data URL).
export async function exportRaster(
  dataUrl: string,
  format: 'png' | 'jpeg' | 'pdf',
  baseName: string,
  background?: string
) {
  if (format === 'png') {
    downloadBlob(dataUrlToBlob(dataUrl), `${baseName}.png`)
    return
  }
  const img = await loadImage(dataUrl)
  const canvas = document.createElement('canvas')
  canvas.width = img.naturalWidth
  canvas.height = img.naturalHeight
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas not supported')
  ctx.fillStyle = background || '#ffffff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(img, 0, 0)
  const jpeg = canvas.toDataURL('image/jpeg', 0.95)
  if (format === 'jpeg') {
    downloadBlob(dataUrlToBlob(jpeg), `${baseName}.jpg`)
    return
  }
  const pdf = await buildSingleImagePdf(jpeg)
  downloadBlob(pdf, `${baseName}.pdf`)
}

// Export an asset that may be vector (SVG) or raster (data URL), choosing the
// best path. Falls back to the raster image when no SVG source is available.
export async function exportAsset(
  asset: { svg?: string | null; image: string },
  format: 'svg' | 'png' | 'jpeg' | 'pdf',
  baseName: string,
  background?: string
) {
  if (asset.svg) {
    await exportImage(asset.svg, format, baseName, background)
    return
  }
  // No vector source — SVG export isn't possible, so emit a PNG instead.
  const raster = format === 'svg' ? 'png' : format
  await exportRaster(asset.image, raster, baseName, background)
}


// Minimal single-image PDF writer (no external deps), embedding a JPEG via DCTDecode.
async function buildSingleImagePdf(jpegDataUrl: string): Promise<Blob> {
  const img = await loadImage(jpegDataUrl)
  const imgW = img.naturalWidth
  const imgH = img.naturalHeight
  const jpegBytes = base64ToBytes(jpegDataUrl.split(',')[1])

  // Fit the image onto a padded page at 72 DPI.
  const maxW = 540
  const scale = Math.min(1, maxW / imgW)
  const pw = imgW * scale
  const ph = imgH * scale
  const pageW = pw + 40
  const pageH = ph + 40
  const x = (pageW - pw) / 2
  const y = (pageH - ph) / 2
  const content = `q\n${pw.toFixed(2)} 0 0 ${ph.toFixed(2)} ${x.toFixed(2)} ${y.toFixed(2)} cm\n/Im0 Do\nQ\n`

  const enc = new TextEncoder()
  const parts: BlobPart[] = []
  const offsets: number[] = []
  let length = 0
  const push = (data: string | Uint8Array) => {
    const bytes = typeof data === 'string' ? enc.encode(data) : data
    parts.push(bytes as unknown as BlobPart)
    length += bytes.length
  }
  const mark = () => offsets.push(length)

  push('%PDF-1.4\n')
  mark(); push('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n')
  mark(); push('2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n')
  mark(); push(`3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageW.toFixed(2)} ${pageH.toFixed(2)}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>\nendobj\n`)
  mark(); push(`4 0 obj\n<< /Type /XObject /Subtype /Image /Width ${imgW} /Height ${imgH} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpegBytes.length} >>\nstream\n`)
  push(jpegBytes)
  push('\nendstream\nendobj\n')
  mark(); push(`5 0 obj\n<< /Length ${enc.encode(content).length} >>\nstream\n${content}endstream\nendobj\n`)

  const xrefStart = length
  let xref = `xref\n0 6\n0000000000 65535 f \n`
  for (const off of offsets) xref += `${String(off).padStart(10, '0')} 00000 n \n`
  push(xref)
  push(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`)

  return new Blob(parts, { type: 'application/pdf' })
}
