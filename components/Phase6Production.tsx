'use client'

import { useState } from 'react'
import { ArrowLeft, Send, Download, CheckCircle2, Loader2, Package, AlertCircle, Image as ImageIcon, CreditCard, ShieldCheck } from 'lucide-react'
import { AppState } from '@/app/page'

const ACTIVATION_FEE = 100
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

type SendState = 'idle' | 'sending' | 'sent' | 'downloaded' | 'error'

export default function Phase6Production({ state, techPack, onBack }: Props) {
  const [supplierName, setSupplierName] = useState('')
  const [supplierEmail, setSupplierEmail] = useState('')
  const [notes, setNotes] = useState('')
  const [sendState, setSendState] = useState<SendState>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const [checkoutLoading, setCheckoutLoading] = useState(false)

  const garmentType = techPack.styleInfo.garmentType || state.garment?.type || 'T-Shirt'
  const garmentPrice = GARMENT_PRICES[garmentType] ?? 35
  const orderTotal = ACTIVATION_FEE + garmentPrice

  const handleCheckout = async () => {
    setCheckoutLoading(true)
    try {
      const res = await fetch('/api/create-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          garmentType,
          styleName: techPack.styleInfo.styleName,
          supplierEmail,
          supplierName,
          notes,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Checkout failed')
      window.location.href = data.url
    } catch (e) {
      console.error(e)
      setErrorMsg(e instanceof Error ? e.message : 'Payment setup failed. Please try again.')
      setSendState('error')
    } finally {
      setCheckoutLoading(false)
    }
  }

  const logo = state.logo?.dataUrl
  const garment = state.garment?.dataUrl
  const preview = state.design?.previewDataUrl || state.preview?.images?.[0]

  const assets = [
    { label: 'Logo', image: logo, present: !!logo },
    { label: 'Garment', image: garment, present: !!garment },
    { label: 'Preview', image: preview, present: !!preview },
    { label: 'Tech Pack', image: null, present: !!(techPack.styleInfo.styleName) },
  ]

  const handleDownload = async () => {
    const JSZip = (await import('jszip')).default
    const zip = new JSZip()

    const b64 = (dataUrl: string) => dataUrl.split(',')[1] ?? ''
    if (logo) zip.file('logo.png', b64(logo), { base64: true })
    if (garment) zip.file('garment.png', b64(garment), { base64: true })
    if (preview) zip.file('design_preview.png', b64(preview), { base64: true })

    const spec = buildSpecSheet(techPack, supplierName, notes)
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
    setSendState('downloaded')
  }

  const handleSend = async () => {
    if (!supplierEmail.trim()) return
    setSendState('sending')
    setErrorMsg('')
    try {
      const res = await fetch('/api/send-production', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          supplierName,
          supplierEmail,
          notes,
          ...techPack,
          logoImage: logo ?? null,
          garmentImage: garment ?? null,
          previewImages: [preview].filter(Boolean),
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Send failed')
      if (data.sent === false && data.reason === 'no_email_key') {
        // No email key configured — fall back to download
        await handleDownload()
        return
      }
      setSendState('sent')
    } catch (e) {
      console.error(e)
      setErrorMsg(e instanceof Error ? e.message : 'Send failed. Please try again.')
      setSendState('error')
    }
  }

  return (
    <div className="p-6 w-full">
      <div className="mb-5 flex items-start justify-between">
        <div>
          <p className="phase-header">Phase 6</p>
          <h1 className="text-xl font-bold text-gray-900">Send to Production</h1>
          <p className="text-gray-500 text-sm mt-1">Send your complete design package to your supplier</p>
        </div>
        <button onClick={onBack} className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-700 transition-colors mt-1">
          <ArrowLeft size={14}/>
          Back
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4 max-w-4xl">

        {/* Left: Package preview + supplier form */}
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

          {/* Supplier details */}
          <div className="card">
            <p className="text-xs font-medium text-gray-600 mb-3">Supplier Details</p>
            <div className="space-y-3">
              <div>
                <label className="text-[11px] text-gray-500 mb-1 block">Supplier / Factory Name</label>
                <input
                  className="input-field text-sm py-2.5"
                  placeholder="e.g. Excel Apparel Co."
                  value={supplierName}
                  onChange={e => setSupplierName(e.target.value)}
                />
              </div>
              <div>
                <label className="text-[11px] text-gray-500 mb-1 block">Supplier Email <span className="text-red-400">*</span></label>
                <input
                  type="email"
                  className="input-field text-sm py-2.5"
                  placeholder="supplier@factory.com"
                  value={supplierEmail}
                  onChange={e => setSupplierEmail(e.target.value)}
                />
              </div>
              <div>
                <label className="text-[11px] text-gray-500 mb-1 block">Notes for Supplier</label>
                <textarea
                  className="textarea-field text-sm"
                  rows={3}
                  placeholder="Special instructions, timeline requirements, minimum order quantities…"
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                />
              </div>
            </div>
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

        {/* Right: Send / download actions */}
        <div className="space-y-3">

          {sendState === 'sent' && (
            <div className="card bg-green-50 border-green-100">
              <div className="flex items-start gap-3">
                <CheckCircle2 size={20} className="text-brand-green shrink-0 mt-0.5"/>
                <div>
                  <p className="text-sm font-semibold text-gray-900">Package sent!</p>
                  <p className="text-xs text-gray-500 mt-0.5">Production order emailed to <strong>{supplierEmail}</strong> with all assets attached.</p>
                </div>
              </div>
            </div>
          )}

          {sendState === 'downloaded' && (
            <div className="card bg-green-50 border-green-100">
              <div className="flex items-start gap-3">
                <CheckCircle2 size={20} className="text-brand-green shrink-0 mt-0.5"/>
                <div>
                  <p className="text-sm font-semibold text-gray-900">Package downloaded!</p>
                  <p className="text-xs text-gray-500 mt-0.5">ZIP includes logo, garment, preview, and full tech pack. Ready to send to your supplier.</p>
                </div>
              </div>
            </div>
          )}

          {sendState === 'error' && (
            <div className="card bg-red-50 border-red-100">
              <div className="flex items-start gap-3">
                <AlertCircle size={18} className="text-red-400 shrink-0 mt-0.5"/>
                <p className="text-xs text-red-600">{errorMsg}</p>
              </div>
            </div>
          )}

          {/* Order Summary */}
          <div className="card border-brand-green/20">
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
              <div className="border-t border-slate-100 pt-2 flex justify-between font-semibold text-gray-900 text-sm">
                <span>Total</span>
                <span>${orderTotal}.00</span>
              </div>
            </div>
            <p className="text-[10px] text-gray-400 mt-2">Single sample · USD · One-time payment</p>
          </div>

          {/* Pay & Send */}
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
            <p className="text-xs font-medium text-gray-600 mb-3">Send Options</p>
            <div className="space-y-2">
              <button
                onClick={handleSend}
                disabled={!supplierEmail.trim() || sendState === 'sending'}
                className="btn-secondary w-full flex items-center justify-center gap-2"
              >
                {sendState === 'sending' ? <Loader2 size={14} className="animate-spin"/> : <Send size={14}/>}
                {sendState === 'sending' ? 'Sending…' : 'Email to Supplier'}
              </button>
              <p className="text-[10px] text-gray-400 text-center">Send assets without payment (testing)</p>
            </div>
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
              Includes logo, garment image,<br/>preview render, and tech pack
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

          <div className="card">
            <p className="text-xs font-medium text-gray-600 mb-2">Configure Email</p>
            <p className="text-[11px] text-gray-400 leading-relaxed">
              Add <code className="bg-slate-100 px-1 rounded text-[10px]">RESEND_API_KEY</code> to your environment to enable direct email sending. Get a free key at <span className="text-brand-green">resend.com</span>.
            </p>
            {process.env.NEXT_PUBLIC_HAS_RESEND === '1' && (
              <div className="mt-2 flex items-center gap-1.5 text-[11px] text-brand-green">
                <CheckCircle2 size={11}/> Email configured
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function buildSpecSheet(tp: TechPackData, supplier: string, notes: string): string {
  const si = tp.styleInfo
  const lines: string[] = [
    '=== PRODUCTION ORDER ===',
    '',
    `Style: ${si.styleName ?? ''}   SKU: ${si.sku ?? ''}   Rev: ${si.revision ?? ''}`,
    `Brand: ${si.brandName ?? ''}   Season: ${si.season ?? ''}`,
    `Garment: ${si.garmentType ?? ''}   Gender: ${si.gender ?? ''}   Sizes: ${si.sizeRange ?? ''}`,
    `Designer: ${si.designer ?? ''}   Date: ${si.dateCreated ?? ''}`,
    supplier ? `Supplier: ${supplier}` : '',
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
