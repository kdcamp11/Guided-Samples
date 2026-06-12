import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const maxDuration = 60

// Grade rules per size step (inches). Applied up from the M base measurement.
// Down from M reverses the sign.
const GRADE: Record<string, number> = {
  'Chest (Flat)':   1.0,
  'Length':         0.5,
  'Sleeve Length':  0.25,
  'Shoulder':       0.5,
  'Armhole':        0.25,
  'Bottom Opening': 1.0,
}
const SIZES = ['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL']
const M_IDX = 2 // index of size M

// Vision model returns only normalized coordinates (0–1 relative to image).
// All inch values are computed here from those coords + one known scale anchor.
export async function POST(req: NextRequest) {
  const { image, measurements } = await req.json()

  if (!image) return NextResponse.json({ error: 'Garment image required' }, { status: 400 })
  if (!process.env.OPENAI_API_KEY) return NextResponse.json({ error: 'No API key configured' }, { status: 500 })

  // Scale calibrator: use length for size M from existing table, or fall back to 28"
  const existingLength: number[] | undefined = measurements?.['Length']
  const calibratorLengthIn: number = existingLength?.[M_IDX] ?? 28

  const visionPrompt = `Analyze this flat-lay product photo of a garment. Return ONLY a JSON object with normalized coordinates where 0,0 is the top-left of the full image and 1,1 is the bottom-right of the full image.

{
  "collar_seam_y": 0.0,
  "hem_y": 0.0,
  "chest_left_x": 0.0,
  "chest_right_x": 0.0,
  "hem_left_x": 0.0,
  "hem_right_x": 0.0,
  "shoulder_left_x": 0.0,
  "shoulder_right_x": 0.0,
  "shoulder_y": 0.0,
  "left_armhole_bottom_y": 0.0,
  "right_armhole_bottom_y": 0.0,
  "left_sleeve_tip_x": 0.0,
  "left_sleeve_tip_y": 0.0,
  "right_sleeve_tip_x": 0.0,
  "right_sleeve_tip_y": 0.0,
  "has_sleeves": true,
  "garment_type_guess": "t-shirt"
}

Point definitions:
- collar_seam_y: Y coordinate of the front collar seam at center (lowest point of the neckline ribbing meeting the body fabric)
- hem_y: Y coordinate of the bottom hem at center
- chest_left_x / chest_right_x: X coordinates of the outermost garment edges at the chest/underarm level
- hem_left_x / hem_right_x: X coordinates of the garment edges at the bottom hem level
- shoulder_left_x / shoulder_right_x: X coordinates of the shoulder seam endpoints (where sleeve meets body, or outer shoulder edge if sleeveless)
- shoulder_y: Y coordinate of the shoulder seam line
- left_armhole_bottom_y / right_armhole_bottom_y: Y coordinate at the bottom of the armhole opening on each side
- left_sleeve_tip_x / left_sleeve_tip_y: coordinates of the outermost edge of the LEFT sleeve cuff
- right_sleeve_tip_x / right_sleeve_tip_y: coordinates of the outermost edge of the RIGHT sleeve cuff
- has_sleeves: false if sleeveless/vest
- garment_type_guess: one of t-shirt, hoodie, crewneck, jacket, tank, vest, long-sleeve`

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: JSON.stringify({
      model: 'gpt-4o',
      max_tokens: 600,
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
  let p: Record<string, number | boolean | string>
  try {
    p = JSON.parse(data.choices[0].message.content)
  } catch {
    return NextResponse.json({ error: 'Could not parse AI analysis' }, { status: 500 })
  }

  // --- Compute scale from calibrator ---
  const collarY  = p.collar_seam_y as number
  const hemY     = p.hem_y as number
  const normBodyH = Math.max(hemY - collarY, 0.01)

  // For a square 1024×1024 image taken straight-on, x and y pixel scales are equal.
  // inches_per_norm_unit = calibratorLengthIn / normBodyH
  const scale = calibratorLengthIn / normBodyH // inches per normalized unit

  const r = (n: number) => Math.round(n * 4) / 4 // round to nearest 0.25"

  // --- M measurements ---
  const chestLeft  = p.chest_left_x  as number
  const chestRight = p.chest_right_x as number
  const hemLeft    = p.hem_left_x    as number
  const hemRight   = p.hem_right_x   as number
  const shoulderL  = p.shoulder_left_x  as number
  const shoulderR  = p.shoulder_right_x as number
  const shoulderY  = p.shoulder_y    as number
  const armholeL   = p.left_armhole_bottom_y  as number
  const armholeR   = p.right_armhole_bottom_y as number

  const chestFlatM    = r((chestRight - chestLeft) * scale)
  const lengthM       = calibratorLengthIn  // this is our anchor
  const shoulderM     = r((shoulderR - shoulderL) * scale)
  const bottomOpenM   = r((hemRight - hemLeft) * scale)
  const armholeAvgY   = (armholeL + armholeR) / 2
  const armholeM      = r((armholeAvgY - shoulderY) * scale)

  let sleeveLengthM = 0
  if (p.has_sleeves) {
    const lTipX = p.left_sleeve_tip_x  as number
    const lTipY = p.left_sleeve_tip_y  as number
    const rTipX = p.right_sleeve_tip_x as number
    const rTipY = p.right_sleeve_tip_y as number
    // Use average of both sleeves
    const leftDist  = Math.hypot((shoulderL - lTipX), (shoulderY - lTipY))
    const rightDist = Math.hypot((shoulderR - rTipX), (shoulderY - rTipY))
    sleeveLengthM = r(((leftDist + rightDist) / 2) * scale)
  }

  // --- Grade out from M to all sizes ---
  const grade = (baseM: number, rowKey: string, sizeIdx: number): number => {
    const step = GRADE[rowKey] ?? 0.5
    const delta = (sizeIdx - M_IDX) * step
    return r(baseM + delta)
  }

  const detected: Record<string, number[]> = {
    'Chest (Flat)':   SIZES.map((_, i) => grade(chestFlatM, 'Chest (Flat)', i)),
    'Length':         SIZES.map((_, i) => grade(lengthM, 'Length', i)),
    'Sleeve Length':  SIZES.map((_, i) => grade(sleeveLengthM || 24, 'Sleeve Length', i)),
    'Shoulder':       SIZES.map((_, i) => grade(shoulderM, 'Shoulder', i)),
    'Armhole':        SIZES.map((_, i) => grade(armholeM, 'Armhole', i)),
    'Bottom Opening': SIZES.map((_, i) => grade(bottomOpenM, 'Bottom Opening', i)),
  }

  return NextResponse.json({
    measurements: detected,
    garmentType: p.garment_type_guess as string,
    calibrator: { label: 'Length (size M)', value: calibratorLengthIn },
    sizeM: { chestFlatM, lengthM, shoulderM, bottomOpenM, armholeM, sleeveLengthM },
  })
}
