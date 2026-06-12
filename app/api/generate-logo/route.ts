import { NextRequest } from 'next/server'
import { logoPrompt } from '@/lib/prompts'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function POST(req: NextRequest) {
  const { prompt, referenceImage } = await req.json()

  if (!prompt) {
    return new Response(`data: ${JSON.stringify({ type: 'error', message: 'Prompt required' })}\n\n`, {
      status: 400, headers: { 'Content-Type': 'text/event-stream' },
    })
  }

  const style = detectStyle(prompt)
  const color = detectColor(prompt)
  const { readable, writable } = new TransformStream()
  const writer = writable.getWriter()
  const enc = new TextEncoder()
  const send = (data: object) => writer.write(enc.encode(`data: ${JSON.stringify(data)}\n\n`))

  ;(async () => {
    try {
      await send({ type: 'status', message: 'Connecting to AI...' })
      if (process.env.OPENAI_API_KEY) {
        await send({ type: 'status', message: 'Generating your logo...' })
        const images = await generateWithOpenAI(
          logoPrompt({ userPrompt: prompt, hasReference: !!referenceImage }),
          referenceImage,
        )
        await send({ type: 'status', message: 'Processing result...' })
        await send({ type: 'complete', source: 'openai', images, svgs: images.map(() => null), style, color })
      } else {
        await send({ type: 'status', message: 'Building logo...' })
        const svgs = [
          generateSVGLogo(prompt), generateSVGLogo(prompt, 'variant1'),
          generateSVGLogo(prompt, 'variant2'), generateSVGLogo(prompt, 'variant3'),
          generateSVGLogo(prompt, 'variant4'),
        ]
        await send({ type: 'complete', source: 'svg', images: svgs.map(svgToDataUrl), svgs, style, color })
      }
    } catch (err) {
      console.error('Logo generation failed:', err)
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

async function generateWithOpenAI(builtPrompt: string, referenceImage?: string): Promise<string[]> {
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
    form.append('n', '2')
    form.append('size', '1024x1024')
    form.append('quality', 'medium')

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
    return (data.data as { b64_json: string }[]).map(d => `data:image/png;base64,${d.b64_json}`)
  }

  // Standard generation without reference
  const res = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'gpt-image-2',
      prompt: builtPrompt,
      n: 2,
      size: '1024x1024',
      output_format: 'png',
      quality: 'medium',
    }),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`OpenAI ${res.status}: ${text}`)
  }

  const data = await res.json()
  return (data.data as { b64_json: string }[]).map(d => `data:image/png;base64,${d.b64_json}`)
}

function svgToDataUrl(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

function detectColor(prompt: string): string {
  const p = prompt.toLowerCase()
  if (p.includes('forest green') || p.includes('green')) return '#184D3E'
  if (p.includes('black')) return '#1a1a1a'
  if (p.includes('navy') || p.includes('blue')) return '#1a2c5e'
  if (p.includes('red')) return '#8b1a1a'
  if (p.includes('gold') || p.includes('yellow')) return '#b8860b'
  if (p.includes('white')) return '#e8e8e8'
  return '#184D3E'
}

function detectStyle(prompt: string): string {
  const p = prompt.toLowerCase()
  if (p.includes('vintage') || p.includes('athletic')) return 'Athletic, Vintage'
  if (p.includes('minimal') || p.includes('minimalist')) return 'Minimal, Clean'
  if (p.includes('luxury') || p.includes('fashion')) return 'Luxury, Fashion'
  if (p.includes('streetwear') || p.includes('street')) return 'Streetwear, Urban'
  if (p.includes('crest') || p.includes('badge')) return 'Crest, Heritage'
  return 'Athletic, Vintage'
}

function extractBrandName(prompt: string): string {
  const calledMatch = prompt.match(/called\s+([A-Z][A-Za-z]+)/i)
  if (calledMatch) return calledMatch[1].toUpperCase()
  const brandMatch = prompt.match(/brand\s+(?:called\s+)?([A-Z][A-Za-z]+)/i)
  if (brandMatch) return brandMatch[1].toUpperCase()
  const forMatch = prompt.match(/for\s+([A-Z][A-Za-z]+)/i)
  if (forMatch) return forMatch[1].toUpperCase()
  const p = prompt.toLowerCase()
  if (p.includes('grace')) return 'GRACE'
  return 'BRAND'
}

function generateSVGLogo(prompt: string, variant?: string): string {
  const color = detectColor(prompt)
  const name = extractBrandName(prompt)
  const style = detectStyle(prompt)
  const hasArrow = prompt.toLowerCase().includes('arrow')
  const isVintage = style.includes('Vintage') || style.includes('Athletic')
  const isMinimal = style.includes('Minimal')
  const isLuxury = style.includes('Luxury')
  const isCrest = style.includes('Crest')

  if (variant === 'variant1' || (!variant && isVintage)) {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 200" width="400" height="200">
  <defs>
    <style>
      .logo-text { font-family: 'Impact', 'Arial Black', sans-serif; fill: ${color}; }
      .sub-text { font-family: 'Arial', sans-serif; fill: ${color}; letter-spacing: 4px; }
    </style>
  </defs>
  <text x="200" y="110" text-anchor="middle" class="logo-text" font-size="88" font-weight="900">${name}</text>
  ${hasArrow ? `<line x1="60" y1="130" x2="170" y2="130" stroke="${color}" stroke-width="2"/>
  <polygon points="100,122 120,130 100,138" fill="${color}"/>
  <line x1="230" y1="130" x2="340" y2="130" stroke="${color}" stroke-width="2"/>
  <polygon points="300,122 320,130 300,138" fill="${color}"/>` : `<line x1="60" y1="128" x2="340" y2="128" stroke="${color}" stroke-width="1.5"/>`}
  <text x="200" y="155" text-anchor="middle" class="sub-text" font-size="13">FAITH IN MOTION</text>
</svg>`
  }

  if (variant === 'variant2' || isMinimal) {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 200" width="400" height="200">
  <text x="200" y="115" text-anchor="middle" font-family="'Arial', sans-serif" font-size="72" font-weight="300" fill="${color}" letter-spacing="12">${name}</text>
  <line x1="100" y1="125" x2="300" y2="125" stroke="${color}" stroke-width="0.8"/>
</svg>`
  }

  if (variant === 'variant3' || isLuxury) {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 200" width="400" height="200">
  <rect x="150" y="30" width="100" height="2" fill="${color}"/>
  <text x="200" y="105" text-anchor="middle" font-family="'Georgia', serif" font-size="64" font-weight="700" fill="${color}" letter-spacing="6">${name}</text>
  <text x="200" y="130" text-anchor="middle" font-family="'Arial', sans-serif" font-size="10" fill="${color}" letter-spacing="8">ENTERPRISE</text>
  <rect x="150" y="145" width="100" height="2" fill="${color}"/>
</svg>`
  }

  if (variant === 'variant4' || isCrest) {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 200" width="400" height="200">
  <path d="M200,30 L240,50 L260,90 L250,140 L200,160 L150,140 L140,90 L160,50 Z" fill="none" stroke="${color}" stroke-width="2"/>
  <text x="200" y="108" text-anchor="middle" font-family="'Impact', sans-serif" font-size="42" font-weight="900" fill="${color}">${name}</text>
</svg>`
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 200" width="400" height="200">
  <text x="200" y="110" text-anchor="middle" font-family="'Impact', 'Arial Black', sans-serif" font-size="80" font-weight="900" fill="${color}">${name}</text>
  ${hasArrow ? `<polygon points="60,135 180,128 60,121" fill="${color}"/><polygon points="340,135 220,128 340,121" fill="${color}"/>` : ''}
</svg>`
}
