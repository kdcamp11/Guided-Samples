import { NextRequest } from 'next/server'
import { garmentPrompt } from '@/lib/prompts'

export const runtime = 'nodejs'
export const maxDuration = 120

export async function POST(req: NextRequest) {
  const { prompt, referenceImage, view, frontImage, quality = 'clean' } = await req.json()

  if (!prompt) {
    return new Response(`data: ${JSON.stringify({ type: 'error', message: 'Prompt required' })}\n\n`, {
      status: 400, headers: { 'Content-Type': 'text/event-stream' },
    })
  }

  const { readable, writable } = new TransformStream()
  const writer = writable.getWriter()
  const enc = new TextEncoder()
  const send = (data: object) => writer.write(enc.encode(`data: ${JSON.stringify(data)}\n\n`))

  ;(async () => {
    try {
      await send({ type: 'status', message: 'Connecting to AI...' })
      if (process.env.OPENAI_API_KEY) {
        const viewLabel = (view ?? 'front') as string
        const qualityLabel = quality as 'clean' | 'realistic'
        await send({ type: 'status', message: `Generating ${viewLabel} view (${qualityLabel})...` })

        const referenceForView = (view && view !== 'front' && frontImage) ? frontImage : referenceImage
        const built = garmentPrompt({ userPrompt: prompt, hasReference: !!referenceForView, view: viewLabel, quality: qualityLabel })
        const image = await generateWithOpenAI(built, referenceForView, qualityLabel)
        await send({ type: 'status', message: 'Processing result...' })
        await send({ type: 'complete', source: 'openai', image, view: viewLabel, quality: qualityLabel })
      } else {
        const viewLabel = view ?? 'front'
        const svg = generateGarmentSVG(viewLabel)
        await send({ type: 'complete', source: 'svg', image: svgToDataUrl(svg), view: viewLabel, quality })
      }
    } catch (err) {
      console.error('Garment generation failed:', err)
      const msg = err instanceof Error ? err.message : 'Generation failed. Please try again.'
      await send({ type: 'error', message: msg })
    } finally {
      await writer.close()
    }
  })()

  return new Response(readable, {
    headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
  })
}

async function generateWithOpenAI(builtPrompt: string, referenceImage?: string, quality: 'clean' | 'realistic' = 'clean'): Promise<string> {
  const apiQuality = 'medium'
  if (referenceImage) {
    const base64Data = referenceImage.split(',')[1]
    const mimeMatch = referenceImage.match(/^data:(image\/\w+);base64,/)
    const mime = mimeMatch ? mimeMatch[1] : 'image/png'

    const buffer = Buffer.from(base64Data, 'base64')
    const blob = new Blob([buffer], { type: mime })

    const form = new FormData()
    form.append('model', 'gpt-image-2')
    form.append('image[]', blob, `reference.${mime.split('/')[1]}`)
    form.append('prompt', builtPrompt)
    form.append('n', '1')
    form.append('size', '1024x1024')
    form.append('quality', apiQuality)

    const res = await fetch('https://api.openai.com/v1/images/edits', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      body: form,
    })

    if (!res.ok) {
      const text = await res.text()
      throw new Error(`OpenAI edits ${res.status}: ${text}`)
    }

    const data = await res.json()
    return `data:image/png;base64,${(data.data as { b64_json: string }[])[0].b64_json}`
  }

  const res = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'gpt-image-2',
      prompt: builtPrompt,
      n: 1,
      size: '1024x1024',
      quality: apiQuality,
    }),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`OpenAI ${res.status}: ${text}`)
  }

  const data = await res.json()
  return `data:image/png;base64,${(data.data as { b64_json: string }[])[0].b64_json}`
}

function svgToDataUrl(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}


function generateGarmentSVG(view?: string): string {
  const label = view ? view.charAt(0).toUpperCase() + view.slice(1) : 'Front'
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 340" width="300" height="340">
  <path d="M90,80 L60,100 L45,160 L50,280 L250,280 L255,160 L240,100 L210,80 Q175,65 150,72 Q125,65 90,80 Z" fill="#e0e0e0"/>
  <path d="M60,100 L20,140 L25,220 L60,225 L70,160 L90,80" fill="#e0e0e0"/>
  <path d="M240,100 L280,140 L275,220 L240,225 L230,160 L210,80" fill="#e0e0e0"/>
  <text x="150" y="318" text-anchor="middle" font-family="Arial, sans-serif" font-size="11" fill="#888">${label}</text>
</svg>`
}
