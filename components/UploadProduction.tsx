'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ArrowLeft, ArrowRight, UploadCloud, FileText, Image as ImageIcon, Box,
  CheckCircle2, AlertTriangle, XCircle, Info, Sparkles, Loader2, ChevronDown, Wand2, X, Plus,
} from 'lucide-react'
import { analyzeFiles } from '@/lib/prepress/analyze'
import { runFix } from '@/lib/prepress/fixes'
import { getDefaultSizeProfile } from '@/lib/sizing/store'
import { STATUS_WEIGHT } from '@/lib/prepress/checks'
import { CATEGORY_LABEL, type CheckResult, type PrepressReport, type Severity, type UploadedFile } from '@/lib/prepress/types'
import { useAssistant } from '@/components/assistant/AssistantProvider'
import { downloadTextFile } from '@/lib/prepress/sizeSpec'
import ProductionIntake from '@/components/intake/ProductionIntake'
import type { TechPackData } from '@/components/Phase6Production'

interface Props {
  onBack: () => void
  onContinue: (techPack?: TechPackData) => void
}

const ANALYZING_STEPS = [
  'Reading your files…',
  'Classifying artwork, mockups & documents…',
  'Inspecting resolution, color & dimensions…',
  'Checking specs: tech pack, sizing & placement…',
  'Scoring production readiness…',
]

// .ai / .eps are intentionally NOT accepted — they can't be inspected in-browser
// and suppliers prefer outlined PDF/SVG/PNG. Users are told to export instead.
const ACCEPT = '.png,.jpg,.jpeg,.webp,.gif,.tif,.tiff,.svg,.pdf,.csv,.xls,.xlsx,.zip'
const ALLOWED = new Set(['png', 'jpg', 'jpeg', 'webp', 'gif', 'tif', 'tiff', 'svg', 'pdf', 'csv', 'xls', 'xlsx', 'zip'])
const BLOCKED = new Set(['ai', 'eps'])
const extOf = (name: string) => (name.split('.').pop() || '').toLowerCase()

function stagedIcon(name: string) {
  const e = extOf(name)
  if (['png', 'jpg', 'jpeg', 'webp', 'gif', 'tif', 'tiff'].includes(e)) return <ImageIcon size={14} />
  if (e === 'svg') return <Sparkles size={14} />
  if (['csv', 'xls', 'xlsx'].includes(e)) return <Box size={14} />
  return <FileText size={14} />
}

export default function UploadProduction({ onBack, onContinue }: Props) {
  const [phase, setPhase] = useState<'upload' | 'analyzing' | 'intake'>('upload')
  const [report, setReport] = useState<PrepressReport | null>(null)
  const [dragging, setDragging] = useState(false)
  const [stepIdx, setStepIdx] = useState(0)
  const [fixing, setFixing] = useState<Record<string, boolean>>({})
  const [staged, setStaged] = useState<File[]>([])
  const [notice, setNotice] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (phase !== 'analyzing') return
    setStepIdx(0)
    const t = setInterval(() => setStepIdx(i => Math.min(i + 1, ANALYZING_STEPS.length - 1)), 650)
    return () => clearInterval(t)
  }, [phase])

  // Feed the prepress report to the GRACE Assistant so it can advise on it.
  const { publish } = useAssistant()
  useEffect(() => {
    publish({
      pathType: 'upload',
      currentStage: phase,
      prepressReport: report,
      uploadedFiles: report?.files.map(f => ({ name: f.name, kind: f.kind })),
      missingItems: report ? report.results.filter(r => r.status === 'critical' || r.status === 'warning').map(r => r.label) : undefined,
    })
  }, [phase, report, publish])

  // Stage files (accumulate across multiple drops/selections) instead of
  // analyzing immediately. Rejects .ai/.eps and unsupported types, dedupes.
  const addFiles = useCallback((fileList: FileList | File[]) => {
    const incoming = Array.from(fileList)
    const accepted: File[] = []
    const rejected: string[] = []
    for (const f of incoming) {
      ALLOWED.has(extOf(f.name)) ? accepted.push(f) : rejected.push(f.name)
    }
    if (accepted.length) {
      setStaged(prev => {
        const seen = new Set(prev.map(f => `${f.name}:${f.size}`))
        const merged = [...prev]
        for (const f of accepted) {
          const key = `${f.name}:${f.size}`
          if (!seen.has(key)) { seen.add(key); merged.push(f) }
        }
        return merged
      })
    }
    const hasAiEps = rejected.some(n => BLOCKED.has(extOf(n)))
    setNotice(
      rejected.length === 0 ? null
      : hasAiEps
        ? `.ai and .eps files aren’t accepted — export to PDF, SVG, or PNG and add it again. (${rejected.length} skipped)`
        : `${rejected.length} unsupported file${rejected.length > 1 ? 's' : ''} skipped.`,
    )
  }, [])

  const removeStaged = (i: number) => setStaged(prev => prev.filter((_, idx) => idx !== i))

  const startAnalysis = useCallback(async () => {
    if (!staged.length) return
    setPhase('analyzing')
    const [result] = await Promise.all([
      analyzeFiles(staged, { sizeProfile: getDefaultSizeProfile() }),
      new Promise(res => setTimeout(res, ANALYZING_STEPS.length * 650 + 300)), // let the inspection read deliberately
    ])
    setReport(result)
    setPhase('intake')
  }, [staged])

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDragging(false)
    if (e.dataTransfer?.files?.length) addFiles(e.dataTransfer.files)
  }

  async function applyFix(check: CheckResult, fixId: string) {
    setFixing(f => ({ ...f, [check.id]: true }))
    const outcome = await runFix(fixId)
    if (outcome.download) downloadTextFile(outcome.download.filename, outcome.download.content, outcome.download.mime)
    setReport(prev => {
      if (!prev) return prev
      const results = prev.results.map(r => r.id === check.id
        ? { ...r, status: 'pass' as Severity, detail: outcome.message, evidence: outcome.artifact ? [`Generated: ${outcome.artifact}`] : r.evidence, fixes: undefined, resolvedBy: 'GRACE AI' }
        : r)
      return recompute(prev, results)
    })
    setFixing(f => ({ ...f, [check.id]: false }))
  }

  // ── Upload ────────────────────────────────────────────────────────────────
  if (phase === 'upload') {
    return (
      <Shell onBack={onBack}>
        <div className="text-center mb-10">
          <p className="phase-header inline-block mb-3">AI Production Assistant</p>
          <h1 className="text-3xl sm:text-4xl font-black text-grace-ink uppercase tracking-tight mb-3">Upload Production Files</h1>
          <p className="text-grace-stone text-sm max-w-lg mx-auto leading-relaxed">
            Already have production-ready artwork? Drop it in and GRACE’s AI prepress technician inspects everything,
            then tells you exactly what’s ready and what to fix — before it reaches a supplier.
          </p>
        </div>

        <label
          onDragOver={e => { e.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={`block cursor-pointer rounded-3xl border-2 border-dashed transition-all p-12 text-center
            ${dragging ? 'border-grace-ink bg-grace-mist scale-[1.01]' : 'border-grace-border hover:border-grace-ink/40 bg-white'}`}
        >
          <input ref={inputRef} type="file" multiple accept={ACCEPT} className="hidden"
            onChange={e => { if (e.target.files) addFiles(e.target.files); e.target.value = '' }} />
          <div className="w-16 h-16 rounded-2xl bg-grace-ink text-white flex items-center justify-center mx-auto mb-5">
            <UploadCloud size={26} />
          </div>
          <p className="text-grace-ink font-bold tracking-tight mb-1">Drop production files here</p>
          <p className="text-grace-stone text-xs mb-5">Artwork, mockups, tech packs, size charts — PNG · JPG · SVG · PDF · CSV · ZIP</p>
          <span className="btn-primary inline-flex items-center gap-2"><Plus size={14}/> {staged.length ? 'Add more files' : 'Choose files'}</span>
        </label>

        {/* Rejected-file notice (.ai/.eps and unsupported types) */}
        {notice && (
          <div className="mt-3 flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/5 px-3.5 py-2.5">
            <AlertTriangle size={14} className="text-amber-500 shrink-0 mt-0.5" />
            <p className="text-xs text-grace-ink leading-relaxed flex-1">{notice}</p>
            <button onClick={() => setNotice(null)} className="text-grace-stone hover:text-grace-ink shrink-0" aria-label="Dismiss"><X size={13} /></button>
          </div>
        )}

        {/* Naming tip — how to get the tech pack & size chart recognized */}
        <div className="mt-3 flex items-start gap-2 rounded-xl border border-grace-border bg-grace-mist/40 px-3.5 py-2.5">
          <Info size={14} className="text-grace-ink shrink-0 mt-0.5" />
          <p className="text-xs text-grace-stone leading-relaxed">
            <span className="font-semibold text-grace-ink">Naming tip:</span> so GRACE recognizes your documents, include{' '}
            <span className="font-semibold text-grace-ink">“tech pack”</span> or <span className="font-semibold text-grace-ink">“spec”</span> in your tech-pack filename
            (e.g. <span className="font-mono text-[11px]">good-shepard-tech-pack.pdf</span>), and{' '}
            <span className="font-semibold text-grace-ink">“size chart”</span> in your measurements file
            (e.g. <span className="font-mono text-[11px]">size-chart.csv</span>).
          </p>
        </div>

        {/* Staged files — accumulate, then analyze when ready */}
        {staged.length > 0 && (
          <div className="mt-6">
            <div className="flex items-center justify-between mb-2.5">
              <p className="text-[11px] font-bold tracking-[0.14em] uppercase text-grace-ink">
                {staged.length} file{staged.length > 1 ? 's' : ''} ready
              </p>
              <button onClick={() => { setStaged([]); setNotice(null) }} className="text-[11px] text-grace-stone hover:text-grace-ink font-medium">
                Clear all
              </button>
            </div>
            <div className="space-y-2">
              {staged.map((f, i) => (
                <div key={`${f.name}:${f.size}:${i}`} className="flex items-center gap-3 rounded-xl border border-grace-border bg-white px-3 py-2.5">
                  <div className="w-8 h-8 rounded-lg bg-grace-mist text-grace-ink flex items-center justify-center shrink-0">
                    {stagedIcon(f.name)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-grace-ink truncate">{f.name}</p>
                    <p className="text-[10px] text-grace-stone uppercase tracking-wider">{extOf(f.name)} · {(f.size / 1024).toFixed(0)} KB</p>
                  </div>
                  <button onClick={() => removeStaged(i)} className="text-grace-stone hover:text-grace-red p-1 shrink-0" aria-label={`Remove ${f.name}`}>
                    <X size={15} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Analyze — the explicit "I'm finished uploading" action */}
        <button
          onClick={startAnalysis}
          disabled={!staged.length}
          className="btn-primary w-full mt-6 inline-flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Sparkles size={15} />
          {staged.length ? `Analyze ${staged.length} file${staged.length > 1 ? 's' : ''}` : 'Add files to analyze'}
        </button>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-8">
          {[
            { icon: <FileText size={15}/>, t: 'Preflight inspection', d: 'Resolution, vector, color mode, bleed, fonts.' },
            { icon: <Box size={15}/>, t: 'Spec validation', d: 'Tech pack, sizing, placement, decoration, fabric.' },
            { icon: <Wand2 size={15}/>, t: 'AI fixes', d: 'Missing pieces are generated, not rejected.' },
          ].map(c => (
            <div key={c.t} className="card">
              <div className="w-8 h-8 rounded-lg bg-grace-mist text-grace-ink flex items-center justify-center mb-2.5">{c.icon}</div>
              <p className="text-sm font-bold text-grace-ink mb-1">{c.t}</p>
              <p className="text-xs text-grace-stone leading-relaxed">{c.d}</p>
            </div>
          ))}
        </div>
      </Shell>
    )
  }

  // ── Analyzing ───────────────────────────────────────────────────────────────
  if (phase === 'analyzing') {
    return (
      <Shell onBack={onBack}>
        <div className="flex flex-col items-center justify-center text-center py-24">
          <div className="relative w-20 h-20 mb-8">
            <div className="absolute inset-0 rounded-full border-2 border-grace-border" />
            <div className="absolute inset-0 rounded-full border-2 border-grace-ink border-t-transparent animate-spin" />
            <Sparkles size={22} className="absolute inset-0 m-auto text-grace-ink" />
          </div>
          <p className="phase-header mb-2">Analyzing</p>
          <h2 className="text-xl font-black text-grace-ink uppercase tracking-tight mb-6">Running production preflight</h2>
          <div className="space-y-2 w-full max-w-sm">
            {ANALYZING_STEPS.map((s, i) => (
              <div key={s} className={`flex items-center gap-2 text-sm transition-all ${i <= stepIdx ? 'text-grace-ink' : 'text-grace-stone/40'}`}>
                {i < stepIdx ? <CheckCircle2 size={15} className="text-green-600 shrink-0"/>
                  : i === stepIdx ? <Loader2 size={15} className="animate-spin shrink-0"/>
                  : <div className="w-[15px] h-[15px] rounded-full border border-current shrink-0"/>}
                <span>{s}</span>
              </div>
            ))}
          </div>
        </div>
      </Shell>
    )
  }

  // ── Intake conversation (conversational-first) ─────────────────────────────
  if (phase === 'intake' && report) {
    return (
      <ProductionIntake
        files={staged}
        report={report}
        onBack={onBack}
        onComplete={(tp) => onContinue(tp)}
      />
    )
  }

  // ── Report (detailed preflight) — retained as a fallback view ───────────────
  if (!report) return null
  const { score, summary, ready, results, files } = report
  const criticals = results.filter(r => r.status === 'critical')
  const warnings = results.filter(r => r.status === 'warning')
  const passed = results.filter(r => r.status === 'pass' || r.status === 'info')

  return (
    <Shell onBack={onBack}>
      {/* Header: score + status */}
      <div className="card mb-4 flex flex-col sm:flex-row items-center gap-6 sm:gap-8 p-6 sm:p-8">
        <ScoreRing score={score} />
        <div className="flex-1 text-center sm:text-left">
          <p className="phase-header mb-1.5">Production Readiness</p>
          <h1 className="text-2xl font-black text-grace-ink uppercase tracking-tight mb-2">
            {ready ? 'Ready for Production' : 'Almost there'}
          </h1>
          <p className="text-grace-stone text-sm max-w-md leading-relaxed">
            {ready
              ? 'Every critical check passed. Resolve any remaining warnings to perfect the run, or continue straight to manufacturing.'
              : 'Your files passed key checks. Resolve the critical items below — GRACE AI can generate what’s missing.'}
          </p>
          <div className="flex items-center justify-center sm:justify-start gap-2 mt-4 flex-wrap">
            <Chip tone="pass" icon={<CheckCircle2 size={13}/>}>{summary.pass} Passed</Chip>
            <Chip tone="warning" icon={<AlertTriangle size={13}/>}>{summary.warning} Warnings</Chip>
            <Chip tone="critical" icon={<XCircle size={13}/>}>{summary.critical} Critical</Chip>
          </div>
        </div>
      </div>

      {/* Ready → continue */}
      {ready && (
        <button onClick={() => onContinue()}
          className="w-full mb-4 rounded-2xl bg-grace-ink text-white px-6 py-4 flex items-center justify-between hover:bg-zinc-800 transition-colors group">
          <span className="flex items-center gap-3">
            <CheckCircle2 size={18} className="text-green-600"/>
            <span className="text-sm font-bold tracking-wide uppercase">Continue to Manufacturing</span>
          </span>
          <ArrowRight size={18} className="group-hover:translate-x-0.5 transition-transform"/>
        </button>
      )}

      {/* Checks — critical, then warnings, then passed (progressive disclosure) */}
      {criticals.length > 0 && (
        <Group title="Critical issues" tone="critical" defaultOpen>
          {criticals.map(c => <CheckRow key={c.id} check={c} fixing={!!fixing[c.id]} onFix={applyFix} />)}
        </Group>
      )}
      {warnings.length > 0 && (
        <Group title="Warnings" tone="warning" defaultOpen>
          {warnings.map(c => <CheckRow key={c.id} check={c} fixing={!!fixing[c.id]} onFix={applyFix} />)}
        </Group>
      )}
      {passed.length > 0 && (
        <Group title={`Passed checks (${passed.length})`} tone="pass">
          {passed.map(c => <CheckRow key={c.id} check={c} fixing={false} onFix={applyFix} />)}
        </Group>
      )}

      {/* Files inspected */}
      <Group title={`Files inspected (${files.length})`} tone="neutral">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 p-1">
          {files.map(f => <FileRow key={f.id} file={f} />)}
        </div>
      </Group>
    </Shell>
  )
}

// ── Layout shell ──────────────────────────────────────────────────────────────
function Shell({ children, onBack }: { children: React.ReactNode; onBack: () => void }) {
  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-3xl mx-auto px-6 py-8">
        <button onClick={onBack} className="flex items-center gap-1.5 text-xs text-grace-stone hover:text-grace-ink transition-colors mb-6">
          <ArrowLeft size={14}/> Back
        </button>
        {children}
      </div>
    </div>
  )
}

// ── Score ring ────────────────────────────────────────────────────────────────
function ScoreRing({ score }: { score: number }) {
  const r = 46, c = 2 * Math.PI * r
  const color = score >= 85 ? '#16a34a' : score >= 60 ? '#d97706' : '#dc2626'
  return (
    <div className="relative w-[120px] h-[120px] shrink-0">
      <svg width="120" height="120" className="-rotate-90">
        <circle cx="60" cy="60" r={r} fill="none" stroke="#ECECEC" strokeWidth="8" />
        <circle cx="60" cy="60" r={r} fill="none" stroke={color} strokeWidth="8" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c - (c * score) / 100}
          style={{ transition: 'stroke-dashoffset 1s cubic-bezier(0.22,1,0.36,1)' }} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-3xl font-black text-grace-ink tabular-nums leading-none">{score}</span>
        <span className="text-[9px] font-bold tracking-[0.2em] text-grace-stone uppercase mt-1">Score</span>
      </div>
    </div>
  )
}

// ── Collapsible group ─────────────────────────────────────────────────────────
function Group({ title, tone, defaultOpen, children }: {
  title: string; tone: 'critical' | 'warning' | 'pass' | 'neutral'; defaultOpen?: boolean; children: React.ReactNode
}) {
  const [open, setOpen] = useState(!!defaultOpen)
  const dot = tone === 'critical' ? 'bg-red-500' : tone === 'warning' ? 'bg-amber-500' : tone === 'pass' ? 'bg-green-600' : 'bg-grace-stone'
  return (
    <div className="card mb-3 p-0 overflow-hidden">
      <button onClick={() => setOpen(o => !o)} className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-grace-mist/40 transition-colors">
        <span className="flex items-center gap-2.5">
          <span className={`w-2 h-2 rounded-full ${dot}`} />
          <span className="text-xs font-bold tracking-[0.12em] uppercase text-grace-ink">{title}</span>
        </span>
        <ChevronDown size={16} className={`text-grace-stone transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && <div className="px-3 pb-3 pt-0.5 space-y-1.5">{children}</div>}
    </div>
  )
}

// ── Check row ─────────────────────────────────────────────────────────────────
function CheckRow({ check, fixing, onFix }: { check: CheckResult; fixing: boolean; onFix: (c: CheckResult, fixId: string) => void }) {
  const icon = check.status === 'pass' ? <CheckCircle2 size={16} className="text-green-600"/>
    : check.status === 'warning' ? <AlertTriangle size={16} className="text-amber-500"/>
    : check.status === 'critical' ? <XCircle size={16} className="text-red-500"/>
    : <Info size={16} className="text-grace-stone"/>
  return (
    <div className="rounded-xl border border-grace-border bg-white px-4 py-3">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 shrink-0">{fixing ? <Loader2 size={16} className="animate-spin text-grace-ink"/> : icon}</div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-semibold text-grace-ink">{check.label}</p>
            <span className="text-[9px] font-bold tracking-widest uppercase text-grace-stone/70">{CATEGORY_LABEL[check.category]}</span>
            {check.resolvedBy && <span className="text-[9px] font-bold tracking-widest uppercase text-green-600 flex items-center gap-1"><Sparkles size={9}/> {check.resolvedBy}</span>}
          </div>
          <p className="text-xs text-grace-stone leading-relaxed mt-0.5">{fixing ? 'GRACE AI is resolving this…' : check.detail}</p>
          {!fixing && check.evidence?.length ? (
            <ul className="mt-1.5 flex flex-wrap gap-1.5">
              {check.evidence.map((e, i) => (
                <li key={i} className="text-[10px] text-grace-stone bg-grace-mist rounded-full px-2 py-0.5 tabular-nums">{e}</li>
              ))}
            </ul>
          ) : null}
          {!fixing && check.fixes?.length ? (
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {check.fixes.map(f => (
                <button key={f.id} onClick={() => onFix(check, f.id)}
                  className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-grace-ink bg-grace-mist hover:bg-grace-ink hover:text-white border border-grace-border rounded-full px-3 py-1.5 transition-colors">
                  <Wand2 size={11}/> {f.label}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}

function FileRow({ file }: { file: UploadedFile }) {
  const kindIcon = file.kind === 'raster' ? <ImageIcon size={14}/> : file.kind === 'document' ? <FileText size={14}/> : file.kind === 'vector' ? <Sparkles size={14}/> : <Box size={14}/>
  const i = file.inspection
  // Real, parsed facts — shown so the inspection is visibly genuine.
  const c = file.classification
  const viewsSeen = c ? (['front', 'back', 'side'] as const).filter(v => c.views[v]) : []
  const facts = [
    file.width ? `${file.width}×${file.height}px` : null,
    i?.dpi ? `${i.dpi}dpi` : null,
    i?.colorType && i.colorType !== 'unknown' ? i.colorType.toUpperCase() : null,
    i?.pages ? `${i.pages}pg` : null,
    i?.pageSizeIn ? `${i.pageSizeIn.w}×${i.pageSizeIn.h}in` : null,
    i?.hasLiveText ? 'live text' : null,
    i?.isSizeChart ? 'size chart' : null,
    c?.isGarmentMockup ? 'garment mockup' : null,
    viewsSeen.length ? viewsSeen.join('+') : null,
  ].filter(Boolean)
  return (
    <div className="flex items-center gap-3 rounded-xl border border-grace-border bg-white px-3 py-2.5">
      <div className="w-9 h-9 rounded-lg bg-grace-mist text-grace-ink flex items-center justify-center overflow-hidden shrink-0">
        {file.dataUrl ? <img src={file.dataUrl} alt="" className="w-full h-full object-cover"/> : kindIcon}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-grace-ink truncate">{file.name}</p>
        <p className="text-[10px] text-grace-stone uppercase tracking-wider">
          {file.kind} · {(file.size / 1024).toFixed(0)} KB{facts.length ? ` · ${facts.join(' · ')}` : ''}
        </p>
      </div>
    </div>
  )
}

function Chip({ tone, icon, children }: { tone: 'pass' | 'warning' | 'critical'; icon: React.ReactNode; children: React.ReactNode }) {
  const cls = tone === 'pass' ? 'text-green-600 bg-green-600/10'
    : tone === 'warning' ? 'text-amber-600 bg-amber-500/10'
    : 'text-red-600 bg-red-500/10'
  return <span className={`inline-flex items-center gap-1.5 text-[11px] font-bold rounded-full px-2.5 py-1 ${cls}`}>{icon}{children}</span>
}

// Recompute score/summary/ready after an AI fix resolves a check.
function recompute(prev: PrepressReport, results: CheckResult[]): PrepressReport {
  const summary = { pass: 0, warning: 0, critical: 0 }
  let penalty = 0
  for (const r of results) {
    if (r.status === 'pass' || r.status === 'info') summary.pass += r.status === 'pass' ? 1 : 0
    else if (r.status === 'warning') summary.warning++
    else if (r.status === 'critical') summary.critical++
    penalty += STATUS_WEIGHT[r.status] ?? 0
  }
  const score = Math.max(0, Math.min(100, 100 - penalty))
  return { ...prev, results, summary, score, ready: summary.critical === 0 }
}
