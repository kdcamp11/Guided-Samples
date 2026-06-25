'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  Ruler, Plus, Trash2, Download, Star, Pencil, ArrowLeft, UploadCloud,
  Library, Tag, Sparkles, Loader2, Check,
} from 'lucide-react'
import {
  listSizeProfiles, saveSizeProfile, deleteSizeProfile, setDefaultSizeProfile, onSizingChange,
} from '@/lib/sizing/store'
import {
  standardGarments, fitsFor, brandGarments, fromStandardFit, fromBrand, fromCsv, blankProfile, profileToCsv,
} from '@/lib/sizing/sources'
import type { SizeProfile, SizeRow } from '@/lib/sizing/types'
import { fileToDataUrl } from '@/lib/fileToDataUrl'
import { downloadTextFile } from '@/lib/prepress/sizeSpec'
import type { GarmentType } from '@/lib/fitBlocks/types'

const SOURCE_LABEL: Record<string, string> = { standard: 'GRACE Standard', brand: 'Brand Fit', upload: 'Uploaded', custom: 'Custom' }

export default function SizingStudio() {
  const [profiles, setProfiles] = useState<SizeProfile[]>([])
  const [mode, setMode] = useState<'list' | 'create' | 'edit'>('list')
  const [draft, setDraft] = useState<SizeProfile | null>(null)

  const refresh = () => setProfiles(listSizeProfiles())
  useEffect(() => { refresh(); return onSizingChange(refresh) }, [])

  const edit = (p: SizeProfile) => { setDraft(structuredClone(p)); setMode('edit') }
  const exportCsv = (p: SizeProfile) => downloadTextFile(`${slug(p.name)}.csv`, profileToCsv(p), 'text/csv')

  if (mode === 'create') return <CreatePanel onCancel={() => setMode('list')} onDraft={p => { setDraft(p); setMode('edit') }} />
  if (mode === 'edit' && draft) return <EditPanel profile={draft} onCancel={() => setMode('list')} onSaved={() => { refresh(); setMode('list') }} />

  // ── List ──────────────────────────────────────────────────────────────────
  return (
    <div className="p-4 md:p-6 max-w-4xl">
      <div className="flex items-start justify-between mb-6 gap-4">
        <div>
          <p className="phase-header">Sizing</p>
          <h1 className="text-xl font-black text-grace-ink uppercase tracking-tight">Size Profiles</h1>
          <p className="text-grace-stone text-sm mt-1 max-w-md">Your reusable source of truth — used by Tech Packs, Production Review, and the GRACE Assistant.</p>
        </div>
        <button onClick={() => setMode('create')} className="btn-primary flex items-center gap-1.5 shrink-0"><Plus size={14}/> New Profile</button>
      </div>

      {profiles.length === 0 ? (
        <div className="card text-center py-14">
          <div className="w-12 h-12 rounded-2xl bg-grace-mist text-grace-ink flex items-center justify-center mx-auto mb-3"><Ruler size={20}/></div>
          <p className="text-sm font-bold text-grace-ink mb-1">No size profiles yet</p>
          <p className="text-xs text-grace-stone mb-5 max-w-xs mx-auto">Start from a GRACE standard fit, a popular brand fit, or upload your own chart.</p>
          <button onClick={() => setMode('create')} className="btn-primary inline-flex items-center gap-1.5"><Plus size={14}/> Create your first</button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {profiles.map(p => (
            <div key={p.id} className="card">
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p className="text-sm font-bold text-grace-ink truncate">{p.name}</p>
                    {p.isDefault && <span title="Default" className="text-amber-500"><Star size={12} fill="currentColor"/></span>}
                  </div>
                  <p className="text-[10px] text-grace-stone uppercase tracking-wider mt-0.5">
                    {SOURCE_LABEL[p.source]}{p.brand ? ` · ${p.brand}` : ''} · {p.rows.length} measurements · {p.sizes.length} sizes
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-1 mb-3">
                {p.sizes.slice(0, 8).map(s => <span key={s} className="text-[10px] bg-grace-mist text-grace-stone rounded px-1.5 py-0.5">{s}</span>)}
              </div>
              <div className="flex items-center gap-1.5">
                <button onClick={() => edit(p)} className="btn-secondary flex-1 flex items-center justify-center gap-1 text-xs py-1.5"><Pencil size={12}/> Edit</button>
                <button onClick={() => setDefaultSizeProfile(p.id)} title="Set as default" className="btn-secondary flex items-center justify-center px-2 py-1.5"><Star size={12}/></button>
                <button onClick={() => exportCsv(p)} title="Export CSV" className="btn-secondary flex items-center justify-center px-2 py-1.5"><Download size={12}/></button>
                <button onClick={() => deleteSizeProfile(p.id)} title="Delete" className="flex items-center justify-center px-2 py-1.5 rounded-lg bg-red-50 hover:bg-red-100 text-red-500 border border-red-200"><Trash2 size={12}/></button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Create ────────────────────────────────────────────────────────────────────
function CreatePanel({ onCancel, onDraft }: { onCancel: () => void; onDraft: (p: SizeProfile) => void }) {
  const [tab, setTab] = useState<'standard' | 'brand' | 'upload'>('standard')
  const garments = useMemo(() => standardGarments(), [])
  const brands = useMemo(() => brandGarments(), [])
  const [garment, setGarment] = useState<GarmentType>(garments[0]?.garmentType)
  const fits = useMemo(() => fitsFor(garment), [garment])
  const [fit, setFit] = useState<string>('')
  useEffect(() => { setFit(fits[0]?.value ?? '') }, [fits])
  const [brandGarment, setBrandGarment] = useState<GarmentType>(brands[0]?.garmentType)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const useStandard = () => { const p = fromStandardFit(garment, fit); if (p) onDraft(p); else setError('Could not build that fit.') }
  const useBrand = () => { const p = fromBrand(brandGarment); if (p) onDraft(p); else setError('No brand benchmark for that garment.') }

  async function onFile(file: File) {
    setError(null); setBusy(true)
    try {
      if (/\.csv$/i.test(file.name)) {
        const p = fromCsv(await file.text(), file.name.replace(/\.csv$/i, ''))
        if (p) return onDraft(p)
        setError('Couldn’t read that CSV as a size chart. Check it has a size header row.')
        return
      }
      // Image or PDF → rasterize → AI extraction.
      const image = await fileToDataUrl(file)
      const res = await fetch('/api/sizing/extract', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ image }) })
      const json = await res.json()
      if (json.ok) {
        const sizes: string[] = json.sizes
        const rows: SizeRow[] = json.rows.map((r: { label: string; values: Record<string, number> }) => ({
          key: r.label.toLowerCase().replace(/[^a-z0-9]+/g, '_'), label: r.label, unit: json.unit === 'cm' ? 'cm' : 'in',
          values: Object.fromEntries(sizes.map(s => [s, r.values[s] ?? 0])),
        }))
        const now = new Date().toISOString()
        onDraft({ id: crypto.randomUUID(), name: file.name.replace(/\.[^.]+$/, ''), source: 'upload', sizes, rows, createdAt: now, updatedAt: now })
      } else {
        setError(`${json.reason || 'Couldn’t extract a chart.'} You can start from a blank template and enter it.`)
      }
    } catch { setError('Something went wrong reading that file. You can enter the chart manually.') }
    finally { setBusy(false) }
  }

  return (
    <div className="p-4 md:p-6 max-w-2xl">
      <button onClick={onCancel} className="flex items-center gap-1.5 text-xs text-grace-stone hover:text-grace-ink mb-5"><ArrowLeft size={14}/> Back</button>
      <h1 className="text-xl font-black text-grace-ink uppercase tracking-tight mb-4">New Size Profile</h1>

      <div className="flex rounded-lg border border-grace-border overflow-hidden mb-5">
        {([['standard', 'GRACE Standard', <Library key="l" size={12}/>], ['brand', 'Brand Fit', <Tag key="t" size={12}/>], ['upload', 'Upload Chart', <UploadCloud key="u" size={12}/>]] as const).map(([id, label, icon]) => (
          <button key={id} onClick={() => { setTab(id); setError(null) }}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-[11px] font-semibold uppercase tracking-wider ${tab === id ? 'bg-grace-ink text-white' : 'text-grace-stone hover:bg-grace-mist'}`}>
            {icon} {label}
          </button>
        ))}
      </div>

      {error && <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-[12px] text-amber-700">{error}</div>}

      {tab === 'standard' && (
        <div className="card space-y-3">
          <p className="text-xs text-grace-stone">Start from a GRACE graded fit block — fully editable after.</p>
          <Field label="Garment"><Select value={garment} onChange={v => setGarment(v as GarmentType)} options={garments.map(g => ({ value: g.garmentType, label: g.label }))}/></Field>
          <Field label="Fit"><Select value={fit} onChange={setFit} options={fits}/></Field>
          <button onClick={useStandard} className="btn-primary w-full flex items-center justify-center gap-1.5"><Sparkles size={14}/> Build from standard fit</button>
        </div>
      )}

      {tab === 'brand' && (
        <div className="card space-y-3">
          <p className="text-xs text-grace-stone">Start from a popular brand’s published fit (verify before production).</p>
          <Field label="Garment / brand">
            <Select value={brandGarment} onChange={v => setBrandGarment(v as GarmentType)}
              options={brands.map(b => ({ value: b.garmentType, label: `${b.label} — ${b.brand} ${b.product}` }))}/>
          </Field>
          <button onClick={useBrand} className="btn-primary w-full flex items-center justify-center gap-1.5"><Sparkles size={14}/> Build from brand fit</button>
        </div>
      )}

      {tab === 'upload' && (
        <div className="card space-y-3">
          <p className="text-xs text-grace-stone">Upload a CSV (read instantly) or a PDF/image of a size chart (AI-extracted).</p>
          <label className={`block rounded-2xl border-2 border-dashed p-8 text-center cursor-pointer transition-colors ${busy ? 'opacity-60 pointer-events-none' : 'border-grace-border hover:border-grace-ink/40'}`}>
            <input type="file" accept=".csv,.pdf,.png,.jpg,.jpeg,.webp" className="hidden" onChange={e => e.target.files?.[0] && onFile(e.target.files[0])}/>
            {busy ? <Loader2 size={22} className="animate-spin mx-auto text-grace-ink"/> : <UploadCloud size={22} className="mx-auto text-grace-ink"/>}
            <p className="text-xs font-semibold text-grace-ink mt-2">{busy ? 'Extracting your chart…' : 'Drop a CSV, PDF, or image'}</p>
            <p className="text-[10px] text-grace-stone mt-0.5">CSV is exact; PDF/image is AI-extracted, then editable</p>
          </label>
          <button onClick={() => onDraft(blankProfile())} className="btn-secondary w-full text-xs">Or start from a blank template</button>
        </div>
      )}
    </div>
  )
}

// ── Edit ────────────────────────────────────────────────────────────────────
function EditPanel({ profile, onCancel, onSaved }: { profile: SizeProfile; onCancel: () => void; onSaved: () => void }) {
  const [p, setP] = useState<SizeProfile>(profile)
  const [saved, setSaved] = useState(false)

  const setCell = (ri: number, size: string, raw: string) => {
    const v = parseFloat(raw)
    setP(prev => ({ ...prev, rows: prev.rows.map((r, i) => i === ri ? { ...r, values: { ...r.values, [size]: isFinite(v) ? v : 0 } } : r) }))
  }
  const setLabel = (ri: number, label: string) => setP(prev => ({ ...prev, rows: prev.rows.map((r, i) => i === ri ? { ...r, label } : r) }))
  const addRow = () => setP(prev => ({ ...prev, rows: [...prev.rows, { key: `m${prev.rows.length}`, label: 'New measurement', unit: prev.rows[0]?.unit ?? 'in', values: Object.fromEntries(prev.sizes.map(s => [s, 0])) }] }))
  const removeRow = (ri: number) => setP(prev => ({ ...prev, rows: prev.rows.filter((_, i) => i !== ri) }))
  const save = () => { saveSizeProfile(p); setSaved(true); setTimeout(onSaved, 600) }

  return (
    <div className="p-4 md:p-6 max-w-4xl">
      <button onClick={onCancel} className="flex items-center gap-1.5 text-xs text-grace-stone hover:text-grace-ink mb-5"><ArrowLeft size={14}/> Back</button>
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <input value={p.name} onChange={e => setP({ ...p, name: e.target.value })}
          className="text-lg font-black text-grace-ink uppercase tracking-tight bg-transparent border-b border-transparent hover:border-grace-border focus:border-grace-ink focus:outline-none"/>
        <div className="flex items-center gap-1.5">
          <button onClick={() => downloadTextFile(`${slug(p.name)}.csv`, profileToCsv(p), 'text/csv')} className="btn-secondary flex items-center gap-1.5 text-xs"><Download size={13}/> CSV</button>
          <button onClick={save} className="btn-primary flex items-center gap-1.5 text-xs">{saved ? <><Check size={13}/> Saved</> : <>Save profile</>}</button>
        </div>
      </div>

      <div className="card p-0 overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-grace-border">
              <th className="text-left font-semibold text-grace-stone uppercase tracking-wider px-3 py-2.5">Measurement ({p.rows[0]?.unit ?? 'in'})</th>
              {p.sizes.map(s => <th key={s} className="text-center font-semibold text-grace-ink px-2 py-2.5 w-16">{s}</th>)}
              <th className="w-8"/>
            </tr>
          </thead>
          <tbody>
            {p.rows.map((r, ri) => (
              <tr key={ri} className="border-b border-grace-border last:border-0">
                <td className="px-3 py-1.5">
                  <input value={r.label} onChange={e => setLabel(ri, e.target.value)} className="w-full bg-transparent text-grace-ink font-medium focus:outline-none"/>
                </td>
                {p.sizes.map(s => (
                  <td key={s} className="px-1 py-1.5">
                    <input value={r.values[s] ?? ''} onChange={e => setCell(ri, s, e.target.value)} inputMode="decimal"
                      className="w-14 text-center tabular-nums bg-grace-mist/60 rounded px-1 py-1 focus:bg-white focus:outline-none focus:ring-1 focus:ring-grace-ink"/>
                  </td>
                ))}
                <td className="px-1"><button onClick={() => removeRow(ri)} className="text-grace-stone hover:text-red-500 p-1"><Trash2 size={12}/></button></td>
              </tr>
            ))}
          </tbody>
        </table>
        <button onClick={addRow} className="w-full flex items-center justify-center gap-1 py-2.5 text-[11px] font-semibold text-grace-stone hover:text-grace-ink border-t border-grace-border"><Plus size={12}/> Add measurement</button>
      </div>
      <p className="text-[11px] text-grace-stone mt-3">Saved profiles are reused across projects and referenced by your Tech Pack, Production Review, and the GRACE Assistant.</p>
    </div>
  )
}

// ── Small inputs ────────────────────────────────────────────────────────────
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label className="text-[11px] font-semibold text-grace-stone uppercase tracking-wider block mb-1">{label}</label>{children}</div>
}
function Select({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)}
      className="w-full text-sm border border-grace-border rounded-lg px-2.5 py-2 bg-white text-grace-ink focus:outline-none focus:border-grace-ink">
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  )
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'size-profile'
