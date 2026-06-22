'use client'

import { useState, useMemo } from 'react'
import {
  CheckCircle2, Pencil, Plus, Trash2, Download, Save, Send, ArrowLeft,
  MoreVertical, ChevronRight, X, Wand2, Loader2,
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
import { downloadAssetsZip } from '@/lib/downloadAssets'

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
    { color: '#0A0A0A', name: 'PANTONE Black C' },
    { color: '#9B9B9B', name: 'PANTONE Cool Gray 7 C' },
  ])
  const [newPantoneColor, setNewPantoneColor] = useState('#888888')
  const [newPantoneName, setNewPantoneName] = useState('')
  const [openPantoneMenu, setOpenPantoneMenu] = useState<number | null>(null)

  const [styleOpen, setStyleOpen] = useState(true)
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

  const isUniform = state.garment?.mode === 'uniform'

  // ── Team uniform state (only used when isUniform) ────────────────────────
  const [teamInfo, setTeamInfo] = useState({
    teamName: state.garment?.sport ? `${state.garment.sport} Team` : '',
    sport: state.garment?.sport ?? '',
    uniformType: state.garment?.uniformType ?? '',
    teamColors: '',
    decorationMethod: 'Sublimation' as 'Sublimation' | 'Twill / Stitched Appliqué',
    teamNotes: '',
  })
  type RosterRow = { name: string; number: string; size: string; position: string; youth: 'Youth' | 'Adult' }
  const [roster, setRoster] = useState<RosterRow[]>([{ name: '', number: '', size: 'M', position: '', youth: 'Adult' }])
  const [csvError, setCsvError] = useState('')

    const [saved, setSaved] = useState(false)
  const [unit, setUnit] = useState<'in' | 'cm'>('in')

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

  // ── AI placement auto-detect (from the actual artwork) ────────────────────
  const [detecting, setDetecting] = useState(false)
  const [detectError, setDetectError] = useState<string | null>(null)
  const [detected, setDetected] = useState<EditablePlacement | null>(null)

  async function autoDetectPlacement() {
    if (!artworkUrl || detecting) return
    setDetecting(true)
    setDetectError(null)
    try {
      // The endpoint scales the artwork box against the real measurement table:
      // chest = flat width across body, length = collar seam (HPS) to hem.
      const chestRow = ALL_SIZES.map(
        s => getTechnicalDrawingData(garmentType, fit, s, overrides)?.measurements.chest ?? 0,
      )
      const lengthRow = ALL_SIZES.map(
        s => getTechnicalDrawingData(garmentType, fit, s, overrides)?.measurements.frontLength ?? 0,
      )
      const sizeIndex = Math.max(0, ALL_SIZES.indexOf('M'))

      const res = await fetch('/api/detect-placement', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image: artworkUrl,
          measurements: { 'Chest (Flat)': chestRow, Length: lengthRow },
          sizeIndex,
        }),
      })
      const json = await res.json()
      if (!res.ok) {
        setDetectError(json?.error ?? 'Could not detect placement from artwork.')
        return
      }
      const zone: string = json.zone ?? 'center chest'
      const zoneLabel = zone.charAt(0).toUpperCase() + zone.slice(1)
      const next: EditablePlacement = {
        location: json.location ?? 'Front',
        description: `${zoneLabel} (auto-detected from artwork)`,
        widthInches: json.widthIn ?? 0,
        heightInches: json.heightIn ?? 0,
        yOffsetInches: json.topOffsetIn ?? 0,
        notes: json.alignment ?? '',
      }
      setDetected(next)
      // Surface in the exported tech pack, replacing any prior detected entry.
      setPlacements(prev => [next, ...prev.filter(p => p.location !== next.location)])
    } catch {
      setDetectError('Network error while detecting placement.')
    } finally {
      setDetecting(false)
    }
  }

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
        styleName: isUniform ? (teamInfo.teamName || `${teamInfo.sport} Team`) : (styleMeta.styleName || `GRACE ${GARMENT_LABEL[garmentType] ?? garmentType}`),
        sku: styleMeta.sku,
        revision: styleMeta.revision,
        season: styleMeta.season,
        brandName: styleMeta.brandName,
        garmentType: isUniform ? `${teamInfo.sport} · ${teamInfo.uniformType}` : (GARMENT_LABEL[garmentType] ?? garmentType),
        gender: styleMeta.gender,
        sizeRange: styleMeta.sizeRange,
        fitDescription: resolvedFit ? fitLabel(resolvedFit) : '',
        fabricContent: styleMeta.fabricContent,
        fabricWeight: styleMeta.fabricWeight,
        construction: styleMeta.construction,
        careInstructions: styleMeta.careInstructions,
        supplierNotes: isUniform
          ? `Decoration: ${teamInfo.decorationMethod}. Colors: ${teamInfo.teamColors}. ${teamInfo.teamNotes}\n\nROSTER:\n${roster.map(r => `${r.name} | #${r.number} | ${r.size} | ${r.youth}${r.position ? ' | ' + r.position : ''}`).join('\n')}`
          : styleMeta.supplierNotes,
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

  // Production-ready transparent PNGs captured when the design was confirmed
  const designAssets = state.design?.assets
  const hasDesignAssets = !!(designAssets && (designAssets.full || designAssets.garment || designAssets.logo || designAssets.artworks?.length))

  async function handleDownloadAssets() {
    if (!designAssets) return
    const files: { name: string; dataUrl: string }[] = []
    if (designAssets.full) files.push({ name: 'full-design.png', dataUrl: designAssets.full })
    if (designAssets.garment) files.push({ name: 'garment.png', dataUrl: designAssets.garment })
    if (designAssets.logo) files.push({ name: 'logo.png', dataUrl: designAssets.logo })
    designAssets.artworks?.forEach((a, i) => files.push({ name: `artwork-${i + 1}.png`, dataUrl: a }))
    if (files.length) await downloadAssetsZip(files, 'grace-production-assets.zip')
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
              {isUniform
                ? (teamInfo.teamName || `${teamInfo.sport} Team`)
                : (styleMeta.styleName || `GRACE ${GARMENT_LABEL[garmentType]}`)}
            </p>
            <p className="text-[11px] text-grace-stone mt-1 leading-relaxed">
              {isUniform
                ? `${teamInfo.sport} · ${teamInfo.uniformType}`
                : <>{GARMENT_LABEL[garmentType]}{resolvedFit && <> · {fitLabel(resolvedFit)}</>}{' · XS–3XL · '}{styleMeta.season}</>}
            </p>
          </div>
        </div>
        {!isUniform && (
          <button
            onClick={() => setStyleOpen(v => !v)}
            className="shrink-0 flex items-center gap-1.5 text-[11px] font-semibold text-grace-stone hover:text-grace-ink border border-grace-border rounded-full px-3 py-1.5 transition-colors relative"
          >
            {!styleMeta.styleName && (<span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-grace-red animate-pulse" />)}<Pencil size={11}/> {styleOpen ? 'Close Details' : 'Edit Style Details'}
          </button>
        )}
      </div>

      {/* ── Style details panel (apparel only) ──────────────────────────────── */}
      {!isUniform && styleOpen && (
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

      {/* ── Section 1: Garment selector (hidden for uniforms) ───────────── */}
      {!isUniform && <div className="mb-6">
        <div className="flex flex-wrap gap-1.5 justify-center">
          {PHASE5_GARMENTS.map(g => (
            <button
              key={g.key}
              onClick={() => switchGarment(g.key)}
              className={`px-3 py-1.5 rounded-full text-[11px] font-semibold tracking-wide transition-colors ${
                g.key === garmentType
                  ? 'bg-[#0A0A0A] text-white'
                  : 'bg-white text-grace-stone hover:text-grace-ink border border-grace-border'
              }`}
            >
              {g.label}
            </button>
          ))}
        </div>
      </div>}

      {/* ── Section 2: Fit selector + Measurements (apparel only) ──────── */}
      {!isUniform && (
        <>
      <div className="mb-6 card">
        <div className="flex items-start gap-4 flex-wrap">
          <div className="flex-1">
            <div className="flex items-center justify-center gap-2 mb-3">
              <p className="text-[11px] font-bold tracking-[0.18em] uppercase text-grace-ink">Select Fit</p>
            </div>
            <div className="flex flex-wrap gap-2 justify-center">
              {library.availableFits.map(f => {
                const selected = resolvedFit === f
                return (
                  <button
                    key={f}
                    onClick={() => setFit(f)}
                    className={`px-4 py-2 rounded-full text-[12px] font-semibold tracking-wide transition-all ${
                      selected
                        ? 'bg-[#0A0A0A] text-white shadow-sm'
                        : 'bg-white text-grace-stone hover:text-grace-ink border border-grace-border hover:border-grace-ink'
                    }`}
                  >
                    {fitLabel(f)}
                  </button>
                )
              })}
            </div>
          </div>
          <div className="relative self-end pb-0.5 group/tip">
            <button className="w-5 h-5 rounded-full bg-grace-ink text-white flex items-center justify-center text-[10px] font-bold" aria-label="About measurements">
              i
            </button>
            <div className="absolute bottom-full right-0 mb-2 w-52 bg-grace-ink text-white text-[11px] leading-relaxed rounded-xl px-3 py-2.5 opacity-0 group-hover/tip:opacity-100 pointer-events-none transition-opacity z-20">
              Measurements are generated based on your selected fit. You can edit any value in the table below.
            </div>
          </div>
        </div>
      </div>

      {/* ── Section 3: Measurements + Technical Flat ─────────────────────── */}
      <div className="mb-6 card">
        <div className="flex items-center gap-2 mb-4">
          <span className="w-6 h-6 rounded-full bg-[#0A0A0A] text-white text-[10px] font-bold flex items-center justify-center shrink-0">2</span>
          <p className="text-[11px] font-bold tracking-[0.18em] uppercase text-grace-ink">
            Measurements
          </p>
          {/* Unit toggle */}
          <div className="flex items-center rounded-full border border-grace-border overflow-hidden ml-2">
            <button
              onClick={() => setUnit('in')}
              className={`px-2.5 py-0.5 text-[10px] font-semibold transition-colors ${unit === 'in' ? 'bg-grace-ink text-white' : 'text-grace-stone hover:text-grace-ink'}`}
            >
              IN
            </button>
            <button
              onClick={() => setUnit('cm')}
              className={`px-2.5 py-0.5 text-[10px] font-semibold transition-colors ${unit === 'cm' ? 'bg-grace-ink text-white' : 'text-grace-stone hover:text-grace-ink'}`}
            >
              CM
            </button>
          </div>
          <div className="ml-auto flex items-center gap-1.5">
            <span className="text-[10px] text-grace-stone">{GARMENT_LABEL[garmentType]}</span>
            <div className="relative group/tip">
              <button className="w-5 h-5 rounded-full bg-grace-ink text-white flex items-center justify-center text-[10px] font-bold" aria-label="About measurements">
                i
              </button>
              <div className="absolute bottom-full right-0 mb-2 w-60 bg-grace-ink text-white text-[11px] leading-relaxed rounded-xl px-3 py-2.5 opacity-0 group-hover/tip:opacity-100 pointer-events-none transition-opacity z-20">
                Tap any cell to edit. Only the core measurements are shown — additional technical specs are automatically included in your production package.
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-col lg:flex-row gap-6">
          {/* Technical flat */}
          <div className="flex items-center justify-center shrink-0">
            <TechFlat kind={flatKind} />
          </div>

          {/* Table */}
          <div className="flex-1 min-w-0">
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
                        {ALL_SIZES.map(s => {
                          const inchVal = row.values[s] ?? 0
                          const displayVal = unit === 'cm'
                            ? (inchVal * 2.54).toFixed(1)
                            : inchVal.toString()
                          return (
                            <td key={s} className="py-2 px-1">
                              <input
                                type="number"
                                step={unit === 'cm' ? '0.5' : '0.125'}
                                value={displayVal}
                                onChange={e => {
                                  const raw = parseFloat(e.target.value)
                                  const inVal = unit === 'cm' ? raw / 2.54 : raw
                                  handleMeasurementEdit(row.key, s as SizeKey, inVal.toString())
                                }}
                                className="w-full text-center text-[12px] text-grace-ink bg-grace-mist/50 border border-grace-border rounded-lg px-1 py-1.5 focus:outline-none focus:border-grace-ink tabular-nums"
                              />
                            </td>
                          )
                        })}
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
              <p className="text-sm text-grace-stone py-4">No measurements available for this garment.</p>
            )}

          </div>
        </div>
      </div>

        </>
      )} {/* end !isUniform apparel sections */}

      {/* ── Team Info + Roster (uniform only) ───────────────────────────────── */}
      {isUniform && (
        <div className="mb-6 space-y-4">
          {/* Team Information */}
          <div className="card">
            <p className="text-[11px] font-bold tracking-[0.18em] uppercase text-grace-ink mb-4">Team Information</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {([
                ['Team Name', 'teamName'],
                ['Team Colors', 'teamColors'],
              ] as const).map(([label, key]) => (
                <div key={key}>
                  <label className="text-[10px] text-grace-stone mb-1 block">{label}</label>
                  <input
                    className="w-full text-xs border border-grace-border rounded-lg px-2.5 py-2 focus:outline-none focus:border-grace-ink"
                    value={teamInfo[key]}
                    onChange={e => setTeamInfo(t => ({ ...t, [key]: e.target.value }))}
                  />
                </div>
              ))}
              <div>
                <label className="text-[10px] text-grace-stone mb-1 block">Sport</label>
                <input className="w-full text-xs border border-grace-border rounded-lg px-2.5 py-2 bg-grace-mist text-grace-stone" value={teamInfo.sport} readOnly/>
              </div>
              <div>
                <label className="text-[10px] text-grace-stone mb-1 block">Uniform Type</label>
                <input className="w-full text-xs border border-grace-border rounded-lg px-2.5 py-2 bg-grace-mist text-grace-stone" value={teamInfo.uniformType} readOnly/>
              </div>
              <div className="sm:col-span-2">
                <label className="text-[10px] text-grace-stone mb-1 block">Decoration Method</label>
                <div className="flex gap-2">
                  {(['Sublimation', 'Twill / Stitched Appliqué'] as const).map(m => (
                    <button key={m} onClick={() => setTeamInfo(t => ({ ...t, decorationMethod: m }))}
                      className={`px-4 py-2 rounded-full text-[11px] font-semibold border transition-colors ${teamInfo.decorationMethod === m ? 'bg-grace-ink text-white border-grace-ink' : 'border-grace-border text-grace-stone hover:border-grace-ink hover:text-grace-ink'}`}>
                      {m}
                    </button>
                  ))}
                </div>
              </div>
              <div className="sm:col-span-2">
                <label className="text-[10px] text-grace-stone mb-1 block">Team Notes</label>
                <textarea className="w-full text-xs border border-grace-border rounded-lg px-2.5 py-2 focus:outline-none focus:border-grace-ink resize-none" rows={2}
                  value={teamInfo.teamNotes} onChange={e => setTeamInfo(t => ({ ...t, teamNotes: e.target.value }))} placeholder="Special instructions, timeline, quality notes…"/>
              </div>
            </div>
          </div>

          {/* Roster */}
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <p className="text-[11px] font-bold tracking-[0.18em] uppercase text-grace-ink">Roster</p>
              <label className="flex items-center gap-1.5 text-[11px] font-semibold text-grace-stone hover:text-grace-ink cursor-pointer border border-grace-border rounded-full px-3 py-1 transition-colors">
                <Plus size={11}/> Upload CSV
                <input type="file" accept=".csv" className="hidden" onChange={e => {
                  const file = e.target.files?.[0]; if (!file) return
                  const reader = new FileReader()
                  reader.onload = ev => {
                    try {
                      const lines = (ev.target?.result as string).split('\n').filter(l => l.trim())
                      const rows = lines.slice(1).map(line => {
                        const [name='', number='', size='M', position='', youth='Adult'] = line.split(',').map(c => c.trim().replace(/^"|"$/g,''))
                        return { name, number, size, position, youth: (youth === 'Youth' ? 'Youth' : 'Adult') as 'Youth' | 'Adult' }
                      })
                      if (rows.length) { setRoster(rows); setCsvError('') }
                    } catch { setCsvError('Could not parse CSV. Expected columns: Name, Number, Size, Position, Youth/Adult') }
                  }
                  reader.readAsText(file); e.target.value = ''
                }}/>
              </label>
            </div>
            {csvError && <p className="text-[11px] text-red-500 mb-2">{csvError}</p>}
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-grace-border">
                    {['Player Name', 'Number', 'Size', 'Position', 'Youth/Adult', ''].map(h => (
                      <th key={h} className="text-left text-[10px] text-grace-stone font-semibold uppercase tracking-wider pb-2 pr-2">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {roster.map((row, i) => (
                    <tr key={i} className="border-b border-grace-border last:border-0">
                      {(['name', 'number', 'size', 'position'] as const).map(field => (
                        <td key={field} className="py-1.5 pr-2">
                          <input className="w-full border border-grace-border rounded px-2 py-1 text-xs focus:outline-none focus:border-grace-ink"
                            placeholder={field === 'position' ? 'Optional' : ''}
                            value={row[field]}
                            onChange={e => setRoster(r => r.map((x,j) => j===i ? {...x, [field]: e.target.value} : x))}/>
                        </td>
                      ))}
                      <td className="py-1.5 pr-2">
                        <select className="border border-grace-border rounded px-2 py-1 text-xs focus:outline-none focus:border-grace-ink"
                          value={row.youth} onChange={e => setRoster(r => r.map((x,j) => j===i ? {...x, youth: e.target.value as 'Youth'|'Adult'} : x))}>
                          <option>Adult</option><option>Youth</option>
                        </select>
                      </td>
                      <td className="py-1.5">
                        <button onClick={() => setRoster(r => r.filter((_,j) => j!==i))} className="text-grace-stone hover:text-grace-red transition-colors">
                          <X size={13}/>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button onClick={() => setRoster(r => [...r, { name:'', number:'', size:'M', position:'', youth:'Adult' }])}
              className="mt-3 w-full flex items-center justify-center gap-1 text-[11px] font-semibold text-grace-stone hover:text-grace-ink border border-grace-border rounded-full py-1.5 transition-colors">
              <Plus size={11}/> Add Player
            </button>
            <p className="mt-2 text-[10px] text-grace-stone text-center">CSV format: Name, Number, Size, Position (optional), Youth/Adult</p>
          </div>
        </div>
      )}

      {/* ── Section 4: Pantones + Graphic Placement ───────────────────────────────────────── */}
      <div className="mb-6 grid grid-cols-1 sm:grid-cols-2 gap-4">

        {/* Pantones */}
        <div className="card">
          <div className="flex items-center gap-2 mb-4">
            <span className="w-6 h-6 rounded-full bg-[#0A0A0A] text-white text-[10px] font-bold flex items-center justify-center shrink-0">3</span>
            <p className="text-[11px] font-bold tracking-[0.18em] uppercase text-grace-ink">Color Swatches</p>
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
            <span className="w-6 h-6 rounded-full bg-[#0A0A0A] text-white text-[10px] font-bold flex items-center justify-center shrink-0">4</span>
            <p className="text-[11px] font-bold tracking-[0.18em] uppercase text-grace-ink">Graphic Placement</p>
            <div className="relative group/tip inline-block ml-1">
              <button className="w-5 h-5 rounded-full bg-grace-ink text-white flex items-center justify-center text-[10px] font-bold" aria-label="About graphic placement">
                i
              </button>
              <div className="absolute bottom-full left-0 mb-2 w-52 bg-grace-ink text-white text-[11px] leading-relaxed rounded-xl px-3 py-2.5 opacity-0 group-hover/tip:opacity-100 pointer-events-none transition-opacity z-20">
                Placement measurements are based on the selected size and fit.
              </div>
            </div>
            {drawingM?.category === 'top' && (
              <button
                onClick={autoDetectPlacement}
                disabled={!artworkUrl || detecting}
                title={artworkUrl ? 'Measure the logo from your artwork' : 'Upload artwork first'}
                className="ml-auto flex items-center gap-1.5 text-[10px] font-bold tracking-widest uppercase px-3 py-1.5 rounded-full border border-grace-border bg-white text-grace-ink hover:bg-grace-mist disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {detecting ? <Loader2 size={12} className="animate-spin"/> : <Wand2 size={12}/>}
                {detecting ? 'Detecting…' : 'Auto-detect'}
              </button>
            )}
          </div>

          {detectError && (
            <div className="mb-3 rounded-lg border border-grace-red/30 bg-grace-red/5 px-3 py-2 text-[11px] text-grace-red">
              {detectError}
            </div>
          )}

          {detected && (
            <div className="mb-3 rounded-xl border border-grace-ink/15 bg-grace-mist/40 p-3">
              <div className="flex items-start gap-3">
                {artworkUrl ? (
                  <img src={artworkUrl} alt="logo" className="w-12 h-12 object-contain rounded-lg border border-grace-border bg-white p-1 shrink-0"/>
                ) : (
                  <div className="w-12 h-12 rounded-lg border border-grace-border bg-white shrink-0"/>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <Wand2 size={11} className="text-grace-ink"/>
                    <p className="text-[12px] font-bold text-grace-ink leading-none">{detected.location}</p>
                    <span className="text-[8px] font-bold uppercase tracking-widest text-grace-ink/60">Auto-detected</span>
                  </div>
                  <p className="text-[10px] text-grace-stone mt-0.5">{detected.description}</p>
                  <div className="mt-1.5 grid grid-cols-2 gap-x-3">
                    <div>
                      <p className="text-[9px] text-grace-stone uppercase tracking-wider font-semibold">Size</p>
                      <p className="text-[11px] font-semibold text-grace-ink tabular-nums">
                        {formatInches(detected.widthInches)}" W × {formatInches(detected.heightInches)}" H
                      </p>
                    </div>
                    <div>
                      <p className="text-[9px] text-grace-stone uppercase tracking-wider font-semibold">Offset</p>
                      <p className="text-[11px] font-semibold text-grace-ink tabular-nums">
                        {formatInches(detected.yOffsetInches)}" below collar
                      </p>
                    </div>
                  </div>
                  {detected.notes && (
                    <p className="text-[10px] text-grace-stone mt-1">{detected.notes}</p>
                  )}
                </div>
                <button onClick={() => setDetected(null)} className="text-grace-stone hover:text-grace-ink p-1 shrink-0" aria-label="Dismiss detected placement">
                  <X size={12}/>
                </button>
              </div>
              <p className="text-[9px] text-grace-stone mt-2 pt-2 border-t border-grace-border leading-relaxed">
                Measured from your artwork at size M and added to the tech pack. Standard placements below remain available.
              </p>
            </div>
          )}

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
        </div>
      </div>

      {/* ── Production assets ─────────────────────────────────────────────── */}
      {hasDesignAssets && (
        <div className="mb-3 card flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-lg border border-grace-border bg-grace-mist p-1 shrink-0 flex items-center justify-center overflow-hidden">
              <img src={designAssets!.full || designAssets!.garment} alt="design" className="max-h-full max-w-full object-contain"/>
            </div>
            <div>
              <p className="text-[12px] font-bold text-grace-ink">Production Assets</p>
              <p className="text-[11px] text-grace-stone">Transparent PNGs — full design, garment, logo &amp; artwork</p>
            </div>
          </div>
          <button
            onClick={handleDownloadAssets}
            className="shrink-0 flex items-center gap-2 py-2.5 px-4 rounded-xl border border-grace-border bg-white text-grace-ink text-[11px] font-bold tracking-widest uppercase hover:bg-grace-mist transition-colors"
          >
            <Download size={13}/> Download Assets (.zip)
          </button>
        </div>
      )}

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
          className="flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-[#0A0A0A] text-white text-[12px] font-bold tracking-widest uppercase hover:bg-zinc-800 transition-colors"
        >
          <Send size={14}/> Send to Production
        </button>
      </div>

      <div className="flex justify-center">
        <div className="relative group/tip">
          <button className="w-5 h-5 rounded-full bg-grace-ink text-white flex items-center justify-center text-[10px] font-bold">i</button>
          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 bg-grace-ink text-white text-[11px] leading-relaxed rounded-xl px-3 py-2.5 opacity-0 group-hover/tip:opacity-100 pointer-events-none transition-opacity z-20 text-center">
            Your tech pack includes all measurements, construction details, and placements ready for production.
          </div>
        </div>
      </div>
    </div>
  )
}
