'use client'

import { useState, useEffect, useRef } from 'react'
import { Plus, Upload, Download, Save, CheckCircle2, ArrowLeft, Trash2, ArrowRight, Sparkles, Loader2 } from 'lucide-react'
import { AppState } from '@/app/page'
import type { TechPackData } from '@/components/Phase6Production'

interface Props {
  state: AppState
  onBack: () => void
  onSendToProduction: (tp: TechPackData) => void
}

// ─── Garment templates ───────────────────────────────────────────────────────

const SIZES = ['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL']

type TemplateRow = { label: string; defaults: number[] }

const grade = (base: number, step: number): number[] =>
  SIZES.map((_, i) => Math.round((base + (i - 2) * step) * 4) / 4)

// Each template specifies display rows in order with sensible M defaults + grade step
const TEMPLATES: Record<string, TemplateRow[]> = {
  'T-Shirt': [
    { label: 'Chest (Flat)',    defaults: grade(21, 1) },
    { label: 'Body Length',     defaults: grade(28, 0.5) },
    { label: 'Shoulder Width',  defaults: grade(18, 0.5) },
    { label: 'Sleeve Length',   defaults: grade(8.5, 0.25) },
    { label: 'Armhole',         defaults: grade(9.5, 0.25) },
    { label: 'Bottom Opening',  defaults: grade(21, 1) },
    { label: 'Neck Opening',    defaults: grade(7.5, 0.25) },
    { label: 'Sleeve Opening',  defaults: grade(5.5, 0.25) },
  ],
  'Hoodie': [
    { label: 'Chest (Flat)',    defaults: grade(23, 1) },
    { label: 'Body Length',     defaults: grade(28, 0.5) },
    { label: 'Shoulder Width',  defaults: grade(20, 0.5) },
    { label: 'Sleeve Length',   defaults: grade(24.5, 0.25) },
    { label: 'Armhole',         defaults: grade(10, 0.25) },
    { label: 'Bottom Opening',  defaults: grade(21, 1) },
    { label: 'Neck Opening',    defaults: grade(8, 0.25) },
    { label: 'Sleeve Opening',  defaults: grade(4.5, 0.125) },
    { label: 'Hood Height',     defaults: grade(13, 0.25) },
    { label: 'Hood Opening',    defaults: grade(10, 0.25) },
    { label: 'Hood Depth',      defaults: grade(9, 0.25) },
    { label: 'Cuff Opening',    defaults: grade(4, 0.125) },
  ],
  'Crewneck': [
    { label: 'Chest (Flat)',    defaults: grade(22, 1) },
    { label: 'Body Length',     defaults: grade(27, 0.5) },
    { label: 'Shoulder Width',  defaults: grade(19, 0.5) },
    { label: 'Sleeve Length',   defaults: grade(24, 0.25) },
    { label: 'Armhole',         defaults: grade(9.5, 0.25) },
    { label: 'Bottom Opening',  defaults: grade(20, 1) },
    { label: 'Neck Opening',    defaults: grade(7.5, 0.25) },
    { label: 'Sleeve Opening',  defaults: grade(4.75, 0.125) },
    { label: 'Cuff Opening',    defaults: grade(4, 0.125) },
  ],
  'Zip Hoodie': [
    { label: 'Chest (Flat)',        defaults: grade(22.5, 1) },
    { label: 'Body Length',         defaults: grade(28, 0.5) },
    { label: 'Shoulder Width',      defaults: grade(19.5, 0.5) },
    { label: 'Sleeve Length',       defaults: grade(24.5, 0.25) },
    { label: 'Armhole',             defaults: grade(10, 0.25) },
    { label: 'Bottom Opening',      defaults: grade(21, 1) },
    { label: 'Neck Opening',        defaults: grade(8, 0.25) },
    { label: 'Sleeve Opening',      defaults: grade(4.5, 0.125) },
    { label: 'Hood Height',         defaults: grade(13, 0.25) },
    { label: 'Hood Opening',        defaults: grade(10, 0.25) },
    { label: 'Hood Depth',          defaults: grade(9, 0.25) },
    { label: 'Cuff Opening',        defaults: grade(4, 0.125) },
    { label: 'Front Zipper Length', defaults: grade(26, 0.5) },
  ],
  'Sweatpants': [
    { label: 'Waist (Flat)',   defaults: grade(14, 1) },
    { label: 'Hip Width',      defaults: grade(22, 1) },
    { label: 'Front Rise',     defaults: grade(12, 0.25) },
    { label: 'Back Rise',      defaults: grade(14.5, 0.25) },
    { label: 'Inseam',         defaults: grade(29, 0.5) },
    { label: 'Outseam',        defaults: grade(42, 0.5) },
    { label: 'Thigh Width',    defaults: grade(13, 0.5) },
    { label: 'Knee Width',     defaults: grade(10, 0.25) },
    { label: 'Leg Opening',    defaults: grade(7, 0.25) },
    { label: 'Cuff Opening',   defaults: grade(5.5, 0.125) },
  ],
  'Track Jacket': [
    { label: 'Chest (Flat)',        defaults: grade(21.5, 1) },
    { label: 'Body Length',         defaults: grade(27.5, 0.5) },
    { label: 'Shoulder Width',      defaults: grade(18.5, 0.5) },
    { label: 'Sleeve Length',       defaults: grade(24.5, 0.25) },
    { label: 'Armhole',             defaults: grade(9.5, 0.25) },
    { label: 'Bottom Opening',      defaults: grade(21, 1) },
    { label: 'Neck Opening',        defaults: grade(7.5, 0.25) },
    { label: 'Sleeve Opening',      defaults: grade(4.75, 0.125) },
    { label: 'Front Zipper Length', defaults: grade(25.5, 0.5) },
    { label: 'Collar Height',       defaults: grade(1.5, 0) },
  ],
  'Track Pants': [
    { label: 'Waist (Flat)',    defaults: grade(13.5, 1) },
    { label: 'Hip Width',       defaults: grade(21.5, 1) },
    { label: 'Front Rise',      defaults: grade(11.5, 0.25) },
    { label: 'Back Rise',       defaults: grade(14, 0.25) },
    { label: 'Inseam',          defaults: grade(29, 0.5) },
    { label: 'Outseam',         defaults: grade(41.5, 0.5) },
    { label: 'Thigh Width',     defaults: grade(12.5, 0.5) },
    { label: 'Knee Width',      defaults: grade(10, 0.25) },
    { label: 'Leg Opening',     defaults: grade(6.5, 0.25) },
    { label: 'Zipper Opening',  defaults: grade(0, 0) },
  ],
  'Windbreaker': [
    { label: 'Chest (Flat)',        defaults: grade(22, 1) },
    { label: 'Body Length',         defaults: grade(28, 0.5) },
    { label: 'Shoulder Width',      defaults: grade(19, 0.5) },
    { label: 'Sleeve Length',       defaults: grade(25, 0.25) },
    { label: 'Armhole',             defaults: grade(10, 0.25) },
    { label: 'Bottom Opening',      defaults: grade(21.5, 1) },
    { label: 'Neck Opening',        defaults: grade(8, 0.25) },
    { label: 'Sleeve Opening',      defaults: grade(4.75, 0.125) },
    { label: 'Front Zipper Length', defaults: grade(26, 0.5) },
    { label: 'Collar Height',       defaults: grade(2, 0) },
    { label: 'Hood Height',         defaults: grade(13, 0.25) },
    { label: 'Hood Opening',        defaults: grade(10, 0.25) },
  ],
  'Basketball Jersey': [
    { label: 'Chest (Flat)',   defaults: grade(20, 1) },
    { label: 'Body Length',    defaults: grade(30, 0.5) },
    { label: 'Shoulder Width', defaults: grade(16, 0.5) },
    { label: 'Neck Opening',   defaults: grade(9, 0.25) },
    { label: 'Armhole',        defaults: grade(12, 0.5) },
    { label: 'Bottom Opening', defaults: grade(22, 1) },
  ],
  'Basketball Shorts': [
    { label: 'Waist (Flat)', defaults: grade(13, 1) },
    { label: 'Hip Width',    defaults: grade(21, 1) },
    { label: 'Front Rise',   defaults: grade(12, 0.25) },
    { label: 'Back Rise',    defaults: grade(13.5, 0.25) },
    { label: 'Inseam',       defaults: grade(11, 0.25) },
    { label: 'Outseam',      defaults: grade(24, 0.25) },
    { label: 'Thigh Width',  defaults: grade(13, 0.5) },
    { label: 'Leg Opening',  defaults: grade(12, 0.5) },
  ],
}

const GARMENT_TYPE_LIST = Object.keys(TEMPLATES)

// Map garment prompts / Phase 2 type strings → template keys
function inferTemplate(typeString: string): string {
  const t = typeString.toLowerCase()
  if (t.includes('zip hoodie') || t.includes('zip-hoodie') || t.includes('full zip')) return 'Zip Hoodie'
  if (t.includes('hoodie') || t.includes('pullover')) return 'Hoodie'
  if (t.includes('crewneck') || t.includes('crew neck') || t.includes('sweatshirt')) return 'Crewneck'
  if (t.includes('windbreaker') || t.includes('wind breaker') || t.includes('anorak')) return 'Windbreaker'
  if (t.includes('track jacket') || t.includes('trackjacket')) return 'Track Jacket'
  if (t.includes('track pant') || t.includes('trackpant')) return 'Track Pants'
  if (t.includes('sweatpant') || t.includes('jogger') || t.includes('sweat pant')) return 'Sweatpants'
  if (t.includes('basketball short') || t.includes('bball short')) return 'Basketball Shorts'
  if (t.includes('basketball jersey') || t.includes('jersey')) return 'Basketball Jersey'
  if (t.includes('short') || t.includes('pant') || t.includes('bottom')) return 'Track Pants'
  if (t.includes('t-shirt') || t.includes('tshirt') || t.includes('t shirt') || t.includes('tee')) return 'T-Shirt'
  return 'T-Shirt'
}

function templateToMeasurements(key: string): Record<string, number[]> {
  const rows = TEMPLATES[key] ?? TEMPLATES['T-Shirt']
  return Object.fromEntries(rows.map(r => [r.label, r.defaults]))
}

// ─── Types ────────────────────────────────────────────────────────────────────

type StyleInfo = {
  styleName: string; sku: string; revision: string; season: string
  collection: string; brandName: string; clientName: string
  dateCreated: string; designer: string; garmentType: string
  gender: string; ageCategory: string; fitDescription: string; sizeRange: string
}

const GENDERS = ['Unisex', "Men's", "Women's", 'Kids']
const AGE_CATEGORIES = ['Adult', 'Youth', 'Toddler', 'Infant']
const SIZE_RANGES = ['XS–3XL', 'S–XL', 'S–2XL', 'XS–XL', 'One Size', 'Custom']
const SEASONS = ['SS24', 'FW24', 'SS25', 'FW25', 'SS26', 'FW26', 'Year Round']
const SECTIONS = ['Style Information', 'Fabric & Material', 'Measurements', 'Pantones', 'Graphic Placement', 'Construction', 'Notes & Finishes']

// ─── Component ────────────────────────────────────────────────────────────────

export default function Phase5TechPack({ state, onBack, onSendToProduction }: Props) {
  const today = new Date().toISOString().split('T')[0]

  // Infer garment type from Phase 2 if available
  const inferredType = state.garment?.type
    ? inferTemplate(state.garment.type)
    : 'T-Shirt'

  const [styleInfo, setStyleInfo] = useState<StyleInfo>({
    styleName: `GRACE ${inferredType.toUpperCase()}`,
    sku: 'GRC-001',
    revision: 'A',
    season: 'FW25',
    collection: '',
    brandName: 'GRACE',
    clientName: '',
    dateCreated: today,
    designer: '',
    garmentType: inferredType,
    gender: 'Unisex',
    ageCategory: 'Adult',
    fitDescription: 'Oversized',
    sizeRange: 'XS–3XL',
  })

  const [measurements, setMeasurements] = useState<Record<string, number[]>>(
    () => templateToMeasurements(inferredType)
  )
  const [newRowLabel, setNewRowLabel] = useState('')
  const [pantones, setPantones] = useState([{ color: '#184D3E', name: 'PANTONE 5535 C' }])
  const [newPantone, setNewPantone] = useState('')
  const [newPantoneColor, setNewPantoneColor] = useState('#888888')
  const [placements, setPlacements] = useState([{ location: 'Front', description: 'Center chest logo placement' }])
  const [uploadMsg, setUploadMsg] = useState('')
  const [detecting, setDetecting] = useState(false)
  const [detectError, setDetectError] = useState('')
  const [detectingMeasurements, setDetectingMeasurements] = useState(false)
  const [measurementDetectError, setMeasurementDetectError] = useState('')
  const [measurementDetectInfo, setMeasurementDetectInfo] = useState('')
  const initialized = useRef(false)

  // When Phase 2 garment type becomes available, auto-load its template once
  useEffect(() => {
    if (initialized.current || !state.garment?.type) return
    initialized.current = true
    const key = inferTemplate(state.garment.type)
    setMeasurements(templateToMeasurements(key))
    setStyleInfo(s => ({
      ...s,
      garmentType: key,
      styleName: s.styleName === 'GRACE T-SHIRT' ? `GRACE ${key.toUpperCase()}` : s.styleName,
    }))
  }, [state.garment?.type])

  const set = (key: keyof StyleInfo, value: string) =>
    setStyleInfo(s => ({ ...s, [key]: value }))

  const switchTemplate = (newType: string) => {
    if (newType === styleInfo.garmentType) return
    setMeasurementDetectInfo('')
    setStyleInfo(s => ({ ...s, garmentType: newType }))
    setMeasurements(templateToMeasurements(newType))
  }

  const designImage = state.design?.previewDataUrl || state.garment?.dataUrl || ''

  // ── Measurement helpers ──────────────────────────────────────────────────

  const updateMeasurement = (row: string, sizeIdx: number, value: string) =>
    setMeasurements(m => ({ ...m, [row]: m[row].map((v, i) => i === sizeIdx ? parseFloat(value) || v : v) }))

  const updateRowLabel = (oldLabel: string, newLabel: string) => {
    if (!newLabel.trim() || newLabel === oldLabel) return
    setMeasurements(m => {
      const entries = Object.entries(m)
      const idx = entries.findIndex(([k]) => k === oldLabel)
      if (idx < 0) return m
      entries[idx] = [newLabel, entries[idx][1]]
      return Object.fromEntries(entries)
    })
  }

  const removeRow = (label: string) =>
    setMeasurements(m => Object.fromEntries(Object.entries(m).filter(([k]) => k !== label)))

  const addRow = () => {
    const label = newRowLabel.trim() || 'Custom Measurement'
    if (measurements[label]) return
    setMeasurements(m => ({ ...m, [label]: SIZES.map(() => 0) }))
    setNewRowLabel('')
  }

  // ── Auto-detect measurements ─────────────────────────────────────────────

  const handleAutoDetectMeasurements = async () => {
    const img = state.garment?.dataUrl || designImage
    if (!img) { setMeasurementDetectError('No garment image found — generate a garment in Phase 2 first.'); return }
    setDetectingMeasurements(true)
    setMeasurementDetectError('')
    setMeasurementDetectInfo('')
    try {
      const res = await fetch('/api/detect-measurements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: img }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Detection failed')
      // Merge detected values into current template rows — only update rows that exist
      setMeasurements(m => {
        const next = { ...m }
        const labelMap: Record<string, string> = {
          'Chest (Flat)': 'Chest (Flat)',
          'Body Length': 'Body Length',
          'Length': 'Body Length',
          'Sleeve Length': 'Sleeve Length',
          'Shoulder': 'Shoulder Width',
          'Shoulder Width': 'Shoulder Width',
          'Armhole': 'Armhole',
          'Bottom Opening': 'Bottom Opening',
        }
        for (const [detectedKey, vals] of Object.entries(data.measurements as Record<string, number[]>)) {
          const mapped = labelMap[detectedKey] ?? detectedKey
          if (next[mapped]) next[mapped] = vals
          else if (next[detectedKey]) next[detectedKey] = vals
        }
        return next
      })
      setMeasurementDetectInfo(
        `Detected ${data.garmentType ?? 'garment'} (${data.fit ?? 'regular'} fit) · Size M: length ${data.sizeM.lengthM}", chest ${data.sizeM.chestFlatM}", shoulder ${data.sizeM.shoulderM}". Review and adjust.`
      )
    } catch (e) {
      setMeasurementDetectError(e instanceof Error ? e.message : 'Detection failed.')
    } finally {
      setDetectingMeasurements(false)
    }
  }

  // ── Auto-detect placement ────────────────────────────────────────────────

  const handleAutoDetect = async () => {
    if (!designImage) { setDetectError('No applied-design image found — confirm your design in Phase 3 first.'); return }
    setDetecting(true)
    setDetectError('')
    try {
      const res = await fetch('/api/detect-placement', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: designImage, measurements, sizeIndex: SIZES.indexOf('M') }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Detection failed')
      const entry = { location: data.location, description: data.description }
      setPlacements(ps => {
        const idx = ps.findIndex(p => p.location.toLowerCase() === 'front')
        return idx >= 0 ? ps.map((p, i) => i === idx ? entry : p) : [entry, ...ps]
      })
    } catch (e) {
      setDetectError(e instanceof Error ? e.message : 'Detection failed.')
    } finally {
      setDetecting(false)
    }
  }

  // ── Upload / download ────────────────────────────────────────────────────

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.name.endsWith('.json')) {
      const reader = new FileReader()
      reader.onload = ev => {
        try {
          const data = JSON.parse(ev.target?.result as string)
          if (data.styleInfo) setStyleInfo(s => ({ ...s, ...data.styleInfo }))
          if (data.measurements) setMeasurements(data.measurements)
          if (Array.isArray(data.pantones)) setPantones(data.pantones)
          if (Array.isArray(data.placements)) setPlacements(data.placements)
          setUploadMsg(`Imported ${file.name}`)
        } catch { setUploadMsg('Could not parse file') }
      }
      reader.readAsText(file)
    } else { setUploadMsg(`${file.name} attached`) }
    e.target.value = ''
  }

  const downloadTechPack = () => {
    const blob = new Blob([JSON.stringify({ styleInfo, measurements, pantones, placements }, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${styleInfo.styleName.replace(/\s+/g, '_')}_TechPack.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const addPantone = () => {
    if (!newPantone.trim()) return
    setPantones(p => [...p, { color: newPantoneColor, name: newPantone.trim() }])
    setNewPantone('')
    setNewPantoneColor('#888888')
  }

  const sectionComplete = (section: string) => {
    if (section === 'Style Information') return !!styleInfo.styleName && !!styleInfo.sku
    if (section === 'Measurements') return Object.keys(measurements).length > 0
    if (section === 'Pantones') return pantones.length > 0
    if (section === 'Graphic Placement') return placements.length > 0
    return true
  }

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="p-6">

      <div className="mb-5 flex items-start justify-between">
        <div>
          <p className="phase-header">Phase 5</p>
          <h1 className="text-xl font-bold text-gray-900">Tech Pack & Specifications</h1>
          <p className="text-gray-500 text-sm mt-1">Measurements and placement auto-loaded for your {styleInfo.garmentType}</p>
        </div>
        <button onClick={onBack} className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-700 transition-colors mt-1">
          <ArrowLeft size={14}/> Back
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[180px_1fr_1fr_180px] gap-4">

        {/* Col 1: Upload + sections */}
        <div className="space-y-3">
          <div className="card">
            <p className="text-xs font-medium text-gray-600 mb-2">Input Details</p>
            <label className="btn-secondary w-full flex items-center justify-center gap-2 cursor-pointer mb-1.5">
              <Upload size={13}/> Upload Tech Pack
              <input type="file" className="hidden" accept=".json,.pdf,.xlsx" onChange={handleUpload}/>
            </label>
            <p className="text-[11px] text-gray-400 text-center">JSON, PDF, XLSX</p>
            {uploadMsg && <p className="text-[11px] text-brand-green text-center mt-2">{uploadMsg}</p>}
          </div>

          <div className="card">
            <p className="text-xs font-medium text-gray-600 mb-2">Sections</p>
            <div className="space-y-1.5">
              {SECTIONS.map(s => (
                <div key={s} className="flex items-center gap-2">
                  <CheckCircle2 size={12} className={sectionComplete(s) ? 'text-brand-green' : 'text-gray-300'}/>
                  <span className={`text-xs ${sectionComplete(s) ? 'text-gray-700' : 'text-gray-400'}`}>{s}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Col 2: Style Info */}
        <div className="space-y-3">
          <div className="card">
            <p className="text-xs font-semibold text-gray-900 mb-4">Style Information</p>
            <div className="space-y-3">
              {([
                ['Style Name',       'styleName',     'text'],
                ['SKU / Style No.',  'sku',           'text'],
                ['Revision',         'revision',      'text'],
                ['Collection',       'collection',    'text'],
                ['Brand Name',       'brandName',     'text'],
                ['Client Name',      'clientName',    'text'],
                ['Designer',         'designer',      'text'],
                ['Fit Description',  'fitDescription','text'],
              ] as [string, keyof StyleInfo, string][]).map(([label, key]) => (
                <div key={key}>
                  <label className="text-[11px] text-gray-500 mb-1 block">{label}</label>
                  <input
                    type="text"
                    className="input-field text-xs py-2"
                    value={styleInfo[key]}
                    onChange={e => set(key, e.target.value)}
                    placeholder={label}
                  />
                </div>
              ))}
              <div>
                <label className="text-[11px] text-gray-500 mb-1 block">Date Created</label>
                <input type="date" className="input-field text-xs py-2" value={styleInfo.dateCreated} onChange={e => set('dateCreated', e.target.value)}/>
              </div>
              <SelectField label="Season" value={styleInfo.season} onChange={v => set('season', v)} options={SEASONS}/>
              <div>
                <label className="text-[11px] text-gray-500 mb-1 block">Garment Type</label>
                <p className="input-field text-xs py-2 text-gray-700">{styleInfo.garmentType}</p>
              </div>
              <SelectField label="Gender"       value={styleInfo.gender}      onChange={v => set('gender', v)}      options={GENDERS}/>
              <SelectField label="Age Category" value={styleInfo.ageCategory} onChange={v => set('ageCategory', v)} options={AGE_CATEGORIES}/>
              <SelectField label="Size Range"   value={styleInfo.sizeRange}   onChange={v => set('sizeRange', v)}   options={SIZE_RANGES}/>
            </div>
          </div>
        </div>

        {/* Col 3: Measurements + Pantones + Placement */}
        <div className="space-y-3">

          {/* Measurements */}
          <div className="card">
            {/* Template tab bar — two rows: tops / bottoms */}
            <div className="mb-3 space-y-1">
              {[
                ['T-Shirt', 'Hoodie', 'Crewneck', 'Zip Hoodie', 'Track Jacket', 'Windbreaker', 'Basketball Jersey'],
                ['Sweatpants', 'Track Pants', 'Basketball Shorts'],
              ].map((group, gi) => (
                <div key={gi} className="flex flex-wrap gap-1">
                  {group.map(t => (
                    <button
                      key={t}
                      onClick={() => switchTemplate(t)}
                      className={`px-2 py-0.5 rounded-full text-[10px] font-medium transition-colors whitespace-nowrap ${
                        styleInfo.garmentType === t
                          ? 'bg-brand-green text-white'
                          : 'bg-slate-100 text-gray-500 hover:bg-slate-200'
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between mb-2">
              <div>
                <p className="text-xs font-semibold text-gray-900">Measurements (inches)</p>
                <p className="text-[10px] text-gray-400 mt-0.5">{styleInfo.garmentType} · {Object.keys(measurements).length} rows</p>
              </div>
              <button
                onClick={handleAutoDetectMeasurements}
                disabled={detectingMeasurements || (!state.garment?.dataUrl && !designImage)}
                className="flex items-center gap-1.5 text-xs text-brand-green hover:text-brand-green-light disabled:opacity-40 disabled:cursor-not-allowed transition-colors font-medium"
              >
                {detectingMeasurements ? <><Loader2 size={11} className="animate-spin"/> Analyzing…</> : <><Sparkles size={11}/> Auto Detect</>}
              </button>
            </div>

            {measurementDetectInfo && <p className="text-[10px] text-brand-green bg-green-50 rounded-lg px-2.5 py-1.5 mb-2 leading-relaxed">{measurementDetectInfo}</p>}
            {measurementDetectError && <p className="text-[10px] text-red-500 mb-2">{measurementDetectError}</p>}

            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr>
                    <th className="text-left text-gray-400 pb-2 pr-2 font-normal whitespace-nowrap text-[11px]">Point of Measure</th>
                    {SIZES.map(s => <th key={s} className="text-center text-gray-400 pb-2 px-0.5 font-normal w-9 text-[11px]">{s}</th>)}
                    <th className="w-6"/>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(measurements).map(([row, vals]) => (
                    <tr key={row} className="border-t border-slate-100 group">
                      <td className="py-1 pr-1">
                        <input
                          className="text-[11px] text-gray-600 bg-transparent focus:bg-slate-50 rounded px-1 py-0.5 w-full focus:outline-none focus:ring-1 focus:ring-brand-green/30"
                          defaultValue={row}
                          onBlur={e => updateRowLabel(row, e.target.value)}
                        />
                      </td>
                      {vals.map((v, i) => (
                        <td key={i} className="py-1 px-0.5">
                          <input
                            type="number"
                            step="0.25"
                            value={v}
                            onChange={e => updateMeasurement(row, i, e.target.value)}
                            className="w-9 bg-slate-50 border border-slate-200 rounded px-0.5 py-1 text-center text-gray-700 text-[11px] focus:outline-none focus:border-brand-green"
                          />
                        </td>
                      ))}
                      <td className="py-1 pl-1">
                        <button
                          onClick={() => removeRow(row)}
                          className="text-gray-200 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all"
                        >
                          <Trash2 size={11}/>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Add custom row */}
            <div className="flex gap-2 mt-3 pt-3 border-t border-slate-100">
              <input
                className="input-field text-xs py-1.5 flex-1"
                placeholder="Add measurement row…"
                value={newRowLabel}
                onChange={e => setNewRowLabel(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addRow()}
              />
              <button onClick={addRow} className="btn-secondary px-3 shrink-0"><Plus size={13}/></button>
            </div>
          </div>

          {/* Pantones */}
          <div className="card">
            <p className="text-xs font-semibold text-gray-900 mb-3">Pantones</p>
            <div className="space-y-2 mb-3">
              {pantones.map((p, i) => (
                <div key={i} className="flex items-center gap-2 group">
                  <input type="color" value={p.color} onChange={e => setPantones(ps => ps.map((x, j) => j === i ? { ...x, color: e.target.value } : x))} className="w-8 h-8 rounded-lg border border-slate-200 cursor-pointer bg-transparent p-0.5"/>
                  <input className="input-field text-xs py-1.5 flex-1" value={p.name} onChange={e => setPantones(ps => ps.map((x, j) => j === i ? { ...x, name: e.target.value } : x))}/>
                  <button onClick={() => setPantones(ps => ps.filter((_, j) => j !== i))} className="text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"><Trash2 size={12}/></button>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <input type="color" value={newPantoneColor} onChange={e => setNewPantoneColor(e.target.value)} className="w-9 h-9 rounded-lg border border-slate-200 cursor-pointer bg-transparent p-0.5 shrink-0"/>
              <input className="input-field text-xs py-2 flex-1" placeholder="PANTONE 0000 C" value={newPantone} onChange={e => setNewPantone(e.target.value)} onKeyDown={e => e.key === 'Enter' && addPantone()}/>
              <button onClick={addPantone} className="btn-secondary px-3"><Plus size={14}/></button>
            </div>
          </div>

          {/* Graphic Placement */}
          <div className="card">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-semibold text-gray-900">Graphic Placement</p>
              <button onClick={() => setPlacements(p => [...p, { location: '', description: '' }])} className="text-xs text-brand-green hover:text-brand-green-light flex items-center gap-1">
                <Plus size={11}/> Add
              </button>
            </div>
            <button
              onClick={handleAutoDetect}
              disabled={detecting || !designImage}
              className="btn-primary w-full flex items-center justify-center gap-2 mb-3 disabled:opacity-50"
              title={designImage ? 'Analyze design and auto-fill placement specs' : 'Confirm a design in Phase 3 first'}
            >
              {detecting ? <><Loader2 size={13} className="animate-spin"/> Analyzing design…</> : <><Sparkles size={13}/> Auto Detect Placement</>}
            </button>
            {detectError && <p className="text-[11px] text-red-500 mb-2">{detectError}</p>}
            <div className="space-y-2">
              {placements.map((p, i) => (
                <div key={i} className="bg-slate-50 rounded-lg p-2.5 space-y-2 group">
                  <div className="flex items-center gap-2">
                    <input className="input-field text-xs py-1.5 flex-1" value={p.location} onChange={e => setPlacements(ps => ps.map((x, j) => j === i ? { ...x, location: e.target.value } : x))} placeholder="Location (Front, Back…)"/>
                    <button onClick={() => setPlacements(ps => ps.filter((_, j) => j !== i))} className="text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all shrink-0"><Trash2 size={12}/></button>
                  </div>
                  <textarea className="textarea-field text-xs py-1.5" rows={Math.max(2, p.description.split('\n').length)} value={p.description} onChange={e => setPlacements(ps => ps.map((x, j) => j === i ? { ...x, description: e.target.value } : x))} placeholder="Description / dimensions"/>
                </div>
              ))}
            </div>

            {state.garment && (
              <div className="mt-3 grid grid-cols-4 gap-2">
                {['Front', 'Back', 'Left Sleeve', 'Right Sleeve'].map(view => (
                  <div key={view} className="text-center">
                    <div className="bg-slate-50 rounded-lg flex items-center justify-center" style={{ height: 60 }}>
                      {state.garment?.svg
                        ? <div dangerouslySetInnerHTML={{ __html: state.garment.svg }} className="h-full [&>svg]:h-full [&>svg]:w-auto opacity-60" style={{ padding: 6 }}/>
                        : <img src={state.garment?.dataUrl} alt={view} className="h-full w-full object-contain p-2 opacity-60"/>}
                    </div>
                    <p className="text-[10px] text-gray-400 mt-1">{view}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Col 4: Summary + Actions */}
        <div className="space-y-3">
          <div className="card">
            <p className="text-xs font-medium text-gray-600 mb-3">Summary</p>
            <div className="space-y-2 text-xs">
              {styleInfo.styleName && <SummaryRow label="Style" value={styleInfo.styleName}/>}
              {styleInfo.sku && <SummaryRow label="SKU" value={styleInfo.sku}/>}
              {styleInfo.revision && <SummaryRow label="Rev." value={styleInfo.revision}/>}
              {styleInfo.season && <SummaryRow label="Season" value={styleInfo.season}/>}
              {styleInfo.brandName && <SummaryRow label="Brand" value={styleInfo.brandName}/>}
              {styleInfo.garmentType && <SummaryRow label="Type" value={styleInfo.garmentType}/>}
              {styleInfo.gender && <SummaryRow label="Gender" value={styleInfo.gender}/>}
              {styleInfo.sizeRange && <SummaryRow label="Sizes" value={styleInfo.sizeRange}/>}
              <SummaryRow label="Rows" value={`${Object.keys(measurements).length} measurements`}/>
            </div>
          </div>

          <div className="card">
            <p className="text-xs font-medium text-gray-600 mb-2">Sections</p>
            <div className="space-y-1.5">
              {SECTIONS.map(s => (
                <div key={s} className="flex items-center gap-2">
                  <CheckCircle2 size={11} className={sectionComplete(s) ? 'text-brand-green' : 'text-gray-300'}/>
                  <span className={`text-[11px] leading-tight ${sectionComplete(s) ? 'text-gray-700' : 'text-gray-400'}`}>{s}</span>
                </div>
              ))}
            </div>
          </div>

          <button
            onClick={() => onSendToProduction({ styleInfo, measurements, pantones, placements })}
            className="w-full flex items-center justify-center gap-2 bg-brand-green hover:bg-brand-green-light text-white font-medium py-3 px-4 rounded-xl transition-colors text-sm"
          >
            Send to Production <ArrowRight size={15}/>
          </button>

          <button onClick={downloadTechPack} className="btn-secondary w-full flex items-center justify-center gap-2">
            <Save size={14}/> Save Tech Pack
          </button>

          <button onClick={downloadTechPack} className="btn-secondary w-full flex items-center justify-center gap-2">
            <Download size={14}/> Download
          </button>
        </div>

      </div>
    </div>
  )
}

function SelectField({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: string[] }) {
  return (
    <div>
      <label className="text-[11px] text-gray-500 mb-1 block">{label}</label>
      <select className="input-field text-xs py-2" value={value} onChange={e => onChange(e.target.value)}>
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  )
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-gray-500 shrink-0">{label}</span>
      <span className="text-gray-700 truncate text-right">{value}</span>
    </div>
  )
}
