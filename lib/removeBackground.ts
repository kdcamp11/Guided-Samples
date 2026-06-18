/**
 * Server-side background removal pipeline.
 *
 * Runs the `rembg` (U²-Net) model hosted on Replicate to strip backgrounds from
 * generated/uploaded logos. Produces a true alpha-channel PNG with preserved
 * edges and shadows, full original resolution, and no white matte or bounding box.
 *
 * Requires REPLICATE_API_TOKEN. The model can be overridden with REPLICATE_BG_MODEL
 * (default: the maintained rembg-based remover). Falls back to returning null when
 * unconfigured or on error so callers can degrade gracefully to the client-side
 * flood-fill remover.
 */

// Default to a maintained rembg/u2net-based remover on Replicate.
const DEFAULT_MODEL = '851-labs/background-remover'

type ReplicatePrediction = {
  status: 'starting' | 'processing' | 'succeeded' | 'failed' | 'canceled'
  output?: string | string[] | null
  error?: string | null
  urls?: { get?: string }
}

function modelEndpoint(): string {
  const model = process.env.REPLICATE_BG_MODEL || DEFAULT_MODEL
  return `https://api.replicate.com/v1/models/${model}/predictions`
}

function firstOutputUrl(out: ReplicatePrediction['output']): string | null {
  if (!out) return null
  return Array.isArray(out) ? (out[0] ?? null) : out
}

/** Fetch a remote PNG and return it as a base64 data URL. */
async function urlToDataUrl(url: string): Promise<string> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Fetch result ${res.status}`)
  const buf = Buffer.from(await res.arrayBuffer())
  return `data:image/png;base64,${buf.toString('base64')}`
}

/**
 * Remove the background from an image given as a data URL (or any URL Replicate
 * can fetch). Returns a transparent PNG data URL, or null if removal is
 * unavailable/failed so the caller can fall back.
 */
export async function removeBackground(imageDataUrl: string): Promise<string | null> {
  const token = process.env.REPLICATE_API_TOKEN
  if (!token) return null

  try {
    // `Prefer: wait` makes Replicate hold the request open until the prediction
    // finishes (up to ~60s), avoiding a separate polling loop for typical logos.
    const res = await fetch(modelEndpoint(), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Prefer: 'wait',
      },
      body: JSON.stringify({
        input: {
          image: imageDataUrl,
          format: 'png',
          // Keep soft edges/shadows rather than a hard 0/255 alpha cutout.
          alpha_matting: true,
        },
      }),
    })

    if (!res.ok) {
      console.error('Replicate bg-removal HTTP error', res.status, await res.text())
      return null
    }

    let pred = (await res.json()) as ReplicatePrediction

    // If `Prefer: wait` didn't fully resolve, poll the prediction to completion.
    let guard = 0
    while ((pred.status === 'starting' || pred.status === 'processing') && pred.urls?.get && guard < 60) {
      await new Promise(r => setTimeout(r, 1000))
      const poll = await fetch(pred.urls.get, { headers: { Authorization: `Bearer ${token}` } })
      if (!poll.ok) break
      pred = (await poll.json()) as ReplicatePrediction
      guard++
    }

    if (pred.status !== 'succeeded') {
      console.error('Replicate bg-removal failed', pred.status, pred.error)
      return null
    }

    const outUrl = firstOutputUrl(pred.output)
    if (!outUrl) return null
    return await urlToDataUrl(outUrl)
  } catch (err) {
    console.error('removeBackground error', err)
    return null
  }
}

/** Remove backgrounds from many images in parallel; failed items fall back to original. */
export async function removeBackgroundBatch(images: string[]): Promise<string[]> {
  return Promise.all(
    images.map(async img => {
      const cleaned = await removeBackground(img)
      return cleaned ?? img
    }),
  )
}
