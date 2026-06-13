import { NextRequest } from 'next/server'

export const runtime = 'nodejs'
export const maxDuration = 120

export async function POST(req: NextRequest) {
  const { garmentImage, logoImage, placement, extraPrompt } = await req.json()

  const { readable, writable } = new TransformStream()
  const writer = writable.getWriter()
  const enc = new TextEncoder()
  const send = (data: object) => writer.write(enc.encode(`data: ${JSON.stringify(data)}\n\n`))

  ;(async () => {
    try {
      await send({ type: 'status', message: 'Connecting to AI...' })

      if (!process.env.OPENAI_API_KEY) {
        await send({ type: 'error', message: 'No API key configured.' })
        return
      }

      await send({ type: 'status', message: 'Compositing your design...' })

      const basePrompt = logoImage
        ? `Professional apparel product photography. Take this garment and realistically apply the provided logo to the ${placement || 'center chest'}. The logo should look printed or embroidered on the fabric. Studio lighting, white background, photorealistic, no model, no mannequin. Show the full garment.`
        : `Professional apparel product photography of this exact garment design. The garment image includes a printed logo/graphic — keep that logo exactly as shown, in the same position, size, and colors, making it look realistically printed or embroidered on the fabric. Studio lighting, white background, photorealistic, no model, no mannequin. Show the full garment.`
      const prompt = extraPrompt ? `${basePrompt} Additional direction: ${extraPrompt}` : basePrompt

      const form = new FormData()
      form.append('model', 'gpt-image-2')
      form.append('prompt', prompt)
      form.append('n', '2')
      form.append('size', '1024x1024')
      form.append('quality', 'medium')

      // Always include the garment image as the primary input
      if (garmentImage) {
        const garmentBuffer = Buffer.from(garmentImage.split(',')[1], 'base64')
        const garmentMime = garmentImage.match(/^data:(image\/\w+);/)?.[1] ?? 'image/png'
        form.append('image[]', new Blob([garmentBuffer], { type: garmentMime }), `garment.${garmentMime.split('/')[1]}`)
      }

      // Include logo as a second reference image if available
      if (logoImage) {
        const logoBuffer = Buffer.from(logoImage.split(',')[1], 'base64')
        const logoMime = logoImage.match(/^data:(image\/\w+);/)?.[1] ?? 'image/png'
        form.append('image[]', new Blob([logoBuffer], { type: logoMime }), `logo.${logoMime.split('/')[1]}`)
      }

      const endpoint = (garmentImage || logoImage)
        ? 'https://api.openai.com/v1/images/edits'
        : 'https://api.openai.com/v1/images/generations'

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
        body: (garmentImage || logoImage) ? form : JSON.stringify({
          model: 'gpt-image-2', prompt, n: 2, size: '1024x1024', quality: 'medium',
        }),
      })

      if (!res.ok) {
        const text = await res.text()
        throw new Error(`OpenAI ${res.status}: ${text}`)
      }

      await send({ type: 'status', message: 'Processing images...' })
      const data = await res.json()
      const images = (data.data as { b64_json: string }[]).map(d => `data:image/png;base64,${d.b64_json}`)
      await send({ type: 'complete', source: 'openai', images })
    } catch (err) {
      console.error('Preview generation failed:', err)
      await send({ type: 'error', message: err instanceof Error ? err.message : 'Generation failed. Please try again.' })
    } finally {
      await writer.close()
    }
  })()

  return new Response(readable, {
    headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
  })
}
