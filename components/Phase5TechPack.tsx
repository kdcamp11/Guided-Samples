'use client'

import { useState, useMemo } from 'react'
import {
  CheckCircle2, Pencil, Plus, Trash2, Download, Save, Send, ArrowLeft,
  MoreVertical, ChevronRight, X,
} from 'lucide-react'
import { AppState } from '@/app/page'
import type { TechPackData } from '@/components/Phase6Production'
import {
  getConsumerSizeGuide,
  fitLabel,
  formatInches,
  type SizeGuideOverrides,
} from '@/lib/fitBlocks/sizeGuide'
import { getTechnicalDrawingData } from '@/lib/fitBlocks/technicalDrawing'
import { getFitLibrary, resolveGarmentType } from '@/lib/fitBlocks'
import { ALL_SIZES } from '@/lib/fitBlocks/types'
import type { GarmentType, FitVariant, SizeKey } from '@/lib/fitBlocks/types'
import { TechFlat, FLAT_FOR_GARMENT } from '@/components/TechFlats'

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  state: AppState
  onBack: () => void
  onSendToProduction: (tp: TechPackData) => void
}

// ─── Constants ────────────────────────────────────────────────────────────────

const PHASE5_GARMENTS: { key: GarmentType; label: string }[] = [
  { key: 'short_sleeve_tee', label: 'T-Shirt' },
  { key: 'hoodie',           label: 'Hoodie' },
  { key: 'crewneck',         label: 'Crewneck' },
  { key: 'zip_hoodie',       label: 'Zip Hoodie' },
  { key: 'track_jacket',     label: 'Track Jacket' },
  { key: 'windbreaker',      label: 'Windbreaker' },
  { key: 'sweatpants',       label: 'Sweatpants' },
  { key: 'track_pants',      label: 'Track Pants' },
  { key: 'shorts',           label: 'Shorts' },
]

const GARMENT_LABEL: Record<GarmentType, string> = Object.fromEntries(
  PHASE5_GARMENTS.map(g => [g.key, g.label])
) as Record<GarmentType, string>

const SEASONS = ['SS24', 'FW24', 'SS25', 'FW25', 'SS26', 'FW26', 'Year Round']
const GENDERS = ['Unisex', "Men's", "Women's", 'Kids']


// ─── Editable placement type ──────────────────────────────────────────────────

type EditablePlacement = {
  location: string
  description: string
  widthInches: number
  heightInches: number
  yOffsetInches: number
  notes: string
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function Phase5TechPack({ state, onBack, onSendToProduction }: Props) {
  // ── Infer initial garment from Phase 2 ────────────────────────────────────
  const inferredGarmentType: GarmentType = useMemo(() => {
    if (!state.garment?.type) return 'short_sleeve_tee'
    return resolveGarmentType(state.garment.type) ?? 'short_sleeve_tee'
  }, [state.garment?.type])

  // ── Core state ────────────────────────────────────────────────────────────
  const [garmentType, setGarmentType] = useState<GarmentType>(inferredGarmentType)
  const [fit, setFit] = useState<FitVariant | undefined>(undefined)
  const [overrides, setOverrides] = useState<SizeGuideOverrides>({})

  const [pantones, setPantones] = useState<{ color: string; name: string }[]>([
    { color: '#184D3E', name: 'PANTONE 5535 C' },
    { color: '#9B9B9B', name: 'PANTONE Cool Gray 7 C' },
  ])
  const [newPantoneColor, setNewPantoneColor] = useState('#888888')
  const [newPantoneName, setNewPantoneName] = useState('')
  const [openPantoneMenu, setOpenPantoneMenu] = useState<number | null>(null)

  const [styleOpen, setStyleOpen] = useState(false)
  const [styleMeta, setStyleMeta] = useState({
    styleName: '',
    sku: 'GRC-001',
    revision: 'A',
    season: 'FW25',
    brandName: 'GRACE',
    gender: 'Unisex',
    sizeRange: 'XS–3XL',
    fabricContent: '',
    fabricWeight: '',
    construction: '',
    careInstructions: '',
    supplierNotes: '',
    clientName: '',
    designer: '',
    collection: '',
  })

  const [saved, setSaved] = useState(false)

  // ── Fit block derivation ─────────────────────────────────────────────────
  const guide = useMemo(
    () => getConsumerSizeGuide(garmentType, fit, overrides),
    [garmentType, fit, overrides],
  )
  const library = getFitLibrary(garmentType)
  const resolvedFit = guide?.fit

  // Technical drawing for size M (front flat)
  const drawingM = useMemo(
    () => getTechnicalDrawingData(garmentType, fit, 'M', overrides),
    [garmentType, fit, overrides],
  )

  // Auto-derive placements from drawing data
  const derivedPlacements = useMemo((): EditablePlacement[] => {
    if (!drawingM?.placements.length) return [{ location: 'Front', description: '', widthInches: 10, heightInches: 10, yOffsetInches: 2.5, notes: '' }]
    return drawingM.placements.map(p => ({
      location: p.location.split('_').map(w => w[0].toUpperCase() + w.slice(1)).join(' '),
      description: p.label,
      widthInches: p.widthInches,
      heightInches: p.heightInches,
      yOffsetInches: p.yOffsetInches,
      notes: p.notes,
    }))
  }, [drawingM])

  const [placements, setPlacements] = useState<EditablePlacement[]>(derivedPlacements)

  // ── Measurement editing ───────────────────────────────────────────────────
  function handleMeasurementEdit(rowKey: string, size: SizeKey, raw: string) {
    const value = parseFloat(raw)
    if (!Number.isFinite(value) || !resolvedFit) return
    setOverrides(prev => {
      const next = JSON.parse(JSON.stringify(prev)) as SizeGuideOverrides
      next[garmentType] ??= {}
      next[garmentType][resolvedFit] ??= {}
      next[garmentType][resolvedFit][rowKey] ??= {}
      next[garmentType][resolvedFit][rowKey][size] = value
      return next
    })
  }

  function resetRow(rowKey: string) {
    if (!resolvedFit) return
    setOverrides(prev => {
      const next = JSON.parse(JSON.stringify(prev)) as SizeGuideOverrides
      if (next[garmentType]?.[resolvedFit]?.[rowKey]) {
        delete next[garmentType][resolvedFit][rowKey]
      }
      return next
    })
  }

  // ── Garment switch ────────────────────────────────────────────────────────
  function switchGarment(g: GarmentType) {
    setGarmentType(g)
    setFit(undefined)
    setOverrides({})
  }

  // ── Build TechPackData for production ─────────────────────────────────────
  function buildTechPackData(): TechPackData {
    const measurementsRecord: Record<string, number[]> = {}
    if (guide) {
      for (const row of guide.rows) {
        measurementsRecord[row.label] = ALL_SIZES.map(s => row.values[s] ?? 0)
      }
    }
    return {
      styleInfo: {
        styleName: styleMeta.styleName || `GRACE ${GARMENT_LABEL[garmentType] ?? garmentType}`,
        sku: styleMeta.sku,
        revision: styleMeta.revision,
        season: styleMeta.season,
        brandName: styleMeta.brandName,
        garmentType: GARMENT_LABEL[garmentType] ?? garmentType,
        gender: styleMeta.gender,
        sizeRange: styleMeta.sizeRange,
        fitDescription: resolvedFit ? fitLabel(resolvedFit) : '',
        fabricContent: styleMeta.fabricContent,
        fabricWeight: styleMeta.fabricWeight,
        construction: styleMeta.construction,
        careInstructions: styleMeta.careInstructions,
        supplierNotes: styleMeta.supplierNotes,
        clientName: styleMeta.clientName,
        designer: styleMeta.designer,
        collection: styleMeta.collection,
        dateCreated: new Date().toISOString().split('T')[0],
        fabricFinish: '',
        ageCategory: 'Adult',
      },
      measurements: measurementsRecord,
      pantones,
      placements: placements.map(p => ({
        location: p.location,
        description: [
          p.description,
          `Size: ${formatInches(p.widthInches)}" W × ${formatInches(p.heightInches)}" H`,
          `Offset: ${formatInches(p.yOffsetInches)}" below collar`,
          p.notes,
        ].filter(Boolean).join('. '),
      })),
    }
  }

  function handleDownload() {
    const data = buildTechPackData()
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${(data.styleInfo.styleName as string).replace(/\s+/g, '_')}_TechPack.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  function handleSaveDraft() {
    handleDownload()
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  const artworkUrl = state.logo?.dataUrl ?? null
  const flatKind = FLAT_FOR_GARMENT[garmentType]

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="p-4 md:p-6 w-full">

      {/* Back link */}
      <button onClick={onBack} className="flex items-center gap-1.5 text-xs text-grace-stone hover:text-grace-ink transition-colors mb-5">
        <ArrowLeft size={14}/> Back
      </button>

      {/* ── Completion banner ─────────────────────────────────────────────── */}
      <div className="mb-6 rounded-2xl border border-grace-border bg-white px-6 py-5 flex items-center justify-between gap-4">
        <div className="flex items-start gap-4">
          <div className="w-8 h-8 rounded-full bg-grace-ink flex items-center justify-center shrink-0 mt-0.5">
            <CheckCircle2 size={16} className="text-white" />
          </div>
          <div>
            <p className="text-[9px] font-bold tracking-[0.24em] uppercase text-grace-stone mb-1">
              Your Production Package Is Ready
            </p>
            <p className="text-[15px] font-black text-grace-ink uppercase tracking-tight leading-none">
              {styleMeta.styleName || `GRACE ${GARMENT_LABEL[garmentType]}`}
            </p>
            <p className="text-[11px] text-grace-stone mt-1 leading-relaxed">
              {GARMENT_LABEL[garmentType]}
              {resolvedFit && <> · {fitLabel(resolvedFit)}</>}
              {' · XS–3XL · '}
              {styleMeta.season}
            </p>
          </div>
        </div>
        <button
          onClick={() => setStyleOpen(v => !v)}
          className="shrink-0 flex items-center gap-1.5 text-[11px] font-semibold text-grace-stone hover:text-grace-ink border border-grace-border rounded-full px-3 py-1.5 transition-colors"
        >
          <Pencil size={11}/> Edit Style Details
        </button>
      </div>

      {/* ── Style details panel ───────────────────────────────────────────── */}
      {styleOpen && (
        <div className="mb-5 card">
          <div className="flex items-center justify-between mb-4">
            <p className="text-[10px] font-bold tracking-[0.22em] uppercase text-grace-stone">Style Details</p>
            <button onClick={() => setStyleOpen(false)} className="text-grace-stone hover:text-grace-ink"><X size={14}/></button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {([
              ['Style Name', 'styleName'], ['SKU / Style No.', 'sku'], ['Revision', 'revision'],
              ['Brand Name', 'brandName'], ['Collection', 'collection'], ['Designer', 'designer'],
              ['Client Name', 'clientName'], ['Fabric Content', 'fabricContent'], ['Fabric Weight (GSM)', 'fabricWeight'],
              ['Construction', 'construction'], ['Care Instructions', 'careInstructions'],
            ] as [string, keyof typeof styleMeta][]).map(([label, key]) => (
              <div key={key}>
                <label className="text-[10px] text-grace-stone mb-1 block">{label}</label>
                <input
                  className="w-full text-xs border border-grace-border rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-grace-ink bg-white"
                  value={styleMeta[key]}
                  onChange={e => setStyleMeta(s => ({ ...s, [key]: e.target.value }))}
                  placeholder={label}
                />
              </div>
            ))}
            <div>
              <label className="text-[10px] text-grace-stone mb-1 block">Season</label>
              <select className="w-full text-xs border border-grace-border rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-grace-ink bg-white"
                value={styleMeta.season} onChange={e => setStyleMeta(s => ({ ...s, season: e.target.value }))}>
                {SEASONS.map(o => <option key={o}>{o}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[10px] text-grace-stone mb-1 block">Gender</label>
              <select className="w-full text-xs border border-grace-border rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-grace-ink bg-white"
                value={styleMeta.gender} onChange={e => setStyleMeta(s => ({ ...s, gender: e.target.value }))}>
                {GENDERS.map(o => <option key={o}>{o}</option>)}
              </select>
            </div>
          </div>
          <div className="mt-3">
            <label className="text-[10px] text-grace-stone mb-1 block">Notes to Supplier</label>
            <textarea
              className="w-full text-xs border border-grace-border rounded-lg px-2.5 py-2 focus:outline-none focus:border-grace-ink bg-white resize-none"
              rows={3}
              value={styleMeta.supplierNotes}
              onChange={e => setStyleMeta(s => ({ ...s, supplierNotes: e.target.value }))}
              placeholder="Special instructions, timeline, quality standards…"
            />
          </div>
        </div>
      )}

      {/* ── Section 1: Garment selector ───────────────────────────────────── */}
      <div className="mb-6">
        <div className="flex flex-wrap gap-1.5">
          {PHASE5_GARMENTS.map(g => (
            <button
              key={g.key}
              onClick={() => switchGarment(g.key)}
              className={`px-3 py-1.5 rounded-full text-[11px] font-semibold tracking-wide transition-colors ${
                g.key === garmentType
                  ? 'bg-[#184D3E] text-white'
                  : 'bg-white text-grace-stone hover:text-grace-ink border border-grace-border'
              }`}
            >
              {g.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Section 2: Fit selector ───────────────────────────────────────── */}
      <div className="mb-6 card">
        <div className="flex items-start gap-4 flex-wrap">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-3">
              <span className="w-6 h-6 rounded-full bg-[#184D3E] text-white text-[10px] font-bold flex items-center justify-center shrink-0">1</span>
              <p className="text-[11px] font-bold tracking-[0.18em] uppercase text-grace-ink">Select Fit</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {library.availableFits.map(f => {
                const selected = resolvedFit === f
                return (
                  <button
                    key={f}
                    onClick={() => setFit(f)}
                    className={`px-4 py-2 rounded-full text-[12px] font-semibold tracking-wide transition-all ${
                      selected
                        ? 'bg-[#184D3E] text-white shadow-sm'
                        : 'bg-white text-grace-stone hover:text-grace-ink border border-grace-border hover:border-grace-ink'
                    }`}
                  >
                    {fitLabel(f)}
                  </button>
                )
              })}
            </div>
          </div>
          <p className="text-[10px] text-grace-stone max-w-[180px] leading-relaxed self-end pb-0.5">
            Measurements are generated based on your selected fit. You can edit any size below.
          </p>
        </div>
      </div>

      {/* ── Section 3: Measurements ───────────────────────────────────────── */}
      <div className="mb-6 card">
        <div className="flex items-center gap-2 mb-4">
          <span className="w-6 h-6 rounded-full bg-[#184D3E] text-white text-[10px] font-bold flex items-center justify-center shrink-0">2</span>
          <p className="text-[11px] font-bold tracking-[0.18em] uppercase text-grace-ink">Measurements (Inches)</p>
          <span className="ml-auto text-[10px] text-grace-stone">{GARMENT_LABEL[garmentType]} · {guide?.rows.length ?? 0} rows</span>
          <button className="text-[10px] font-semibold text-grace-stone hover:text-grace-ink transition-colors ml-2">
            Edit All
          </button>
        </div>

        {guide ? (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-grace-border">
                  <th className="text-left text-grace-stone text-[10px] font-semibold uppercase tracking-wider pb-2 pr-4">Point of Measure</th>
                  {ALL_SIZES.map(s => (
                    <th key={s} className="text-center text-grace-ink text-[11px] font-bold pb-2 px-1 min-w-[52px]">{s}</th>
                  ))}
                  <th className="w-6" />
                </tr>
              </thead>
              <tbody>
                {guide.rows.map(row => (
                  <tr key={row.key} className="border-b border-grace-border last:border-0 group">
                    <td className="py-2 pr-4 font-semibold text-grace-ink text-[12px] whitespace-nowrap">{row.label}</td>
                    {ALL_SIZES.map(s => (
                      <td key={s} className="py-2 px-1">
                        <input
                          type="number"
                          step="0.125"
                          value={row.values[s] ?? 0}
                          onChange={e => handleMeasurementEdit(row.key, s as SizeKey, e.target.value)}
                          className="w-full text-center text-[12px] text-grace-ink bg-grace-mist/50 border border-grace-border rounded-lg px-1 py-1.5 focus:outline-none focus:border-grace-ink tabular-nums"
                        />
                      </td>
                    ))}
                    <td className="py-2 pl-1">
                      <button
                        onClick={() => resetRow(row.key)}
                        className="opacity-0 group-hover:opacity-100 transition-opacity text-grace-stone hover:text-grace-ink"
                        title="Reset to default"
                      >
                        <Pencil size={11}/>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-grace-stone py-4 text-center">No measurements available for this garment.</p>
        )}

        <p className="mt-3 text-[10px] text-grace-stone leading-relaxed">
          Only the {guide?.rows.length ?? 4} core measurements are shown. Additional technical specifications are automatically included in your production package.
        </p>
      </div>

      {/* ── Section 4: Technical Flats ────────────────────────────────────── */}
      <div className="mb-6 card">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-[#184D3E] text-white text-[10px] font-bold flex items-center justify-center shrink-0">3</span>
            <p className="text-[11px] font-bold tracking-[0.18em] uppercase text-grace-ink">Technical Flats</p>
          </div>
          <button
            onClick={() => {/* navigate to technical drawing section */}}
            className="flex items-center gap-1 text-[11px] text-grace-stone hover:text-grace-ink font-medium transition-colors"
          >
            View Full Technical Drawing <ChevronRight size={13}/>
          </button>
        </div>

        <div className="flex justify-center">
          <TechFlat kind={flatKind} />
        </div>
      </div>

      {/* ── Section 5: Pantones + Graphic Placement ───────────────────────── */}
      <div className="mb-6 grid grid-cols-1 sm:grid-cols-2 gap-4">

        {/* Pantones */}
        <div className="card">
          <div className="flex items-center gap-2 mb-4">
            <span className="w-6 h-6 rounded-full bg-[#184D3E] text-white text-[10px] font-bold flex items-center justify-center shrink-0">4</span>
            <p className="text-[11px] font-bold tracking-[0.18em] uppercase text-grace-ink">Pantones</p>
          </div>
          <div className="space-y-2 mb-3">
            {pantones.map((p, i) => (
              <div key={i} className="relative flex items-center gap-2.5 group">
                <span className="w-8 h-8 rounded-lg border border-grace-border shrink-0 cursor-pointer relative overflow-hidden">
                  <span className="absolute inset-0" style={{ backgroundColor: p.color }} />
                  <input
                    type="color"
                    value={p.color}
                    onChange={e => setPantones(ps => ps.map((x, j) => j === i ? { ...x, color: e.target.value } : x))}
                    className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                  />
                </span>
                <span className="flex-1 text-[12px] font-semibold text-grace-ink">{p.name}</span>
                <div className="relative">
                  <button
                    onClick={() => setOpenPantoneMenu(openPantoneMenu === i ? null : i)}
                    className="opacity-0 group-hover:opacity-100 transition-opacity text-grace-stone hover:text-grace-ink p-1"
                  >
                    <MoreVertical size={13}/>
                  </button>
                  {openPantoneMenu === i && (
                    <div className="absolute right-0 top-full z-10 mt-1 w-28 bg-white border border-grace-border rounded-lg shadow-lg py-1">
                      <button
                        onClick={() => { setPantones(ps => ps.filter((_, j) => j !== i)); setOpenPantoneMenu(null) }}
                        className="w-full text-left px-3 py-1.5 text-[11px] text-red-500 hover:bg-grace-mist"
                      >
                        Remove
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
          {/* Add Pantone */}
          <div className="flex items-center gap-2 pt-2 border-t border-grace-border">
            <span className="w-8 h-8 rounded-lg border border-grace-border shrink-0 relative overflow-hidden">
              <span className="absolute inset-0" style={{ backgroundColor: newPantoneColor }} />
              <input
                type="color"
                value={newPantoneColor}
                onChange={e => setNewPantoneColor(e.target.value)}
                className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
              />
            </span>
            <input
              className="flex-1 text-[11px] border border-grace-border rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-grace-ink"
              placeholder="PANTONE 0000 C"
              value={newPantoneName}
              onChange={e => setNewPantoneName(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && newPantoneName.trim()) {
                  setPantones(p => [...p, { color: newPantoneColor, name: newPantoneName.trim() }])
                  setNewPantoneName('')
                  setNewPantoneColor('#888888')
                }
              }}
            />
            <button
              onClick={() => {
                if (!newPantoneName.trim()) return
                setPantones(p => [...p, { color: newPantoneColor, name: newPantoneName.trim() }])
                setNewPantoneName('')
                setNewPantoneColor('#888888')
              }}
              className="text-[11px] font-semibold text-grace-stone hover:text-grace-ink"
            >
              <Plus size={14}/>
            </button>
          </div>
          <button
            onClick={() => {
              setPantones(p => [...p, { color: '#888888', name: '' }])
            }}
            className="mt-2 w-full text-[11px] text-grace-stone hover:text-grace-ink font-medium flex items-center justify-center gap-1"
          >
            <Plus size={11}/> Add Pantone
          </button>
        </div>

        {/* Graphic Placement */}
        <div className="card">
          <div className="flex items-center gap-2 mb-4">
            <span className="w-6 h-6 rounded-full bg-[#184D3E] text-white text-[10px] font-bold flex items-center justify-center shrink-0">5</span>
            <p className="text-[11px] font-bold tracking-[0.18em] uppercase text-grace-ink">Graphic Placement</p>
          </div>
          <div className="space-y-3 mb-3">
            {(drawingM?.placements ?? []).filter(p => ['center_chest', 'left_chest', 'left_hip', 'right_hip'].includes(p.location)).map((p, i) => (
              <div key={i} className="flex items-start gap-3">
                {artworkUrl ? (
                  <img src={artworkUrl} alt="logo" className="w-12 h-12 object-contain rounded-lg border border-grace-border bg-grace-mist p-1 shrink-0"/>
                ) : (
                  <div className="w-12 h-12 rounded-lg border border-grace-border bg-grace-mist shrink-0 flex items-center justify-center">
                    <span className="text-[8px] text-grace-stone font-bold uppercase tracking-wider text-center">Logo</span>
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-[12px] font-bold text-grace-ink leading-none">
                        {p.location.split('_').map(w => w[0].toUpperCase() + w.slice(1)).join(' ')}
                      </p>
                      <p className="text-[10px] text-grace-stone mt-0.5">{p.label}</p>
                    </div>
                    <button className="text-grace-stone hover:text-grace-ink p-1 shrink-0"><MoreVertical size={12}/></button>
                  </div>
                  <div className="mt-1.5 grid grid-cols-2 gap-x-3">
                    <div>
                      <p className="text-[9px] text-grace-stone uppercase tracking-wider font-semibold">Size</p>
                      <p className="text-[11px] font-semibold text-grace-ink tabular-nums">
                        {formatInches(p.widthInches)}" W × {formatInches(p.heightInches)}" H
                      </p>
                    </div>
                    <div>
                      <p className="text-[9px] text-grace-stone uppercase tracking-wider font-semibold">Offset</p>
                      <p className="text-[11px] font-semibold text-grace-ink tabular-nums">
                        {formatInches(p.yOffsetInches)}" below collar
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <button
            className="w-full text-[11px] text-grace-stone hover:text-grace-ink font-medium flex items-center justify-center gap-1 pt-2 border-t border-grace-border"
          >
            <Plus size={11}/> Add Placement
          </button>
          <p className="mt-2 text-[9px] text-grace-stone leading-relaxed">
            Placement measurements are based on the selected size and fit.
          </p>
        </div>
      </div>

      {/* ── Production actions ────────────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-3 mb-3">
        <button
          onClick={handleSaveDraft}
          className="flex items-center justify-center gap-2 py-3 px-4 rounded-xl border border-grace-border bg-white text-grace-ink text-[12px] font-bold tracking-widest uppercase hover:bg-grace-mist transition-colors"
        >
          <Save size={14}/> {saved ? 'Saved!' : 'Save Draft'}
        </button>
        <button
          onClick={handleDownload}
          className="flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-grace-ink text-white text-[12px] font-bold tracking-widest uppercase hover:bg-zinc-800 transition-colors"
        >
          <Download size={14}/> Download Tech Pack (PDF)
        </button>
        <button
          onClick={() => onSendToProduction(buildTechPackData())}
          className="flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-[#184D3E] text-white text-[12px] font-bold tracking-widest uppercase hover:bg-[#0f3328] transition-colors"
        >
          <Send size={14}/> Send to Production
        </button>
      </div>

      <p className="text-[10px] text-grace-stone text-center leading-relaxed">
        Your tech pack includes all measurements, construction details, and placements ready for production.
      </p>
    </div>
  )
}
