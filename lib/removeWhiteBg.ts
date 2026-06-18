// Server-backed background removal: tries the rembg (U²-Net) cleanup pipeline via
// /api/remove-bg first for proper edge/shadow-preserving alpha, then falls back to
// the local flood-fill remover below if the service is unavailable or errors.
export async function cleanupBackground(dataUrl: string): Promise<string> {
  try {
    const res = await fetch('/api/remove-bg', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: dataUrl }),
    })
    if (res.ok) {
      const data = await res.json()
      if (data?.image && data.removed) return data.image as string
    }
  } catch { /* fall through to local remover */ }
  try { return await removeWhiteBackground(dataUrl) } catch { return dataUrl }
}

// Remove a solid-color background from a logo image.
// Averages all four corners to detect the background color, then BFS flood-fills
// from the image borders — only the outer connected background region becomes
// transparent. Interior pixels of the same color are preserved because they
// aren't reachable from the border.
export async function removeWhiteBackground(dataUrl: string, tolerance = 40): Promise<string> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image()
    i.onload = () => resolve(i)
    i.onerror = reject
    i.src = dataUrl
  })

  const canvas = document.createElement('canvas')
  canvas.width = img.width
  canvas.height = img.height
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return dataUrl
  ctx.drawImage(img, 0, 0)

  const { width: w, height: h } = canvas
  const imageData = ctx.getImageData(0, 0, w, h)
  const px = imageData.data

  // Sample all four corners and average to get a robust background color estimate.
  // Corners that are fully transparent are skipped.
  const cornerCoords = [[0, 0], [w - 1, 0], [0, h - 1], [w - 1, h - 1]] as const
  let rSum = 0, gSum = 0, bSum = 0, count = 0
  for (const [x, y] of cornerCoords) {
    const idx = (y * w + x) * 4
    if (px[idx + 3] < 10) continue // skip transparent corners
    rSum += px[idx]; gSum += px[idx + 1]; bSum += px[idx + 2]
    count++
  }
  if (count === 0) return dataUrl // all corners transparent — nothing to remove
  const bg = { r: Math.round(rSum / count), g: Math.round(gSum / count), b: Math.round(bSum / count) }

  const isBg = (idx: number) =>
    px[idx + 3] > 10 && // only remove opaque pixels
    Math.abs(px[idx]     - bg.r) <= tolerance &&
    Math.abs(px[idx + 1] - bg.g) <= tolerance &&
    Math.abs(px[idx + 2] - bg.b) <= tolerance

  // BFS flood fill from all border pixels
  const visited = new Uint8Array(w * h)
  const queue: number[] = []
  const push = (x: number, y: number) => {
    const p = y * w + x
    if (visited[p]) return
    visited[p] = 1
    if (isBg(p * 4)) queue.push(p)
    else visited[p] = 2
  }
  for (let x = 0; x < w; x++) { push(x, 0); push(x, h - 1) }
  for (let y = 0; y < h; y++) { push(0, y); push(w - 1, y) }

  while (queue.length) {
    const p = queue.pop()!
    px[p * 4 + 3] = 0
    const x = p % w
    const y = (p / w) | 0
    if (x > 0) push(x - 1, y)
    if (x < w - 1) push(x + 1, y)
    if (y > 0) push(x, y - 1)
    if (y < h - 1) push(x, y + 1)
  }

  ctx.putImageData(imageData, 0, 0)
  return canvas.toDataURL('image/png')
}
