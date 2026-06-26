import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const maxDuration = 60

// Production-intake conversation brain. Completeness is decided in code
// (lib/intake/requirements); this endpoint only (1) parses concrete values the
// user typed into structured fields and (2) phrases the next question. It never
// invents data: a value is captured only if the user actually stated it.

const FIELD_KEYS = [
  'garmentType', 'styleName', 'brandName', 'colorway', 'season', 'gender',
  'fabricContent', 'fabricWeight', 'construction', 'careInstructions',
  'decorationMethod', 'placementNotes',
] as const

interface Body {
  message: string
  history?: { role: 'user' | 'assistant'; text: string }[]
  have?: string[]      // human labels of satisfied items
  missing?: { id: string; label: string; ask: string }[]
  ready?: boolean
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as Body
  const { message, history = [], have = [], missing = [], ready } = body

  if (!process.env.OPENAI_API_KEY) {
    // Deterministic fallback so the flow still works without a key.
    const next = missing[0]
    const reply = ready
      ? 'Everything required is in. You can send this to production whenever you’re ready.'
      : next ? next.ask : 'Thanks — add anything else you have and I’ll keep checking.'
    return NextResponse.json({ ok: true, reply, captured: {} })
  }

  const system = `You are GRACE's production intake specialist. You are helping a user assemble a COMPLETE production packet for a garment by collecting missing details one at a time, warmly and concisely.

Rules:
- NEVER invent or assume values. Capture a field ONLY if the user explicitly stated it in their latest message.
- Extract EVERY field the user mentions in a single message — one message can fill multiple fields. E.g. "250 gsm and screen printed" → { "fabricWeight": "250 gsm", "decorationMethod": "Screen print" }. "heavyweight 100% cotton tee for my brand Atlas" → { "garmentType": "heavyweight t-shirt", "fabricContent": "100% cotton", "brandName": "Atlas" }.
- Capture into this exact JSON shape (omit fields the user didn't provide):
  "captured": { ${FIELD_KEYS.map(k => `"${k}"?`).join(', ')} }
- Normalize lightly (e.g. fabricWeight "240 gsm"; decorationMethod one of: Screen print, DTG, Embroidery, Sublimation, Heat transfer vinyl, Puff print).
- placementNotes: capture a free-text description of where/size of graphics if described.
- After capturing, write ONE short reply: acknowledge what you got, then ask for the SINGLE most important still-missing item. If the user asks a question, answer it briefly first.
- If nothing is missing, congratulate them and say they can send to production.
- Keep replies under 60 words. No markdown headers, no lists unless truly needed.

Return ONLY JSON: { "captured": {...}, "reply": "..." }`

  const context = `STILL MISSING (in priority order): ${missing.length ? missing.map(m => `${m.label} — ${m.ask}`).join(' | ') : 'nothing — packet is complete'}.
ALREADY HAVE: ${have.length ? have.join(', ') : 'nothing yet'}.`

  const messages = [
    { role: 'system' as const, content: system },
    { role: 'system' as const, content: context },
    ...history.slice(-8).map(h => ({ role: h.role as 'user' | 'assistant', content: h.text })),
    { role: 'user' as const, content: message },
  ]

  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      body: JSON.stringify({ model: 'gpt-4o', temperature: 0.3, max_tokens: 400, response_format: { type: 'json_object' }, messages }),
    })
    if (!res.ok) {
      const text = await res.text()
      return NextResponse.json({ ok: false, reason: `Intake service error (${res.status}).`, detail: text.slice(0, 200) })
    }
    const data = await res.json()
    let parsed: { captured?: Record<string, unknown>; reply?: string }
    try { parsed = JSON.parse(data.choices[0].message.content) } catch {
      return NextResponse.json({ ok: false, reason: 'Could not parse intake response.' })
    }
    // Sanitize captured to known string fields only.
    const captured: Record<string, string> = {}
    for (const k of FIELD_KEYS) {
      const v = parsed.captured?.[k]
      if (typeof v === 'string' && v.trim()) captured[k] = v.trim()
    }
    return NextResponse.json({ ok: true, reply: String(parsed.reply ?? '').trim() || 'Got it.', captured })
  } catch (e) {
    return NextResponse.json({ ok: false, reason: 'Intake failed.', detail: String(e).slice(0, 200) })
  }
}
