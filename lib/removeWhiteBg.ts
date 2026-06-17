// Remove a solid-color background from a logo image.
// Samples the four corners to detect the background color, then BFS flood-fills
// from the image borders — only the outer connected background region becomes
// transparent. Interior pixels of the same color (e.g. white text on white bg)
// are preserved because they aren't reachable from the border.
export async function removeWhiteBackground(dataUrl: string, tolerance = 30): Promise<string> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image()
    i.crossOrigin = 'anonymous'
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

  // Detect background color by sampling four corners; pick the most common one
  const corners = [
    [0, 0], [w - 1, 0], [0, h - 1], [w - 1, h - 1],
  ].map(([x, y]) => {
    const i = (y * w + x) * 4
    return { r: px[i], g: px[i + 1], b: px[i + 2] }
  })
  // Use the top-left corner as the reference background color
  const bg = corners[0]

  const isBg = (i: number) =>
    Math.abs(px[i]     - bg.r) <= tolerance &&
    Math.abs(px[i + 1] - bg.g) <= tolerance &&
    Math.abs(px[i + 2] - bg.b) <= tolerance

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
