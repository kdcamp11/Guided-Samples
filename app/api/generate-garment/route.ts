import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function POST(req: NextRequest) {
  const { prompt } = await req.json()

  if (!prompt) {
    return NextResponse.json({ error: 'Prompt required' }, { status: 400 })
  }

  const garmentType = detectGarmentType(prompt)
  const color = detectColor(prompt)

  if (process.env.OPENAI_API_KEY) {
    try {
      const images = await generateWithOpenAI(prompt, garmentType)
      return NextResponse.json({
        source: 'openai',
        images,
        svgs: images.map(() => null),
        garmentType,
        color,
      })
    } catch (err) {
      console.error('OpenAI garment generation failed, falling back to SVG:', err)
    }
  }

  const base = generateGarmentSVG(garmentType, color)
  const svgs = [
    base,
    generateGarmentSVG(garmentType, color, 'front'),
    generateGarmentSVG(garmentType, color, 'back'),
    generateGarmentSVG(garmentType, color, 'left'),
    generateGarmentSVG(garmentType, color, 'right'),
  ]
  return NextResponse.json({
    source: 'svg',
    images: svgs.map(svgToDataUrl),
    svgs,
    garmentType,
    color,
  })
}

async function generateWithOpenAI(userPrompt: string, garmentType: string): Promise<string[]> {
  const prompt = `A professional flat-lay product photo of a single blank ${garmentType}. ${userPrompt}.
Front view, centered, no model, no text, no logo, no graphics on the garment.
Studio product shot on a fully transparent background with soft realistic fabric folds and shadows on the garment only.`

  const res = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'gpt-image-1',
      prompt,
      n: 1,
      size: '1024x1024',
      background: 'transparent',
      output_format: 'png',
      quality: 'medium',
    }),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`OpenAI ${res.status}: ${text}`)
  }

  const data = await res.json()
  return (data.data as { b64_json: string }[]).map(
    d => `data:image/png;base64,${d.b64_json}`
  )
}

function svgToDataUrl(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

function detectGarmentType(prompt: string): string {
  const p = prompt.toLowerCase()
  if (p.includes('hoodie') || p.includes('hoody')) return 'hoodie'
  if (p.includes('t-shirt') || p.includes('tshirt') || p.includes('tee')) return 'tshirt'
  if (p.includes('crewneck') || p.includes('sweatshirt')) return 'crewneck'
  if (p.includes('jacket') || p.includes('bomber')) return 'jacket'
  return 'hoodie'
}

function detectColor(prompt: string): string {
  const p = prompt.toLowerCase()
  if (p.includes('black')) return '#1a1a1a'
  if (p.includes('white')) return '#f5f5f5'
  if (p.includes('navy') || p.includes('dark blue')) return '#1a2744'
  if (p.includes('grey') || p.includes('gray')) return '#6b6b6b'
  if (p.includes('cream') || p.includes('off white')) return '#f0ead6'
  if (p.includes('red') || p.includes('burgundy')) return '#5c1a1a'
  if (p.includes('green') || p.includes('forest')) return '#184D3E'
  return '#1a1a1a'
}

function generateGarmentSVG(type: string, color: string, view?: string): string {
  const isDark = color === '#1a1a1a' || color === '#1a2744' || color === '#184D3E' || color === '#5c1a1a'
  const highlight = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'
  const shadow = isDark ? 'rgba(0,0,0,0.5)' : 'rgba(0,0,0,0.15)'
  const label = view ? view.charAt(0).toUpperCase() + view.slice(1) : 'Front'

  if (type === 'hoodie' || type === 'crewneck') {
    const hasHood = type === 'hoodie'
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 340" width="300" height="340">
  <defs>
    <radialGradient id="bodyGrad" cx="50%" cy="30%" r="70%">
      <stop offset="0%" stop-color="${highlight}"/>
      <stop offset="100%" stop-color="${shadow}"/>
    </radialGradient>
  </defs>
  ${hasHood ? `<path d="M110,80 Q100,20 150,15 Q200,20 190,80" fill="${color}" stroke="none"/>
  <path d="M115,80 Q105,30 150,22 Q195,30 185,80" fill="${highlight}"/>` : ''}
  <path d="M90,${hasHood ? '80' : '70'} L60,100 L45,160 L50,280 L250,280 L255,160 L240,100 L210,${hasHood ? '80' : '70'} Q175,${hasHood ? '65' : '55'} 150,${hasHood ? '72' : '62'} Q125,${hasHood ? '65' : '55'} 90,${hasHood ? '80' : '70'} Z" fill="${color}"/>
  <path d="M90,${hasHood ? '80' : '70'} L60,100 L45,160 L50,280 L250,280 L255,160 L240,100 L210,${hasHood ? '80' : '70'} Q175,${hasHood ? '65' : '55'} 150,${hasHood ? '72' : '62'} Q125,${hasHood ? '65' : '55'} 90,${hasHood ? '80' : '70'} Z" fill="url(#bodyGrad)"/>
  <path d="M60,100 L20,140 L25,220 L60,225 L70,160 L90,${hasHood ? '80' : '70'}" fill="${color}"/>
  <path d="M60,100 L20,140 L25,220 L60,225 L70,160 L90,${hasHood ? '80' : '70'}" fill="${highlight}" opacity="0.5"/>
  <path d="M240,100 L280,140 L275,220 L240,225 L230,160 L210,${hasHood ? '80' : '70'}" fill="${color}"/>
  <rect x="18" y="218" width="44" height="10" rx="4" fill="${isDark ? '#333' : '#ddd'}"/>
  <rect x="238" y="218" width="44" height="10" rx="4" fill="${isDark ? '#333' : '#ddd'}"/>
  <rect x="48" y="274" width="204" height="10" rx="4" fill="${isDark ? '#333' : '#ddd'}"/>
  ${hasHood ? `<line x1="145" y1="78" x2="140" y2="120" stroke="${isDark ? '#555' : '#bbb'}" stroke-width="1.5"/>
  <line x1="155" y1="78" x2="160" y2="120" stroke="${isDark ? '#555' : '#bbb'}" stroke-width="1.5"/>` : `<ellipse cx="150" cy="68" rx="35" ry="10" fill="${isDark ? '#333' : '#ddd'}"/>`}
  <text x="150" y="318" text-anchor="middle" font-family="Arial, sans-serif" font-size="11" fill="#888">${label}</text>
</svg>`
  }

  if (type === 'tshirt') {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 300" width="300" height="300">
  <path d="M95,60 L55,90 L40,150 L50,250 L250,250 L260,150 L245,90 L205,60 Q175,45 150,55 Q125,45 95,60 Z" fill="${color}"/>
  <path d="M95,60 L55,90 L40,150 L50,250 L250,250 L260,150 L245,90 L205,60 Q175,45 150,55 Q125,45 95,60 Z" fill="${highlight}"/>
  <path d="M95,60 L55,90 L75,155 L95,60" fill="${shadow}"/>
  <path d="M205,60 L245,90 L225,155 L205,60" fill="${shadow}"/>
  <ellipse cx="150" cy="62" rx="30" ry="9" fill="${isDark ? '#333' : '#ddd'}"/>
  <rect x="38" y="244" width="224" height="10" rx="4" fill="${isDark ? '#333' : '#ddd'}"/>
  <text x="150" y="282" text-anchor="middle" font-family="Arial, sans-serif" font-size="11" fill="#888">${label}</text>
</svg>`
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 340" width="300" height="340">
  <path d="M100,55 L65,90 L45,160 L50,280 L250,280 L255,160 L235,90 L200,55 Q175,42 150,50 Q125,42 100,55 Z" fill="${color}"/>
  <path d="M100,55 L65,90 L45,160 L50,280 L250,280 L255,160 L235,90 L200,55 Q175,42 150,50 Q125,42 100,55 Z" fill="${highlight}"/>
  <path d="M115,55 L130,80 L150,72 L170,80 L185,55 L150,65 Z" fill="${isDark ? '#333' : '#ccc'}"/>
  <line x1="150" y1="72" x2="150" y2="280" stroke="${isDark ? '#555' : '#aaa'}" stroke-width="2"/>
  <path d="M65,90 L25,130 L30,220 L65,225 L70,160 L100,55" fill="${color}"/>
  <path d="M235,90 L275,130 L270,220 L235,225 L230,160 L200,55" fill="${color}"/>
  <rect x="23" y="218" width="44" height="10" rx="4" fill="${isDark ? '#333' : '#ddd'}"/>
  <rect x="233" y="218" width="44" height="10" rx="4" fill="${isDark ? '#333' : '#ddd'}"/>
  <rect x="48" y="274" width="204" height="10" rx="4" fill="${isDark ? '#333' : '#ddd'}"/>
  <text x="150" y="315" text-anchor="middle" font-family="Arial, sans-serif" font-size="11" fill="#888">${label}</text>
</svg>`
}
