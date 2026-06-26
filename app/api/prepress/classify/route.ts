import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const maxDuration = 60

// Vision classification for production-review artwork checks.
// The model actually LOOKS at the uploaded image and reports whether it's a
// garment mockup/flat and which garment views (front/back/side) are shown — so
// the "Front/back/side artwork" and "Garment mockups" checks reflect the image,
// not the filename. It never invents: if it can't tell, fields stay false and
// the caller falls back to filename heuristics.
export async function POST(req: NextRequest) {
  const { image } = await req.json().catch(() => ({}))
  if (!image) return NextResponse.json({ ok: false, reason: 'No image provided.' }, { status: 400 })
  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ ok: false, reason: 'Vision classification isn’t configured.' })
  }

  const prompt = `You are inspecting a single image uploaded for apparel production.
Return ONLY JSON, no markdown:
{
  "is_garment_mockup": true,
  "views": { "front": false, "back": false, "side": false },
  "graphics_present": true
}
Definitions:
- "is_garment_mockup": true if the image shows a garment — a technical flat, a product mockup, or an on-body/photographed garment. false if it is only a logo/graphic on a plain background, a size chart, a document, or unrelated.
- "views.front": a front view of the garment is shown (neckline/chest facing the viewer).
- "views.back": a back view of the garment is shown.
- "views.side": a side/sleeve profile view is shown.
- A single image may show MULTIPLE views side by side (e.g. front and back) — set every view that is actually visible to true.
- "graphics_present": true if any printed/embroidered artwork, text, or logo appears on the garment.
Only report what is clearly visible. If unsure about a view, set it false.`

  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      body: JSON.stringify({
        model: 'gpt-4o',
        max_tokens: 300,
        response_format: { type: 'json_object' },
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: { url: image, detail: 'low' } },
          ],
        }],
      }),
    })
    if (!res.ok) {
      const text = await res.text()
      return NextResponse.json({ ok: false, reason: `Classification error (${res.status}).`, detail: text.slice(0, 200) })
    }
    const data = await res.json()
    let parsed: { is_garment_mockup?: boolean; views?: { front?: boolean; back?: boolean; side?: boolean }; graphics_present?: boolean }
    try { parsed = JSON.parse(data.choices[0].message.content) } catch {
      return NextResponse.json({ ok: false, reason: 'Could not parse classification.' })
    }
    return NextResponse.json({
      ok: true,
      isGarmentMockup: !!parsed.is_garment_mockup,
      views: {
        front: !!parsed.views?.front,
        back: !!parsed.views?.back,
        side: !!parsed.views?.side,
      },
      graphicsPresent: !!parsed.graphics_present,
    })
  } catch (e) {
    return NextResponse.json({ ok: false, reason: 'Classification failed.', detail: String(e).slice(0, 200) })
  }
}
