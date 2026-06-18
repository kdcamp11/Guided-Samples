// Background cleanup for uploaded logos and artwork.
//
// Uses the client-side BFS flood-fill exclusively. It only clears the OUTER
// connected background region reachable from the image border, so every interior
// pixel — including the multi-stroke outline borders on letters (e.g. the GRACE
// gold+black double border) — is preserved.
//
// The Replicate/rembg (U²-Net) model is intentionally NOT used here: it is a
// subject-segmentation model that treats those outline strokes as background and
// strips them, which is exactly the border-loss the user reported. Flood-fill is
// deterministic, so the same upload also produces identical bytes every time,
// which lets the Library deduplicate repeats of the same logo.
// Intentionally skips background removal so uploaded logos/artwork are
// preserved exactly as the user provided them (borders, multi-stroke outlines,
// colored backgrounds all intact). Users who want a transparent background
// should upload a pre-cut PNG.
export async function cleanupBackground(dataUrl: string): Promise<string> {
  return dataUrl
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
