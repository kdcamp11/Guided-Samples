import { NextRequest, NextResponse } from 'next/server'

const NOTIFY_EMAIL = 'gracestudios111@gmail.com'

export async function POST(req: NextRequest) {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'Email not configured' }, { status: 500 })
  }

  const { fullName, brand, email, project, quantity } = await req.json()

  if (!fullName || !brand || !email || !project) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const html = `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px">
      <div style="background:#1a6b4a;border-radius:12px;padding:20px 24px;margin-bottom:24px">
        <h1 style="color:#fff;font-size:20px;margin:0">New Creative Direction Inquiry</h1>
        <p style="color:rgba(255,255,255,0.7);font-size:13px;margin:6px 0 0">GRACE Enterprise — gracestudios.com</p>
      </div>

      <table style="width:100%;border-collapse:collapse;font-size:14px">
        <tr>
          <td style="padding:10px 0;border-bottom:1px solid #f0f0f0;color:#888;width:140px;vertical-align:top">Full Name</td>
          <td style="padding:10px 0;border-bottom:1px solid #f0f0f0;color:#111;font-weight:600">${escHtml(fullName)}</td>
        </tr>
        <tr>
          <td style="padding:10px 0;border-bottom:1px solid #f0f0f0;color:#888;vertical-align:top">Brand</td>
          <td style="padding:10px 0;border-bottom:1px solid #f0f0f0;color:#111;font-weight:600">${escHtml(brand)}</td>
        </tr>
        <tr>
          <td style="padding:10px 0;border-bottom:1px solid #f0f0f0;color:#888;vertical-align:top">Email</td>
          <td style="padding:10px 0;border-bottom:1px solid #f0f0f0">
            <a href="mailto:${escHtml(email)}" style="color:#1a6b4a;font-weight:600">${escHtml(email)}</a>
          </td>
        </tr>
        <tr>
          <td style="padding:10px 0;border-bottom:1px solid #f0f0f0;color:#888;vertical-align:top">Est. Quantity</td>
          <td style="padding:10px 0;border-bottom:1px solid #f0f0f0;color:#111">${escHtml(quantity || 'Not specified')}</td>
        </tr>
      </table>

      <div style="margin-top:24px">
        <p style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:#888;margin-bottom:8px">Project Description</p>
        <div style="background:#f8f8f8;border-radius:10px;padding:16px;font-size:14px;color:#333;line-height:1.6;white-space:pre-wrap">${escHtml(project)}</div>
      </div>

      <div style="margin-top:32px;padding-top:16px;border-top:1px solid #f0f0f0">
        <a href="mailto:${escHtml(email)}" style="display:inline-block;background:#1a6b4a;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-size:13px;font-weight:600">
          Reply to ${escHtml(fullName)} →
        </a>
      </div>
    </div>
  `

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      from: process.env.RESEND_FROM_EMAIL ?? 'orders@grace.design',
      to: NOTIFY_EMAIL,
      reply_to: email,
      subject: `Creative Direction Inquiry — ${brand} (${fullName})`,
      html,
    }),
  })

  if (!res.ok) {
    const body = await res.text()
    console.error('[creative-direction] resend error:', body)
    return NextResponse.json({ error: 'Failed to send notification' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}

function escHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
