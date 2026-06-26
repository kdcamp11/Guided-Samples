// Client-side bridge to the vision classifier. Produces a small preview image
// for any supported upload (raster, PDF first page, or SVG), sends it to
// /api/prepress/classify, and returns what the model actually saw. Every step is
// defensive: on any failure it returns null and the pipeline falls back to
// filename heuristics, so classification never makes the analysis worse.

import type { FileClassification, FileKind } from './types'

const MAX_DIM = 1024 // cheap, plenty for "mockup? which views?"

export async function classifyImage(dataUrl: string): Promise<FileClassification | null> {
  try {
    const res = await fetch('/api/prepress/classify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: dataUrl }),
    })
    const json = await res.json().catch(() => null)
    if (!json?.ok) return null
    return {
      isGarmentMockup: !!json.isGarmentMockup,
      views: { front: !!json.views?.front, back: !!json.views?.back, side: !!json.views?.side },
      classified: true,
    }
  } catch {
    return null
  }
}

/** A downscaled JPEG data URL suitable for vision, or null if we can't make one. */
export async function previewDataUrl(file: File, kind: FileKind, existing?: string): Promise<string | null> {
  const ext = (file.name.split('.').pop() || '').toLowerCase()
  try {
    if (kind === 'raster' && existing) return await downscale(existing)
    if (kind === 'document' || ext === 'pdf') return await rasterizePdf(file)
    if (ext === 'svg') {
      const blobUrl = URL.createObjectURL(new Blob([await file.text()], { type: 'image/svg+xml' }))
      const out = await downscale(blobUrl)
      URL.revokeObjectURL(blobUrl)
      return out
    }
    // .ai/.eps and other rasters without a dataUrl can't be rasterized in-browser.
    return null
  } catch {
    return null
  }
}

// Draw any browser-loadable image source onto a white-backed canvas, downscaled.
function downscale(src: string): Promise<string | null> {
  return new Promise(resolve => {
    const img = new Image()
    img.onload = () => {
      try {
        const w = img.naturalWidth || 1, h = img.naturalHeight || 1
        const scale = Math.min(MAX_DIM / w, MAX_DIM / h, 1) || 1
        const canvas = document.createElement('canvas')
        canvas.width = Math.max(1, Math.round(w * scale))
        canvas.height = Math.max(1, Math.round(h * scale))
        const ctx = canvas.getContext('2d')
        if (!ctx) return resolve(null)
        ctx.fillStyle = '#fff'
        ctx.fillRect(0, 0, canvas.width, canvas.height)
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
        resolve(canvas.toDataURL('image/jpeg', 0.82))
      } catch { resolve(null) }
    }
    img.onerror = () => resolve(null)
    img.src = src
  })
}

async function rasterizePdf(file: File): Promise<string | null> {
  try {
    const pdfjs = await import('pdfjs-dist')
    pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'
    const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise
    const page = await doc.getPage(1)
    const base = page.getViewport({ scale: 1 })
    const scale = Math.min(MAX_DIM / base.width, MAX_DIM / base.height, 2) || 1
    const vp = page.getViewport({ scale })
    const canvas = document.createElement('canvas')
    canvas.width = Math.ceil(vp.width)
    canvas.height = Math.ceil(vp.height)
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    await page.render({ canvas, canvasContext: ctx, viewport: vp } as Parameters<typeof page.render>[0]).promise
    const url = canvas.toDataURL('image/jpeg', 0.82)
    try { await (doc as { destroy?: () => Promise<void> }).destroy?.() } catch {}
    return url
  } catch {
    return null
  }
}
