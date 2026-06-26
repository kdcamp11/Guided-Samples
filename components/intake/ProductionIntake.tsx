'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowLeft, ArrowUp, Sparkles, Loader2, CheckCircle2, Circle, UploadCloud,
  Send, Ruler, X,
} from 'lucide-react'
import { analyzeFiles } from '@/lib/prepress/analyze'
import {
  assess, buildTechPack, extractFieldsLocal, type PacketFields, type IntakeEvidence,
} from '@/lib/intake/requirements'
import { getDefaultSizeProfile, saveSizeProfile } from '@/lib/sizing/store'
import { fromCsv, fromStandardFit } from '@/lib/sizing/sources'
import { resolveGarmentType } from '@/lib/fitBlocks'
import type { SizeProfile, SizeRow } from '@/lib/sizing/types'
import type { PrepressReport, UploadedFile } from '@/lib/prepress/types'
import type { TechPackData } from '@/components/Phase6Production'
import { useAssistant } from '@/components/assistant/AssistantProvider'

interface Props {
  files: File[]
  report: PrepressReport
  onBack: () => void
  onComplete: (tp: TechPackData) => void
}

interface Msg { id: string; role: 'user' | 'assistant'; text: string }
let uid = 0
const mkId = () => `m${++uid}`
const now = () => new Date().toISOString()

const ACCEPT = '.png,.jpg,.jpeg,.webp,.gif,.tif,.tiff,.svg,.pdf,.csv,.xls,.xlsx,.zip'

export default function ProductionIntake({ files, report: initialReport, onBack, onComplete }: Props) {
  const [fields, setFields] = useState<PacketFields>({})
  const [sizeProfile, setSizeProfile] = useState<SizeProfile | null>(null)
  const [artworkViews, setArtworkViews] = useState({ front: false, back: false, side: false })
  const [hasMockup, setHasMockup] = useState(false)
  const [hasArtwork, setHasArtwork] = useState(false)
  const [pantones, setPantones] = useState<{ color: string; name: string }[]>([])
  const [messages, setMessages] = useState<Msg[]>([])
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const seeded = useRef(false)

  const evidence: IntakeEvidence = useMemo(
    () => ({ fields, sizeProfile, artworkViews, hasArtwork, hasMockup, pantones }),
    [fields, sizeProfile, artworkViews, hasArtwork, hasMockup, pantones],
  )
  const a = useMemo(() => assess(evidence), [evidence])

  const { publish } = useAssistant()
  useEffect(() => {
    publish({ pathType: 'upload', currentStage: 'intake', missingItems: a.missingRequired.map(s => s.label) })
  }, [a.missingRequired, publish])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, busy])

  const push = (m: Msg) => setMessages(prev => [...prev, m])
  const assistant = (text: string) => push({ id: mkId(), role: 'assistant', text })

  // Adopt a size profile (and persist it as a reusable source of truth).
  const adoptProfile = useCallback((p: SizeProfile) => {
    setSizeProfile(p)
    try { saveSizeProfile(p) } catch {}
  }, [])

  // Pull artwork/mockup signals + any embedded size chart out of an analyzed
  // report. Returns the MERGED evidence so callers can assess fresh state
  // immediately (React state updates are async).
  const ingestReport = useCallback(async (report: PrepressReport) => {
    const classified = report.files.map(f => f.classification).filter((c): c is NonNullable<typeof c> => !!c?.classified)
    const newViews = {
      front: artworkViews.front || classified.some(c => c.views.front),
      back: artworkViews.back || classified.some(c => c.views.back),
      side: artworkViews.side || classified.some(c => c.views.side),
    }
    const newMockup = hasMockup || classified.some(c => c.isGarmentMockup)
    const newArtwork = hasArtwork || report.files.some(f => f.kind === 'raster' || f.kind === 'vector')
    setArtworkViews(newViews); setHasMockup(newMockup); setHasArtwork(newArtwork)
    const chart = await extractChart(report.files)
    return { newViews, newMockup, newArtwork, chart }
  }, [artworkViews, hasMockup, hasArtwork])

  // Build a size profile from an uploaded chart: a parsed CSV table, or an image
  // read by the vision extractor. Returns null if no chart is found.
  async function extractChart(uploaded: UploadedFile[]): Promise<SizeProfile | null> {
    // 1) CSV / spreadsheet table already parsed by inspect.ts
    for (const f of uploaded) {
      const t = f.inspection?.table
      if (f.inspection?.isSizeChart && t?.headers?.length) {
        const text = [t.headers.join(','), ...t.rows.map(r => r.join(','))].join('\n')
        const p = fromCsv(text, f.name)
        if (p) return p
      }
    }
    // 2) image of a chart → AI extraction (skip obvious garment mockups)
    for (const f of uploaded) {
      if (f.kind !== 'raster' || !f.dataUrl || f.classification?.isGarmentMockup) continue
      try {
        const res = await fetch('/api/sizing/extract', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ image: f.dataUrl }),
        })
        const j = await res.json()
        if (j?.ok && Array.isArray(j.rows) && j.rows.length) {
          const unit: SizeRow['unit'] = j.unit === 'cm' ? 'cm' : 'in'
          const rows: SizeRow[] = j.rows.map((r: { label: string; values: Record<string, number> }) => ({
            key: r.label.toLowerCase().replace(/[^a-z0-9]+/g, '_'), label: r.label, unit, values: r.values,
          }))
          return { id: crypto.randomUUID?.() ?? `sp-${Date.now()}`, name: f.name, source: 'upload', sizes: j.sizes.map(String), rows, createdAt: now(), updatedAt: now() }
        }
      } catch {}
    }
    return null
  }

  // ── Seed the conversation from the first analysis ────────────────────────────
  useEffect(() => {
    if (seeded.current) return
    seeded.current = true
    ;(async () => {
      setBusy(true)
      const { chart } = await ingestReport(initialReport)
      if (chart) adoptProfile(chart)
      else {
        const saved = getDefaultSizeProfile()
        if (saved) adoptProfile(saved)
      }
      const found: string[] = []
      const cls = initialReport.files.map(f => f.classification).filter(Boolean)
      if (cls.some(c => c?.isGarmentMockup)) found.push('a garment mockup')
      const views = ['front', 'back', 'side'].filter(v => cls.some(c => (c?.views as Record<string, boolean>)?.[v]))
      if (views.length) found.push(`${views.join(' + ')} artwork`)
      if (chart) found.push('a size chart')
      const intro = found.length
        ? `Thanks — I can see ${found.join(', ')}. Let's fill in the rest so this is ready for production.`
        : `Thanks for uploading. Let's put together everything production needs.`
      assistant(intro)
      setBusy(false)
    })()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // After the intro, whenever the first gap changes, the next prompt is implicit
  // in the checklist; we only ask proactively right after seeding.
  const askedFirst = useRef(false)
  useEffect(() => {
    if (!seeded.current || askedFirst.current || busy || messages.length === 0) return
    if (a.firstGap) { askedFirst.current = true; assistant(a.firstGap.detail(evidence)) }
  }, [a.firstGap, busy, messages.length]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Typed answer → parse into fields + reply ─────────────────────────────────
  async function send(text: string) {
    const clean = text.trim()
    if (!clean || busy) return
    setDraft('')
    push({ id: mkId(), role: 'user', text: clean })
    // Instant, deterministic capture (e.g. "250 gsm and screen printed" → both
    // fabric weight + decoration), so boxes check immediately. The LLM refines below.
    const local = extractFieldsLocal(clean)
    const mergedFields = { ...fields, ...local }
    if (Object.keys(local).length) setFields(mergedFields)
    setBusy(true)
    try {
      // Assess against the locally-merged fields so the next question is accurate.
      const localAssess = assess({ ...evidence, fields: mergedFields })
      const res = await fetch('/api/intake', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: clean,
          history: messages.slice(-8).map(m => ({ role: m.role, text: m.text })),
          have: localAssess.rows.filter(r => r.satisfied).map(r => r.slot.label),
          missing: localAssess.missingRequired.map(s => ({ id: s.id, label: s.label, ask: s.detail({ ...evidence, fields: mergedFields }) })),
          ready: localAssess.ready,
        }),
      })
      const j = await res.json()
      if (j?.ok) {
        if (j.captured && Object.keys(j.captured).length) setFields(prev => ({ ...prev, ...j.captured }))
        assistant(j.reply || 'Got it.')
      } else {
        assistant('I couldn’t process that just now — you can also upload a file, or try rephrasing.')
      }
    } catch {
      assistant('Network hiccup — please try again, or upload the file instead.')
    } finally {
      setBusy(false)
    }
  }

  // ── Mid-conversation uploads ─────────────────────────────────────────────────
  async function onAddFiles(list: FileList | File[]) {
    const arr = Array.from(list).filter(f => ACCEPT.includes((f.name.split('.').pop() || '').toLowerCase()))
    if (!arr.length) return
    push({ id: mkId(), role: 'user', text: `📎 Uploaded ${arr.map(f => f.name).join(', ')}` })
    setBusy(true)
    try {
      const report = await analyzeFiles(arr, { sizeProfile: getDefaultSizeProfile() })
      const { newViews, newMockup, newArtwork, chart } = await ingestReport(report)
      if (chart) adoptProfile(chart)
      // Assess against the freshly-merged evidence so the next prompt is accurate.
      const local: IntakeEvidence = {
        fields, sizeProfile: chart ?? sizeProfile,
        artworkViews: newViews, hasArtwork: newArtwork, hasMockup: newMockup, pantones,
      }
      const tail = nextLine(local)
      if (chart) {
        assistant(`Read your size chart — ${chart.rows.length} measurements across ${chart.sizes.join('/')}. ${tail}`)
      } else {
        const cls = report.files.map(f => f.classification).filter(Boolean)
        const views = ['front', 'back', 'side'].filter(v => cls.some(c => (c?.views as Record<string, boolean>)?.[v]))
        const bits = [cls.some(c => c?.isGarmentMockup) && 'garment mockup', views.length && `${views.join(' + ')} artwork`].filter(Boolean)
        assistant(bits.length ? `Got your ${bits.join(' and ')}. ${tail}` : `Added. ${tail}`)
      }
    } catch {
      assistant('Couldn’t read that file — please try another format (PNG, SVG, PDF, CSV).')
    } finally {
      setBusy(false)
    }
  }

  function nextLine(e: IntakeEvidence): string {
    const next = assess(e).missingRequired[0]
    return next ? next.detail(e) : 'That’s everything required — you can send this to production.'
  }

  function useStandardFit() {
    const g = resolveGarmentType(fields.garmentType || 'short sleeve tee') ?? 'short_sleeve_tee'
    const p = fromStandardFit(g)
    if (!p) return
    adoptProfile(p)
    assistant(`Started you on the GRACE ${p.name} standard fit — fully editable. ${nextLine({ ...evidence, sizeProfile: p })}`)
  }

  function submitToProduction() {
    const tp = buildTechPack(evidence)
    if (sizeProfile) { try { saveSizeProfile({ ...sizeProfile, isDefault: true }) } catch {} }
    setSent(true)
    onComplete(tp)
  }

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6">
        <button onClick={onBack} className="flex items-center gap-1.5 text-xs text-grace-stone hover:text-grace-ink transition-colors mb-5">
          <ArrowLeft size={14}/> Back
        </button>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-5">
          {/* Conversation */}
          <div className="flex flex-col rounded-2xl border border-grace-border bg-white overflow-hidden h-[68vh] min-h-[480px]">
            <div className="flex items-center gap-2.5 px-4 py-3 border-b border-grace-border">
              <span className="w-8 h-8 rounded-full bg-grace-ink text-white flex items-center justify-center"><Sparkles size={15}/></span>
              <div>
                <p className="text-sm font-bold text-grace-ink leading-none">Production Intake</p>
                <p className="text-[10px] text-grace-stone mt-0.5 tracking-wide">GRACE checks your packet against what production needs</p>
              </div>
            </div>

            <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3.5">
              {messages.map(m => (
                <div key={m.id} className={m.role === 'user' ? 'flex justify-end' : ''}>
                  <div className={m.role === 'user'
                    ? 'max-w-[82%] rounded-2xl rounded-br-sm bg-grace-ink text-white text-[13px] leading-relaxed px-3.5 py-2'
                    : 'max-w-[88%] text-[13px] leading-relaxed text-grace-ink whitespace-pre-wrap'}>
                    {m.text}
                  </div>
                </div>
              ))}
              {busy && <div className="flex items-center gap-2 text-grace-stone text-xs"><Loader2 size={13} className="animate-spin"/> Reading…</div>}
            </div>

            {/* Composer */}
            <div className="border-t border-grace-border p-2.5 space-y-2">
              {!sizeProfile && (
                <button onClick={useStandardFit} className="text-[11px] font-semibold text-grace-ink bg-grace-mist border border-grace-border rounded-full px-3 py-1.5 hover:bg-grace-ink hover:text-white transition-colors inline-flex items-center gap-1.5">
                  <Ruler size={11}/> Start from a GRACE standard fit
                </button>
              )}
              <div className="flex items-end gap-2 rounded-xl border border-grace-border bg-grace-mist px-3 py-2 focus-within:border-grace-ink transition-colors">
                <button onClick={() => fileInput.current?.click()} title="Upload a file" className="text-grace-stone hover:text-grace-ink shrink-0 pb-0.5">
                  <UploadCloud size={17}/>
                </button>
                <input ref={fileInput} type="file" multiple accept={ACCEPT} className="hidden"
                  onChange={e => { if (e.target.files) onAddFiles(e.target.files); e.target.value = '' }} />
                <textarea
                  value={draft} onChange={e => setDraft(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(draft) } }}
                  rows={1} placeholder="Answer here, or upload a file…"
                  className="flex-1 bg-transparent resize-none text-[13px] text-grace-ink placeholder:text-grace-stone/60 focus:outline-none max-h-24"
                />
                <button onClick={() => send(draft)} disabled={!draft.trim() || busy}
                  className="w-7 h-7 rounded-lg bg-grace-ink text-white flex items-center justify-center disabled:opacity-30 hover:bg-zinc-800 transition-colors shrink-0">
                  <ArrowUp size={15}/>
                </button>
              </div>
            </div>
          </div>

          {/* Live packet checklist */}
          <div className="rounded-2xl border border-grace-border bg-white p-4 h-fit lg:sticky lg:top-6">
            <div className="flex items-center justify-between mb-3">
              <p className="text-[11px] font-bold tracking-[0.14em] uppercase text-grace-ink">Production packet</p>
              <span className="text-[11px] font-semibold text-grace-stone tabular-nums">{a.requiredDone}/{a.requiredTotal}</span>
            </div>
            <div className="h-1.5 rounded-full bg-grace-mist overflow-hidden mb-4">
              <div className="h-full bg-grace-ink transition-all" style={{ width: `${(a.requiredDone / a.requiredTotal) * 100}%` }}/>
            </div>

            <div className="space-y-1.5">
              {a.rows.map(({ slot, satisfied, detail }) => (
                <div key={slot.id} className="flex items-start gap-2">
                  {satisfied
                    ? <CheckCircle2 size={15} className="text-green-600 shrink-0 mt-0.5"/>
                    : <Circle size={15} className={`shrink-0 mt-0.5 ${slot.required ? 'text-grace-stone/50' : 'text-grace-stone/30'}`}/>}
                  <div className="min-w-0">
                    <p className={`text-[12px] font-semibold leading-tight ${satisfied ? 'text-grace-ink' : 'text-grace-ink'}`}>
                      {slot.label}{!slot.required && <span className="text-grace-stone/60 font-normal"> · optional</span>}
                    </p>
                    <p className="text-[10px] text-grace-stone leading-snug truncate">{detail}</p>
                  </div>
                </div>
              ))}
            </div>

            <button
              onClick={submitToProduction}
              disabled={!a.ready || sent}
              className="w-full mt-4 inline-flex items-center justify-center gap-2 rounded-xl bg-grace-ink text-white text-[12px] font-bold tracking-widest uppercase py-3 hover:bg-zinc-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {sent ? <CheckCircle2 size={15}/> : <Send size={14}/>}
              {sent ? 'Sent to production' : a.ready ? 'Send to production' : `${a.missingRequired.length} item${a.missingRequired.length > 1 ? 's' : ''} left`}
            </button>
            {!a.ready && <p className="text-[10px] text-grace-stone text-center mt-2 leading-snug">Answer in chat or upload files to complete the packet.</p>}
          </div>
        </div>
      </div>
    </div>
  )
}
