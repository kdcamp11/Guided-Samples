import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { supplierName, supplierEmail, notes, styleInfo, measurements, pantones, placements, logoImage, garmentImage, previewImages } = body

  if (!supplierEmail) {
    return NextResponse.json({ error: 'Supplier email required' }, { status: 400 })
  }

  if (!process.env.RESEND_API_KEY) {
    return NextResponse.json({ sent: false, reason: 'no_email_key' })
  }

  const { Resend } = await import('resend')
  const resend = new Resend(process.env.RESEND_API_KEY)

  const pantoneList = (pantones as { color: string; name: string }[])
    .map(p => `<li><span style="display:inline-block;width:14px;height:14px;background:${p.color};border-radius:3px;vertical-align:middle;margin-right:6px;"></span>${p.name}</li>`)
    .join('')

  const placementList = (placements as { location: string; description: string }[])
    .map(p => `<li><strong>${p.location}:</strong><br>${p.description.replace(/\n/g, '<br>')}</li>`)
    .join('')

  const measurementRows = Object.entries(measurements as Record<string, number[]>)
    .map(([row, vals]) =>
      `<tr><td style="padding:4px 8px;border:1px solid #e2e8f0;">${row}</td>${(vals as number[]).map(v => `<td style="padding:4px 8px;border:1px solid #e2e8f0;text-align:center;">${v}"</td>`).join('')}</tr>`
    ).join('')

  const sizes = ['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL']
  const measurementHeader = `<tr style="background:#f8fafc;">${['Point of Measure', ...sizes].map(s => `<th style="padding:4px 8px;border:1px solid #e2e8f0;text-align:left;font-size:11px;">${s}</th>`).join('')}</tr>`

  // Build attachments from base64 images
  type Attachment = { filename: string; content: string; type: string }
  const attachments: Attachment[] = []
  const toBase64Content = (dataUrl: string) => dataUrl.split(',')[1] ?? ''

  if (logoImage) attachments.push({ filename: 'logo.png', content: toBase64Content(logoImage), type: 'image/png' })
  if (garmentImage) attachments.push({ filename: 'garment.png', content: toBase64Content(garmentImage), type: 'image/png' })
  ;(previewImages as string[] ?? []).forEach((img: string, i: number) => {
    attachments.push({ filename: `preview_${i + 1}.png`, content: toBase64Content(img), type: 'image/png' })
  })

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:700px;margin:0 auto;color:#1a1a1a;">
      <div style="background:#184D3E;padding:24px 32px;border-radius:8px 8px 0 0;">
        <h1 style="color:#fff;margin:0;font-size:22px;">Production Order</h1>
        <p style="color:#a7c4bc;margin:6px 0 0;font-size:13px;">${styleInfo.brandName ?? ''} — ${styleInfo.styleName ?? ''}</p>
      </div>

      <div style="padding:24px 32px;background:#fff;border:1px solid #e2e8f0;border-top:none;">
        <h2 style="font-size:14px;color:#184D3E;margin:0 0 12px;">Style Information</h2>
        <table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:24px;">
          ${Object.entries(styleInfo as Record<string,string>).filter(([,v]) => v).map(([k,v]) =>
            `<tr><td style="padding:5px 0;color:#6b7280;width:180px;">${k.replace(/([A-Z])/g,' $1').trim()}</td><td style="padding:5px 0;color:#1a1a1a;">${v}</td></tr>`
          ).join('')}
        </table>

        ${notes ? `<div style="background:#f8fafc;border-left:3px solid #184D3E;padding:12px 16px;border-radius:4px;margin-bottom:24px;"><p style="margin:0;font-size:13px;color:#374151;">${notes}</p></div>` : ''}

        <h2 style="font-size:14px;color:#184D3E;margin:0 0 12px;">Pantone Colors</h2>
        <ul style="margin:0 0 24px;padding:0 0 0 4px;list-style:none;font-size:13px;">${pantoneList}</ul>

        <h2 style="font-size:14px;color:#184D3E;margin:0 0 12px;">Graphic Placement</h2>
        <ul style="margin:0 0 24px;padding-left:18px;font-size:13px;">${placementList}</ul>

        <h2 style="font-size:14px;color:#184D3E;margin:0 0 12px;">Measurements (inches)</h2>
        <div style="overflow-x:auto;margin-bottom:24px;">
          <table style="border-collapse:collapse;font-size:12px;">${measurementHeader}${measurementRows}</table>
        </div>

        <p style="font-size:12px;color:#9ca3af;margin:0;">Attachments: logo, garment image, and preview renders are included with this email.</p>
      </div>

      <div style="background:#f8fafc;padding:16px 32px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 8px 8px;font-size:11px;color:#9ca3af;">
        Sent via GRACE Enterprise — ${new Date().toLocaleDateString()}
      </div>
    </div>
  `

  const fromName = styleInfo.brandName ?? 'GRACE Enterprise'
  const fromDomain = process.env.RESEND_FROM_EMAIL ?? 'production@graceofficial.app'

  const { error } = await resend.emails.send({
    from: `${fromName} <${fromDomain}>`,
    to: supplierEmail,
    subject: `Production Order: ${styleInfo.styleName ?? 'New Style'} — ${styleInfo.sku ?? ''}`,
    html,
    attachments,
  })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ sent: true, to: supplierEmail })
}
