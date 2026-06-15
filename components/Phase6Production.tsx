'use client'

import { useState } from 'react'
import { ArrowLeft, Download, CheckCircle2, Loader2, AlertCircle, Image as ImageIcon, CreditCard, ShieldCheck, Clock, Zap, ArrowRight } from 'lucide-react'
import { AppState } from '@/app/page'
import { createClient } from '@/lib/supabase'
import AuthModal from '@/components/AuthModal'
import SizeBreakdownPicker from '@/components/SizeBreakdownPicker'
import { emptyBreakdown, sumBreakdown, type SizeBreakdown } from '@/lib/sizes'
import { MIN_PRODUCTION_QUANTITY } from '@/lib/pricing'

const LOGO_FEE = 4
const ACTIVATION_FEE = 25
// Per-piece production (bulk) pricing in dollars. Mirrors lib/pricing.ts.
const GARMENT_PRICES: Record<string, number> = {
  'T-Shirt': 25,
  'Hoodie': 45,
  'Zip Hoodie': 50,
  'Crewneck': 35,
  'Track Jacket': 35,
  'Track Pants': 35,
  'Windbreaker': 40,
  'Basketball Jersey': 20,
  'Basketball Shorts': 25,
  'Sweatpants': 35,
}

interface Props {
  state: AppState
  techPack: TechPackData
  onBack: () => void
  projectId: string | null
  onEnsureProject: () => Promise<string | null>
  onExpertHelp?: () => void
}

export interface TechPackData {
  styleInfo: Record<string, string>
  measurements: Record<string, number[]>
  pantones: { color: string; name: string }[]
  placements: { location: string; description: string }[]
}

export default function Phase6Production({ state, techPack, onBack, projectId, onEnsureProject, onExpertHelp }: Props) {
  const [notes, setNotes] = useState('')
  const [sampleLoading, setSampleLoading] = useState(false)
  const [directLoading, setDirectLoading] = useState(false)
  const [downloadDone, setDownloadDone] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const [authOpen, setAuthOpen] = useState(false)
  const [pendingPath, setPendingPath] = useState<'sample' | 'direct' | null>(null)
  const [sampleBreakdown, setSampleBreakdown] = useState<SizeBreakdown>(emptyBreakdown)
  const [directBreakdown, setDirectBreakdown] = useState<SizeBreakdown>(emptyBreakdown)

  const logo = state.logo?.dataUrl
  const garment = state.garment?.dataUrl
  const preview = state.design?.previewDataUrl || state.preview?.images?.[0]

  const garmentType = techPack.styleInfo.garmentType || state.garment?.type || 'T-Shirt'
  const garmentPrice = GARMENT_PRICES[garmentType] ?? 35
  const styleName = techPack.styleInfo.styleName ?? ''

  const logoCount = techPack.placements.length
  const extraLogos = Math.max(0, logoCount - 1)
  const logoFeeTotal = extraLogos * LOGO_FEE

  // Sample fee is double the per-piece production price (one sample piece).
  const sampleFee = garmentPrice * 2
  // Sample path: no MOQ — 1+ pieces, broken down by size
  const sampleQty = Math.max(1, sumBreakdown(sampleBreakdown))
  const sampleTotal = ACTIVATION_FEE + sampleFee * sampleQty + logoFeeTotal * sampleQty

  // DIRECT path: MOQ enforced, size breakdown drives quantity
  const directQty = sumBreakdown(directBreakdown)
  const directBelowMOQ = directQty < MIN_PRODUCTION_QUANTITY
  const productionTotal = (garmentPrice + logoFeeTotal) * Math.max(1, directQty)
  const depositAmount = Math.round(productionTotal / 2 * 100) / 100

  const assets = [
    { label: 'Logo', image: logo, present: !!logo },
    { label: 'Garment', image: garment, present: !!garment },
    { label: 'Preview', image: preview, present: !!preview },
    { label: 'Tech Pack', image: null, present: !!techPack.styleInfo.styleName },
  ]

  async function getAuthHeader(): Promise<Record<string, string>> {
    const sb = createClient()
    if (!sb) return {}
    const { data: { session } } = await sb.auth.getSession()
    if (!session?.access_token) return {}
    return { 'Authorization': `Bearer ${session.access_token}` }
  }

  const runCheckout = async (path: 'sample' | 'direct') => {
    const setLoading = path === 'sample' ? setSampleLoading : setDirectLoading
    setLoading(true)
    setErrorMsg('')
    try {
      // Sign-in gate: payment + order tracking require a real user identity.
      const auth = await getAuthHeader()
      if (!auth.Authorization) {
        setPendingPath(path)
        setAuthOpen(true)
        setLoading(false)
        return
      }

      // Make sure the design is persisted so the order has a project to attach to.
      const pid = projectId ?? (await onEnsureProject())
      if (!pid) throw new Error('Could not save your project. Please try again.')

      const endpoint = path === 'sample' ? '/api/checkout/sample' : '/api/checkout/direct'
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...auth },
        body: JSON.stringify({
          design_order_id: pid,
          garment_type: garmentType,
          style_name: styleName,
          extra_logos: extraLogos,
          size_breakdown: path === 'direct' ? directBreakdown : sampleBreakdown,
          notes,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Checkout failed')
      window.location.href = data.url
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : 'Payment setup failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const handleSampleCheckout = () => runCheckout('sample')
  const handleDirectCheckout = () => runCheckout('direct')

  const handleAuthSuccess = () => {
    setAuthOpen(false)
    const next = pendingPath
    setPendingPath(null)
    if (next) runCheckout(next)
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
      <AuthModal
        open={authOpen}
        onClose={() => { setAuthOpen(false); setPendingPath(null) }}
        onSuccess={handleAuthSuccess}
      />
      <div className="mb-5 flex items-start justify-between">
        <div>
          <p className="phase-header">Phase 6</p>
          <h1 className="text-xl font-bold text-gray-900">Send to Production</h1>
          <p className="text-gray-500 text-sm mt-1">Choose your production path</p>
        </div>
        <button onClick={onBack} className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-700 transition-colors mt-1">
          <ArrowLeft size={14}/>
          Back
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-4 max-w-5xl">

        {/* Left: Package preview + notes + path selection */}
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

          {/* Error message */}
          {errorMsg && (
            <div className="card bg-red-50 border-red-100">
              <div className="flex items-start gap-3">
                <AlertCircle size={18} className="text-red-400 shrink-0 mt-0.5"/>
                <p className="text-xs text-red-600">{errorMsg}</p>
              </div>
            </div>
          )}

          {/* Path selection cards */}
          <div>
            <p className="text-xs font-semibold text-gray-700 mb-3">Choose Your Production Path</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">

              {/* Card 1 — First Piece Sample (SAMPLE path) */}
              <div className="card flex flex-col border-brand-green/20 hover:border-brand-green/40 transition-colors">
                <div className="flex items-start justify-between mb-2">
                  <h3 className="text-sm font-semibold text-gray-900">First Piece Sample</h3>
                  <span className="text-[10px] font-medium px-2 py-0.5 bg-brand-green/10 text-brand-green rounded-full whitespace-nowrap ml-2">
                    Recommended
                  </span>
                </div>
                <p className="text-[11px] text-gray-500 leading-relaxed mb-3">
                  Receive a real sample before committing to full production. Review the physical product, request changes if needed, or stop the project.
                </p>
                <div className="flex items-center gap-1.5 text-[11px] text-gray-400 mb-4">
                  <Clock size={11}/>
                  Adds ~2–3 weeks
                </div>

                <div className="border-t border-slate-100 pt-3 mb-3 space-y-1.5 text-xs">
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-2">Sizes <span className="normal-case font-normal text-gray-400">(no minimum)</span></p>
                  <SizeBreakdownPicker
                    value={sampleBreakdown}
                    onChange={setSampleBreakdown}
                    minTotal={0}
                    disabled={sampleLoading || directLoading}
                  />
                </div>

                <div className="border border-slate-100 rounded-xl p-3 mb-4 space-y-1.5 text-xs">
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-1">What you pay today</p>
                  <div className="flex justify-between text-gray-600">
                    <span>Activation Fee</span>
                    <span>${ACTIVATION_FEE}.00</span>
                  </div>
                  <div className="flex justify-between text-gray-600">
                    <span>Sample Fee ({sampleQty} pc{sampleQty > 1 ? 's' : ''} × ${sampleFee})</span>
                    <span>${(sampleFee * sampleQty).toFixed(2)}</span>
                  </div>
                  {extraLogos > 0 && (
                    <div className="flex justify-between text-gray-600">
                      <span>Extra Logos</span>
                      <span>+${(logoFeeTotal * sampleQty).toFixed(2)}</span>
                    </div>
                  )}
                  <div className="border-t border-slate-100 pt-1.5 flex justify-between font-semibold text-gray-900">
                    <span>Total due today</span>
                    <span>${sampleTotal.toFixed(2)}</span>
                  </div>
                </div>

                <button
                  onClick={handleSampleCheckout}
                  disabled={sampleLoading || directLoading || sampleQty < 1}
                  className="btn-primary mt-auto w-full flex items-center justify-center gap-2 text-xs py-2.5"
                >
                  {sampleLoading ? <Loader2 size={13} className="animate-spin"/> : <CreditCard size={13}/>}
                  {sampleLoading ? 'Redirecting…' : `Order ${sampleQty} Sample${sampleQty > 1 ? 's' : ''}`}
                </button>
              </div>

              {/* Card 2 — Start Production (DIRECT path) */}
              <div className="card flex flex-col hover:border-slate-300 transition-colors">
                <div className="flex items-start justify-between mb-2">
                  <h3 className="text-sm font-semibold text-gray-900">Start Production</h3>
                  <span className="text-[10px] font-medium px-2 py-0.5 bg-slate-100 text-slate-600 rounded-full whitespace-nowrap ml-2">
                    Repeat orders
                  </span>
                </div>
                <p className="text-[11px] text-gray-500 leading-relaxed mb-3">
                  Skip the sample and go straight to manufacturing. Faster turnaround for designs you've already validated.
                </p>
                <div className="flex items-center gap-1.5 text-[11px] text-gray-400 mb-4">
                  <Zap size={11}/>
                  Fastest option
                </div>

                <div className="border-t border-slate-100 pt-3 mb-3 space-y-1.5 text-xs">
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-2">Sizes <span className="normal-case font-normal text-gray-400">(min {MIN_PRODUCTION_QUANTITY} pieces)</span></p>
                  <SizeBreakdownPicker
                    value={directBreakdown}
                    onChange={setDirectBreakdown}
                    minTotal={MIN_PRODUCTION_QUANTITY}
                    disabled={sampleLoading || directLoading}
                  />
                </div>

                {directQty > 0 && (
                  <div className="border border-slate-100 rounded-xl p-3 mb-4 space-y-1.5 text-xs">
                    <div className="flex justify-between text-gray-600">
                      <span>Subtotal ({directQty} pcs)</span>
                      <span>${productionTotal.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-gray-600">
                      <span>50% Production Deposit</span>
                      <span>${depositAmount.toFixed(2)}</span>
                    </div>
                    <p className="text-[10px] text-gray-400">Remaining 50% due after quality check</p>
                    <div className="border-t border-slate-100 pt-1.5 flex justify-between font-semibold text-gray-900">
                      <span>Due today</span>
                      <span>${depositAmount.toFixed(2)}</span>
                    </div>
                  </div>
                )}

                <button
                  onClick={handleDirectCheckout}
                  disabled={sampleLoading || directLoading || directBelowMOQ}
                  className="btn-secondary mt-auto w-full flex items-center justify-center gap-2 text-xs py-2.5 disabled:opacity-50"
                >
                  {directLoading ? <Loader2 size={13} className="animate-spin"/> : <CreditCard size={13}/>}
                  {directLoading
                    ? 'Redirecting…'
                    : directBelowMOQ
                      ? `Add ${MIN_PRODUCTION_QUANTITY - directQty} more pieces`
                      : 'Start Production'}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-center gap-1.5 text-[10px] text-gray-400 mt-3">
              <ShieldCheck size={11}/>
              Secure checkout via Stripe
            </div>
          </div>
        </div>

        {/* Right: Download + package contents */}
        <div className="space-y-3">

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

          {onExpertHelp && (
            <div className="card border-grace-ink/10 bg-grace-mist">
              <p className="text-[10px] font-bold tracking-widest uppercase text-grace-stone mb-1">Need Help?</p>
              <p className="text-xs font-bold text-grace-ink mb-1">Work with GRACE Studios</p>
              <p className="text-[11px] text-grace-stone leading-relaxed mb-3">
                Stuck or want a professional to take it from here? Our team handles design, tech pack, and production direction end-to-end.
              </p>
              <button
                onClick={onExpertHelp}
                className="w-full flex items-center justify-center gap-1.5 py-2 px-4 rounded-full bg-grace-ink text-white text-[10px] font-bold tracking-widest uppercase hover:bg-zinc-800 transition-colors"
              >
                Talk to an Expert <ArrowRight size={11}/>
              </button>
            </div>
          )}

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
  if (si.fabricContent || si.fabricWeight || si.construction) {
    lines.push('FABRIC & MATERIAL')
    if (si.fabricContent) lines.push(`  Content: ${si.fabricContent}`)
    if (si.fabricWeight) lines.push(`  Weight: ${si.fabricWeight}`)
    if (si.construction) lines.push(`  Construction: ${si.construction}`)
    if (si.fabricFinish) lines.push(`  Finish: ${si.fabricFinish}`)
    if (si.careInstructions) lines.push(`  Care: ${si.careInstructions}`)
    lines.push('')
  }
  const supplierNotes = notes || si.supplierNotes
  if (supplierNotes) lines.push('NOTES TO SUPPLIER', supplierNotes, '')
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
