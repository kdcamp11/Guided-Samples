'use client'

import { useState } from 'react'
import { ArrowLeft, Download, CheckCircle2, Loader2, AlertCircle, Image as ImageIcon, CreditCard, ShieldCheck } from 'lucide-react'
import { AppState } from '@/app/page'

const ACTIVATION_FEE = 100
const LOGO_FEE = 4
const GARMENT_PRICES: Record<string, number> = {
  'T-Shirt': 25,
  'Hoodie': 45,
  'Crewneck': 40,
  'Zip Hoodie': 50,
  'Track Jacket': 35,
  'Windbreaker': 40,
  'Basketball Jersey': 40,
  'Sweatpants': 35,
  'Track Pants': 35,
  'Basketball Shorts': 25,
}

interface Props {
  state: AppState
  techPack: TechPackData
  onBack: () => void
}

export interface TechPackData {
  styleInfo: Record<string, string>
  measurements: Record<string, number[]>
  pantones: { color: string; name: string }[]
  placements: { location: string; description: string }[]
}

export default function Phase6Production({ state, techPack, onBack }: Props) {
  const [notes, setNotes] = useState('')
  const [checkoutLoading, setCheckoutLoading] = useState(false)
  const [downloadDone, setDownloadDone] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  const logo = state.logo?.dataUrl
  const garment = state.garment?.dataUrl
  const preview = state.design?.previewDataUrl || state.preview?.images?.[0]

  const garmentType = techPack.styleInfo.garmentType || state.garment?.type || 'T-Shirt'
  const garmentPrice = GARMENT_PRICES[garmentType] ?? 35

  // Count logo placements; each beyond the first costs $4 extra
  const logoCount = techPack.placements.length
  const extraLogos = Math.max(0, logoCount - 1)
  const logoFeeTotal = extraLogos * LOGO_FEE

  const orderTotal = ACTIVATION_FEE + garmentPrice + logoFeeTotal

  const assets = [
    { label: 'Logo', image: logo, present: !!logo },
    { label: 'Garment', image: garment, present: !!garment },
    { label: 'Preview', image: preview, present: !!preview },
    { label: 'Tech Pack', image: null, present: !!techPack.styleInfo.styleName },
  ]

  const handleCheckout = async () => {
    setCheckoutLoading(true)
    setErrorMsg('')
    try {
      const res = await fetch('/api/create-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          garmentType,
          styleName: techPack.styleInfo.styleName,
          logoCount,
          extraLogos,
          logoFeeTotal,
          notes,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Checkout failed')
      window.location.href = data.url
    } catch (e) {
      console.error(e)
      setErrorMsg(e instanceof Error ? e.message : 'Payment setup failed. Please try again.')
    } finally {
      setCheckoutLoading(false)
    }
  }

  const handleDownload = async () => {
    const JSZip = (await import('jszip')).default
    const zip = new JSZip()

    const b64 = (dataUrl: string) => dataUrl.split(',')[1] ?? ''
    if (logo) zip.file('logo.png', b64(logo), { base64: true })
    if (garment) zip.file('garment.png', b64(garment), { base64: true })
    if (preview) zip.file('design_preview.png', b64(preview), { base64: true })

    const spec = buildSpecSheet(techPack, notes)
    zip.file('tech_pack.txt', spec)
    zip.file('tech_pack.json', JSON.stringify(techPack, null, 2))

    const blob = await zip.generateAsync({ type: 'blob' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    const slug = (techPack.styleInfo.styleName ?? 'production').replace(/\s+/g, '_')
    a.download = `${slug}_production_package.zip`
    a.click()
    URL.revokeObjectURL(url)
    setDownloadDone(true)
  }

  return (
    <div className="p-6 w-full">
      <div className="mb-5 flex items-start justify-between">
        <div>
          <p className="phase-header">Phase 6</p>
          <h1 className="text-xl font-bold text-gray-900">Send to Production</h1>
          <p className="text-gray-500 text-sm mt-1">Review your order and submit for production</p>
        </div>
        <button onClick={onBack} className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-700 transition-colors mt-1">
          <ArrowLeft size={14}/>
          Back
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4 max-w-4xl">

        {/* Left: Package preview + notes */}
        <div className="space-y-4">

          {/* Assets summary */}
          <div className="card">
            <p className="text-xs font-medium text-gray-600 mb-3">Production Package</p>
            <div className="grid grid-cols-4 gap-3">
              {assets.map(({ label, image, present }) => (
                <div key={label} className="text-center">
                  <div className={`rounded-xl overflow-hidden flex items-center justify-center border ${present ? 'border-slate-100 bg-white' : 'border-dashed border-slate-200 bg-slate-50'}`} style={{ height: 88 }}>
                    {image ? (
                      <img src={image} alt={label} className="w-full h-full object-contain p-2"/>
                    ) : (
                      <div className="flex flex-col items-center gap-1 text-gray-300">
                        {present ? <CheckCircle2 size={22} className="text-brand-green"/> : <ImageIcon size={20}/>}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center justify-center gap-1 mt-1.5">
                    <CheckCircle2 size={10} className={present ? 'text-brand-green' : 'text-gray-300'}/>
                    <span className={`text-[11px] ${present ? 'text-gray-600' : 'text-gray-300'}`}>{label}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Logo placements */}
          {techPack.placements.length > 0 && (
            <div className="card">
              <p className="text-xs font-medium text-gray-600 mb-3">
                Logo Placements
                <span className="ml-2 text-[10px] font-normal text-gray-400">
                  {logoCount} location{logoCount !== 1 ? 's' : ''} detected
                  {extraLogos > 0 && ` · +$${logoFeeTotal} additional logo fee`}
                </span>
              </p>
              <div className="space-y-1.5">
                {techPack.placements.map((p, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs">
                    <CheckCircle2 size={12} className="text-brand-green mt-0.5 shrink-0"/>
                    <span className="text-gray-500 shrink-0 w-28">{p.location}</span>
                    <span className="text-gray-700">{p.description}</span>
                    {i === 0 && <span className="ml-auto text-[10px] text-gray-400 shrink-0">included</span>}
                    {i > 0 && <span className="ml-auto text-[10px] text-brand-green shrink-0">+${LOGO_FEE}.00</span>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Notes */}
          <div className="card">
            <p className="text-xs font-medium text-gray-600 mb-2">Order Notes</p>
            <textarea
              className="w-full text-xs rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-gray-700 focus:outline-none focus:border-brand-green resize-none"
              rows={3}
              placeholder="Special instructions, colorway notes, timeline requirements…"
              value={notes}
              onChange={e => setNotes(e.target.value)}
            />
          </div>

          {/* Tech pack preview */}
          <div className="card">
            <p className="text-xs font-medium text-gray-600 mb-3">Tech Pack Preview</p>
            <div className="space-y-1.5 text-xs">
              {Object.entries(techPack.styleInfo).filter(([, v]) => v).map(([k, v]) => (
                <div key={k} className="flex justify-between gap-4">
                  <span className="text-gray-400 shrink-0 capitalize">{k.replace(/([A-Z])/g, ' $1').trim()}</span>
                  <span className="text-gray-700 text-right truncate">{v}</span>
                </div>
              ))}
              {techPack.pantones.length > 0 && (
                <div className="flex items-center gap-1.5 pt-1">
                  {techPack.pantones.map((p, i) => (
                    <div key={i} className="flex items-center gap-1 text-gray-500">
                      <span className="w-3 h-3 rounded-full inline-block shrink-0" style={{ background: p.color }}/>
                      <span>{p.name}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right: Order summary + actions */}
        <div className="space-y-3">

          {errorMsg && (
            <div className="card bg-red-50 border-red-100">
              <div className="flex items-start gap-3">
                <AlertCircle size={18} className="text-red-400 shrink-0 mt-0.5"/>
                <p className="text-xs text-red-600">{errorMsg}</p>
              </div>
            </div>
          )}

          {downloadDone && (
            <div className="card bg-green-50 border-green-100">
              <div className="flex items-start gap-3">
                <CheckCircle2 size={20} className="text-brand-green shrink-0 mt-0.5"/>
                <div>
                  <p className="text-sm font-semibold text-gray-900">Package downloaded!</p>
                  <p className="text-xs text-gray-500 mt-0.5">ZIP includes logo, garment, preview, and full tech pack.</p>
                </div>
              </div>
            </div>
          )}

          {/* Order Summary */}
          <div className="card">
            <p className="text-xs font-medium text-gray-600 mb-3">Order Summary</p>
            <div className="space-y-2 text-xs">
              <div className="flex justify-between text-gray-600">
                <span>Order Activation Fee</span>
                <span>${ACTIVATION_FEE}.00</span>
              </div>
              <div className="flex justify-between text-gray-600">
                <span>{garmentType} Sample</span>
                <span>${garmentPrice}.00</span>
              </div>
              {extraLogos > 0 && (
                <div className="flex justify-between text-gray-600">
                  <span>{extraLogos} Additional Logo{extraLogos > 1 ? 's' : ''} (×${LOGO_FEE})</span>
                  <span>${logoFeeTotal}.00</span>
                </div>
              )}
              <div className="border-t border-slate-100 pt-2 flex justify-between font-semibold text-gray-900 text-sm">
                <span>Total</span>
                <span>${orderTotal}.00</span>
              </div>
            </div>
            <p className="text-[10px] text-gray-400 mt-2">Single sample · USD · One-time payment</p>
          </div>

          <button
            onClick={handleCheckout}
            disabled={checkoutLoading}
            className="btn-primary w-full flex items-center justify-center gap-2 py-3"
          >
            {checkoutLoading ? <Loader2 size={14} className="animate-spin"/> : <CreditCard size={14}/>}
            {checkoutLoading ? 'Redirecting…' : 'Pay & Send to Production'}
          </button>
          <div className="flex items-center justify-center gap-1.5 text-[10px] text-gray-400">
            <ShieldCheck size={11}/>
            Secure checkout via Stripe
          </div>

          <div className="card">
            <p className="text-xs font-medium text-gray-600 mb-3">Download Package</p>
            <button
              onClick={handleDownload}
              className="btn-secondary w-full flex items-center justify-center gap-2"
            >
              <Download size={14}/>
              Download ZIP
            </button>
            <p className="text-[11px] text-gray-400 mt-2 text-center leading-relaxed">
              Logo, garment image, preview render,<br/>and full tech pack
            </p>
          </div>

          <div className="card">
            <p className="text-xs font-medium text-gray-600 mb-2">Package Contents</p>
            <ul className="space-y-1.5">
              {[
                { label: 'Logo file', detail: 'PNG, transparent bg', ok: !!logo },
                { label: 'Garment image', detail: 'PNG, studio shot', ok: !!garment },
                { label: 'Design preview', detail: 'PNG, photorealistic', ok: !!preview },
                { label: 'Tech pack', detail: 'JSON + plain text', ok: !!techPack.styleInfo.styleName },
              ].map(({ label, detail, ok }) => (
                <li key={label} className="flex items-start gap-2">
                  <CheckCircle2 size={12} className={`mt-0.5 shrink-0 ${ok ? 'text-brand-green' : 'text-gray-300'}`}/>
                  <div>
                    <span className={`text-xs ${ok ? 'text-gray-700' : 'text-gray-400'}`}>{label}</span>
                    <span className="text-[10px] text-gray-400 block">{detail}</span>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}

function buildSpecSheet(tp: TechPackData, notes: string): string {
  const si = tp.styleInfo
  const lines: string[] = [
    '=== PRODUCTION ORDER ===',
    '',
    `Style: ${si.styleName ?? ''}   SKU: ${si.sku ?? ''}   Rev: ${si.revision ?? ''}`,
    `Brand: ${si.brandName ?? ''}   Season: ${si.season ?? ''}`,
    `Garment: ${si.garmentType ?? ''}   Gender: ${si.gender ?? ''}   Sizes: ${si.sizeRange ?? ''}`,
    `Designer: ${si.designer ?? ''}   Date: ${si.dateCreated ?? ''}`,
    '',
  ]
  if (notes) lines.push('NOTES', notes, '')
  lines.push('PANTONES')
  tp.pantones.forEach(p => lines.push(`  ${p.color}  ${p.name}`))
  lines.push('')
  lines.push('GRAPHIC PLACEMENT')
  tp.placements.forEach(p => lines.push(`  ${p.location}: ${p.description}`))
  lines.push('')
  lines.push('MEASUREMENTS (inches)')
  lines.push(['Point of Measure', 'XS', 'S', 'M', 'L', 'XL', '2XL', '3XL'].join('\t'))
  Object.entries(tp.measurements).forEach(([row, vals]) =>
    lines.push([row, ...vals.map(String)].join('\t'))
  )
  return lines.filter(l => l !== undefined).join('\n')
}
