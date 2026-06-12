import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const maxDuration = 60

// AI-assisted graphic placement detection.
// Vision model returns NORMALIZED coordinates only (0..1) for the garment,
// collar seam, and artwork bounding box. All inch dimensions are then computed
// server-side from the tech pack measurement table — the model never invents
// dimensions.
export async function POST(req: NextRequest) {
  const { image, measurements, sizeIndex = 2 } = await req.json() // default size M

  if (!image) return NextResponse.json({ error: 'Design image required' }, { status: 400 })
  if (!process.env.OPENAI_API_KEY) return NextResponse.json({ error: 'No API key configured' }, { status: 500 })

  const chestRow: number[] | undefined = measurements?.['Chest (Flat)']
  const lengthRow: number[] | undefined = measurements?.['Length']
  if (!chestRow || !lengthRow) {
    return NextResponse.json({ error: 'Measurement table must include "Chest (Flat)" and "Length" rows' }, { status: 400 })
  }
  const chestIn = chestRow[sizeIndex] // flat width across chest, in inches
  const lengthIn = lengthRow[sizeIndex] // HPS/collar seam to hem, in inches

  const visionPrompt = `You are analyzing a flat product photo of a garment with a printed graphic/logo on it.

Return ONLY a JSON object (no markdown, no commentary) with normalized coordinates where 0,0 is the top-left of the IMAGE and 1,1 is the bottom-right:

{
  "garment": { "left": 0.0, "right": 0.0, "top": 0.0, "bottom": 0.0 },
  "collar_seam_y": 0.0,
  "artwork": { "left": 0.0, "top": 0.0, "right": 0.0, "bottom": 0.0 },
  "artwork_found": true,
  "placement_zone": "center chest"
}

Definitions:
- "garment": bounding box of the garment fabric only at its widest point (chest area), excluding background and shadows.
- "collar_seam_y": vertical position of the FRONT collar seam (where the neck ribbing meets the body fabric, at the lowest center point of the neckline).
- "artwork": tight bounding box around the printed graphic/logo only.
- "artwork_found": false if no graphic is visible on the garment.
- "placement_zone": one of "center chest", "left chest", "right chest", "full front", "lower front".

Be precise about the artwork bounding box edges.`

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      max_tokens: 500,
      response_format: { type: 'json_object' },
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: visionPrompt },
          { type: 'image_url', image_url: { url: image, detail: 'high' } },
        ],
      }],
    }),
  })

  if (!res.ok) {
    const text = await res.text()
    return NextResponse.json({ error: `OpenAI ${res.status}: ${text}` }, { status: 500 })
  }

  const data = await res.json()
  let parsed
  try {
    parsed = JSON.parse(data.choices[0].message.content)
  } catch {
    return NextResponse.json({ error: 'Could not parse AI analysis' }, { status: 500 })
  }

  if (!parsed.artwork_found || !parsed.artwork || !parsed.garment) {
    return NextResponse.json({ error: 'No graphic detected on the garment' }, { status: 422 })
  }

  const g = parsed.garment
  const a = parsed.artwork
  const collarY = parsed.collar_seam_y ?? g.top

  const garmentW = Math.max(g.right - g.left, 0.01)
  const collarToHem = Math.max(g.bottom - collarY, 0.01)

  // Scale: garment pixel width at chest = chest flat measurement (inches);
  // collar seam to hem = body length measurement (inches).
  const round = (n: number) => Math.round(n * 4) / 4 // nearest 0.25"
  const widthIn = round(((a.right - a.left) / garmentW) * chestIn)
  const heightIn = round(((a.bottom - a.top) / collarToHem) * lengthIn)
  const topOffsetIn = round(((a.top - collarY) / collarToHem) * lengthIn)

  // Horizontal alignment relative to garment centerline
  const garmentCenterX = (g.left + g.right) / 2
  const artworkCenterX = (a.left + a.right) / 2
  const offsetFraction = (artworkCenterX - garmentCenterX) / garmentW
  const offsetIn = round(Math.abs(offsetFraction) * chestIn)
  const alignment = Math.abs(offsetFraction) < 0.04
    ? 'Centered on front body'
    : `${offsetIn} in ${offsetFraction < 0 ? 'left' : 'right'} of center front`

  const zone: string = parsed.placement_zone ?? 'center chest'
  const zoneLabel = zone.charAt(0).toUpperCase() + zone.slice(1)

  const description = [
    `${zoneLabel} logo placement`,
    `Width: ${widthIn} in`,
    `Height: ${heightIn} in (scale proportionally)`,
    `Top of artwork: ${topOffsetIn} in below front collar seam`,
    `Horizontal alignment: ${alignment}`,
  ].join('\n')

  return NextResponse.json({
    location: 'Front',
    description,
    widthIn,
    heightIn,
    topOffsetIn,
    alignment,
    zone,
  })
}
