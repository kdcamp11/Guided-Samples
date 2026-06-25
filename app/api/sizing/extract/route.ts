import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const maxDuration = 60

// AI-assisted size-chart extraction. The client sends an image (a photo/screenshot,
// or a PDF's first page already rasterized). A vision model reads the table and
// returns structured rows. It never invents a chart: if none is visible it says so,
// and if the model/key is unavailable the caller falls back to manual entry.
export async function POST(req: NextRequest) {
  const { image } = await req.json().catch(() => ({}))
  if (!image) return NextResponse.json({ ok: false, reason: 'No image provided.' }, { status: 400 })
  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ ok: false, reason: 'AI extraction isn’t configured. You can enter the chart manually.' })
  }

  const prompt = `You are reading an apparel SIZE CHART from an image.
Return ONLY JSON, no markdown:
{
  "found": true,
  "unit": "in" | "cm",
  "sizes": ["XS","S","M","L","XL"],
  "rows": [ { "label": "Chest", "values": { "XS": 18, "S": 19, "M": 20 } } ]
}
Rules:
- Use the exact size column headers and measurement row labels shown.
- values must be numbers only (no quotes, no units). Omit a cell if unreadable.
- If the image contains no size chart, return { "found": false }.
- Do not invent measurements that aren't visible.`

  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      body: JSON.stringify({
        model: 'gpt-4o',
        max_tokens: 1500,
        response_format: { type: 'json_object' },
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: { url: image, detail: 'high' } },
          ],
        }],
      }),
    })
    if (!res.ok) {
      const text = await res.text()
      return NextResponse.json({ ok: false, reason: `Extraction service error (${res.status}). Try manual entry.`, detail: text.slice(0, 200) })
    }
    const data = await res.json()
    let parsed: { found?: boolean; unit?: string; sizes?: string[]; rows?: { label: string; values: Record<string, number> }[] }
    try { parsed = JSON.parse(data.choices[0].message.content) } catch {
      return NextResponse.json({ ok: false, reason: 'Could not parse the extracted chart. Try a clearer image or manual entry.' })
    }
    if (!parsed.found || !Array.isArray(parsed.sizes) || !Array.isArray(parsed.rows) || !parsed.sizes.length) {
      return NextResponse.json({ ok: false, reason: 'No size chart was detected in that file.' })
    }
    // Sanitize: keep numeric values only.
    const sizes = parsed.sizes.map(String)
    const rows = parsed.rows
      .filter(r => r && r.label && r.values)
      .map(r => ({
        label: String(r.label),
        values: Object.fromEntries(Object.entries(r.values)
          .filter(([, v]) => typeof v === 'number' && isFinite(v as number))),
      }))
      .filter(r => Object.keys(r.values).length)
    if (!rows.length) return NextResponse.json({ ok: false, reason: 'The chart was found but no measurements could be read.' })
    return NextResponse.json({ ok: true, unit: parsed.unit === 'cm' ? 'cm' : 'in', sizes, rows })
  } catch (e) {
    return NextResponse.json({ ok: false, reason: 'Extraction failed. You can enter the chart manually.', detail: String(e).slice(0, 200) })
  }
}
