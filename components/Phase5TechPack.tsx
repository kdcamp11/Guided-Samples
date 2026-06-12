'use client'

import { useState } from 'react'
import { Plus, Upload, Download, Save, CheckCircle2, ArrowLeft, Trash2, ArrowRight, Sparkles, Loader2 } from 'lucide-react'
import { AppState } from '@/app/page'
import type { TechPackData } from '@/components/Phase6Production'

interface Props {
  state: AppState
  onBack: () => void
  onSendToProduction: (tp: TechPackData) => void
}

const SIZES = ['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL']

const DEFAULT_MEASUREMENTS: Record<string, number[]> = {
  'Chest (Flat)':    [19, 20, 21, 22, 23, 24, 25],
  'Length':          [26, 27, 28, 29, 30, 31, 32],
  'Sleeve Length':   [23, 24, 24.5, 25, 25.5, 26, 26.5],
  'Shoulder':        [16, 17, 18, 19, 20, 21, 22],
  'Armhole':         [8, 8.5, 9, 9.5, 10, 10.5, 11],
  'Bottom Opening':  [18, 19, 20, 21, 22, 23, 24],
}

const GARMENT_TYPES = ['Hoodie', 'Crewneck', 'T-Shirt', 'Long Sleeve', 'Jacket', 'Bomber', 'Jogger', 'Short', 'Other']
const GENDERS = ['Unisex', 'Men\'s', 'Women\'s', 'Kids']
const AGE_CATEGORIES = ['Adult', 'Youth', 'Toddler', 'Infant']
const SIZE_RANGES = ['XS–3XL', 'S–XL', 'S–2XL', 'XS–XL', 'One Size', 'Custom']
const SEASONS = ['SS24', 'FW24', 'SS25', 'FW25', 'SS26', 'FW26', 'Year Round']
const SECTIONS = [
  'Style Information',
  'Fabric & Material',
  'Measurements',
  'Pantones',
  'Graphic Placement',
  'Construction',
  'Notes & Finishes',
]

type StyleInfo = {
  styleName: string
  sku: string
  revision: string
  season: string
  collection: string
  brandName: string
  clientName: string
  dateCreated: string
  designer: string
  garmentType: string
  gender: string
  ageCategory: string
  fitDescription: string
  sizeRange: string
}

export default function Phase5TechPack({ state, onBack, onSendToProduction }: Props) {
  const today = new Date().toISOString().split('T')[0]

  const [styleInfo, setStyleInfo] = useState<StyleInfo>({
    styleName: 'GRACE HOODIE',
    sku: 'GRH-001',
    revision: 'A',
    season: 'FW25',
    collection: '',
    brandName: 'GRACE',
    clientName: '',
    dateCreated: today,
    designer: '',
    garmentType: 'Hoodie',
    gender: 'Unisex',
    ageCategory: 'Adult',
    fitDescription: 'Oversized',
    sizeRange: 'XS–3XL',
  })

  const [measurements, setMeasurements] = useState(DEFAULT_MEASUREMENTS)
  const [pantones, setPantones] = useState([{ color: '#184D3E', name: 'PANTONE 5535 C' }])
  const [newPantone, setNewPantone] = useState('')
  const [newPantoneColor, setNewPantoneColor] = useState('#888888')
  const [placements, setPlacements] = useState([
    { location: 'Front', description: 'Center chest logo placement' },
  ])
  const [uploadMsg, setUploadMsg] = useState('')
  const [detecting, setDetecting] = useState(false)
  const [detectError, setDetectError] = useState('')
  const [detectingMeasurements, setDetectingMeasurements] = useState(false)
  const [measurementDetectError, setMeasurementDetectError] = useState('')
  const [measurementDetectInfo, setMeasurementDetectInfo] = useState('')

  // The composite from Phase 3 (garment with logo applied) is the analysis input.
  // Fall back to the plain garment image if no composite exists yet.
  const designImage = state.design?.previewDataUrl || state.garment?.dataUrl || ''

  const handleAutoDetect = async () => {
    if (!designImage) {
      setDetectError('No applied-design image found — confirm your design in Phase 3 first.')
      return
    }
    setDetecting(true)
    setDetectError('')
    try {
      const sizeIndex = SIZES.indexOf('M')
      const res = await fetch('/api/detect-placement', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: designImage, measurements, sizeIndex }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Detection failed')
      setPlacements(ps => {
        const entry = { location: data.location, description: data.description }
        // Replace the first "Front" placement if present, otherwise prepend
        const idx = ps.findIndex(p => p.location.toLowerCase() === 'front')
        if (idx >= 0) return ps.map((p, i) => (i === idx ? entry : p))
        return [entry, ...ps]
      })
    } catch (e) {
      console.error('Placement detection failed:', e)
      setDetectError(e instanceof Error ? e.message : 'Detection failed. Please try again.')
    } finally {
      setDetecting(false)
    }
  }

  const handleAutoDetectMeasurements = async () => {
    const imageForAnalysis = state.garment?.dataUrl || designImage
    if (!imageForAnalysis) {
      setMeasurementDetectError('No garment image found — generate a garment in Phase 2 first.')
      return
    }
    setDetectingMeasurements(true)
    setMeasurementDetectError('')
    setMeasurementDetectInfo('')
    try {
      const res = await fetch('/api/detect-measurements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: imageForAnalysis }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Detection failed')
      setMeasurements(m => ({ ...m, ...data.measurements }))
      if (data.garmentType) setStyleInfo(s => ({
        ...s,
        garmentType: s.garmentType === 'Hoodie' // only override the default
          ? data.garmentType.charAt(0).toUpperCase() + data.garmentType.slice(1)
          : s.garmentType
      }))
      setMeasurementDetectInfo(
        `Detected ${data.garmentType ?? 'garment'} (${data.fit ?? 'regular'} fit). Size M from image: length ${data.sizeM.lengthM}", chest ${data.sizeM.chestFlatM}", shoulder ${data.sizeM.shoulderM}". All sizes graded from these — review and adjust as needed.`
      )
    } catch (e) {
      console.error('Measurement detection failed:', e)
      setMeasurementDetectError(e instanceof Error ? e.message : 'Detection failed. Please try again.')
    } finally {
      setDetectingMeasurements(false)
    }
  }

  const set = (key: keyof StyleInfo, value: string) =>
    setStyleInfo(s => ({ ...s, [key]: value }))

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.name.endsWith('.json')) {
      const reader = new FileReader()
      reader.onload = ev => {
        try {
          const data = JSON.parse(ev.target?.result as string)
          if (data.styleInfo) setStyleInfo(s => ({ ...s, ...data.styleInfo }))
          if (data.measurements) setMeasurements(m => ({ ...m, ...data.measurements }))
          if (Array.isArray(data.pantones)) setPantones(data.pantones)
          if (Array.isArray(data.placements)) setPlacements(data.placements)
          setUploadMsg(`Imported ${file.name}`)
        } catch {
          setUploadMsg('Could not parse JSON file')
        }
      }
      reader.readAsText(file)
    } else {
      setUploadMsg(`${file.name} attached`)
    }
    e.target.value = ''
  }

  const updateMeasurement = (row: string, sizeIdx: number, value: string) => {
    setMeasurements(m => ({
      ...m,
      [row]: m[row].map((v, i) => (i === sizeIdx ? parseFloat(value) || v : v)),
    }))
  }

  const addPantone = () => {
    if (!newPantone.trim()) return
    setPantones(p => [...p, { color: newPantoneColor, name: newPantone.trim() }])
    setNewPantone('')
    setNewPantoneColor('#888888')
  }

  const downloadTechPack = () => {
    const content = JSON.stringify({ styleInfo, measurements, pantones, placements }, null, 2)
    const blob = new Blob([content], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${styleInfo.styleName.replace(/\s+/g, '_')}_TechPack.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const sectionComplete = (section: string) => {
    if (section === 'Style Information') return !!styleInfo.styleName && !!styleInfo.sku
    if (section === 'Measurements') return true
    if (section === 'Pantones') return pantones.length > 0
    if (section === 'Graphic Placement') return placements.length > 0
    return true
  }

  return (
    <div className="p-6">
      <div className="mb-5 flex items-start justify-between">
        <div>
          <p className="phase-header">Phase 5</p>
          <h1 className="text-xl font-bold text-gray-900">Tech Pack & Specifications</h1>
          <p className="text-gray-500 text-sm mt-1">Fill in garment specifications, measurements, and placement details</p>
        </div>
        <button onClick={onBack} className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-700 transition-colors mt-1">
          <ArrowLeft size={14}/>
          Back
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[180px_1fr_1fr_180px] gap-4">

        {/* Col 1: Upload + sections */}
        <div className="space-y-3">
          <div className="card">
            <p className="text-xs font-medium text-gray-600 mb-2">Input Details</p>
            <p className="text-[11px] text-gray-400 mb-2">Fill out the form or</p>
            <label className="btn-secondary w-full flex items-center justify-center gap-2 cursor-pointer mb-1.5">
              <Upload size={13}/>
              Upload Tech Pack
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
                ['SKU / Style Number','sku',           'text'],
                ['Revision',         'revision',      'text'],
                ['Collection',       'collection',    'text'],
                ['Brand Name',       'brandName',     'text'],
                ['Client Name',      'clientName',    'text'],
                ['Designer',         'designer',      'text'],
                ['Fit Description',  'fitDescription','text'],
              ] as [string, keyof StyleInfo, string][]).map(([label, key, type]) => (
                <div key={key}>
                  <label className="text-[11px] text-gray-500 mb-1 block">{label}</label>
                  <input
                    type={type}
                    className="input-field text-xs py-2"
                    value={styleInfo[key]}
                    onChange={e => set(key, e.target.value)}
                    placeholder={label}
                  />
                </div>
              ))}

              <div>
                <label className="text-[11px] text-gray-500 mb-1 block">Date Created</label>
                <input
                  type="date"
                  className="input-field text-xs py-2"
                  value={styleInfo.dateCreated}
                  onChange={e => set('dateCreated', e.target.value)}
                />
              </div>

              <SelectField label="Season" value={styleInfo.season} onChange={v => set('season', v)} options={SEASONS}/>
              <SelectField label="Garment Type" value={styleInfo.garmentType} onChange={v => set('garmentType', v)} options={GARMENT_TYPES}/>
              <SelectField label="Gender" value={styleInfo.gender} onChange={v => set('gender', v)} options={GENDERS}/>
              <SelectField label="Age Category" value={styleInfo.ageCategory} onChange={v => set('ageCategory', v)} options={AGE_CATEGORIES}/>
              <SelectField label="Size Range" value={styleInfo.sizeRange} onChange={v => set('sizeRange', v)} options={SIZE_RANGES}/>
            </div>
          </div>
        </div>

        {/* Col 3: Measurements + Pantones + Placement */}
        <div className="space-y-3">

          <div className="card">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-semibold text-gray-900">Measurements (inches)</p>
              <button
                onClick={handleAutoDetectMeasurements}
                disabled={detectingMeasurements || (!state.garment?.dataUrl && !designImage)}
                className="flex items-center gap-1.5 text-xs text-brand-green hover:text-brand-green-light disabled:opacity-40 disabled:cursor-not-allowed transition-colors font-medium"
                title="Analyze garment image and estimate all measurements"
              >
                {detectingMeasurements
                  ? <><Loader2 size={11} className="animate-spin"/> Analyzing…</>
                  : <><Sparkles size={11}/> Auto Detect</>}
              </button>
            </div>
            {measurementDetectInfo && (
              <p className="text-[10px] text-brand-green bg-green-50 rounded-lg px-2.5 py-1.5 mb-2 leading-relaxed">{measurementDetectInfo}</p>
            )}
            {measurementDetectError && (
              <p className="text-[10px] text-red-500 mb-2">{measurementDetectError}</p>
            )}
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr>
                    <th className="text-left text-gray-500 pb-2 pr-2 font-normal whitespace-nowrap">Point of Measure</th>
                    {SIZES.map(s => (
                      <th key={s} className="text-center text-gray-500 pb-2 px-0.5 font-normal w-9">{s}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(measurements).map(([row, vals]) => (
                    <tr key={row} className="border-t border-slate-100">
                      <td className="py-1.5 pr-2 text-gray-600 whitespace-nowrap">{row}</td>
                      {vals.map((v, i) => (
                        <td key={i} className="py-1 px-0.5">
                          <input
                            type="number"
                            step="0.5"
                            value={v}
                            onChange={e => updateMeasurement(row, i, e.target.value)}
                            className="w-9 bg-slate-50 border border-slate-200 rounded px-1 py-1 text-center text-gray-700 text-xs focus:outline-none focus:border-brand-green"
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="card">
            <p className="text-xs font-semibold text-gray-900 mb-3">Pantones</p>
            <div className="space-y-2 mb-3">
              {pantones.map((p, i) => (
                <div key={i} className="flex items-center gap-2 group">
                  <input
                    type="color"
                    value={p.color}
                    onChange={e => setPantones(ps => ps.map((x, j) => j === i ? { ...x, color: e.target.value } : x))}
                    className="w-8 h-8 rounded-lg border border-slate-200 cursor-pointer bg-transparent p-0.5"
                  />
                  <input
                    className="input-field text-xs py-1.5 flex-1"
                    value={p.name}
                    onChange={e => setPantones(ps => ps.map((x, j) => j === i ? { ...x, name: e.target.value } : x))}
                  />
                  <button
                    onClick={() => setPantones(ps => ps.filter((_, j) => j !== i))}
                    className="text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"
                  >
                    <Trash2 size={12}/>
                  </button>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                type="color"
                value={newPantoneColor}
                onChange={e => setNewPantoneColor(e.target.value)}
                className="w-9 h-9 rounded-lg border border-slate-200 cursor-pointer bg-transparent p-0.5 shrink-0"
              />
              <input
                className="input-field text-xs py-2 flex-1"
                placeholder="PANTONE 0000 C"
                value={newPantone}
                onChange={e => setNewPantone(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addPantone()}
              />
              <button onClick={addPantone} className="btn-secondary px-3">
                <Plus size={14}/>
              </button>
            </div>
          </div>

          <div className="card">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-semibold text-gray-900">Graphic Placement</p>
              <button
                onClick={() => setPlacements(p => [...p, { location: '', description: '' }])}
                className="text-xs text-brand-green hover:text-brand-green-light flex items-center gap-1"
              >
                <Plus size={11}/> Add
              </button>
            </div>

            <button
              onClick={handleAutoDetect}
              disabled={detecting || !designImage}
              className="btn-primary w-full flex items-center justify-center gap-2 mb-3 disabled:opacity-50"
              title={designImage ? 'Analyze your applied design and auto-fill placement specs' : 'Confirm a design in Phase 3 first'}
            >
              {detecting ? <Loader2 size={13} className="animate-spin"/> : <Sparkles size={13}/>}
              {detecting ? 'Analyzing design…' : 'Auto Detect Placement'}
            </button>
            {detectError && <p className="text-[11px] text-red-500 mb-2">{detectError}</p>}
            <div className="space-y-2">
              {placements.map((p, i) => (
                <div key={i} className="bg-slate-50 rounded-lg p-2.5 space-y-2 group">
                  <div className="flex items-center gap-2">
                    <input
                      className="input-field text-xs py-1.5 flex-1"
                      value={p.location}
                      onChange={e => setPlacements(ps => ps.map((x, j) => j === i ? { ...x, location: e.target.value } : x))}
                      placeholder="Location (Front, Back…)"
                    />
                    <button
                      onClick={() => setPlacements(ps => ps.filter((_, j) => j !== i))}
                      className="text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all shrink-0"
                    >
                      <Trash2 size={12}/>
                    </button>
                  </div>
                  <textarea
                    className="textarea-field text-xs py-1.5"
                    rows={Math.max(2, p.description.split('\n').length)}
                    value={p.description}
                    onChange={e => setPlacements(ps => ps.map((x, j) => j === i ? { ...x, description: e.target.value } : x))}
                    placeholder="Description / dimensions"
                  />
                </div>
              ))}
            </div>

            {state.garment && (
              <div className="mt-3 grid grid-cols-4 gap-2">
                {['Front', 'Back', 'Left Sleeve', 'Right Sleeve'].map(view => (
                  <div key={view} className="text-center">
                    <div className="bg-slate-50 rounded-lg flex items-center justify-center" style={{ height: 60 }}>
                      {state.garment?.svg ? (
                        <div dangerouslySetInnerHTML={{ __html: state.garment.svg }} className="h-full [&>svg]:h-full [&>svg]:w-auto opacity-60" style={{ padding: 6 }}/>
                      ) : (
                        <img src={state.garment?.dataUrl} alt={view} className="h-full w-full object-contain p-2 opacity-60"/>
                      )}
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
              {styleInfo.ageCategory && <SummaryRow label="Age" value={styleInfo.ageCategory}/>}
              {styleInfo.sizeRange && <SummaryRow label="Sizes" value={styleInfo.sizeRange}/>}
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
            Send to Production
            <ArrowRight size={15}/>
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

function SelectField({ label, value, onChange, options }: {
  label: string; value: string; onChange: (v: string) => void; options: string[]
}) {
  return (
    <div>
      <label className="text-[11px] text-gray-500 mb-1 block">{label}</label>
      <select
        className="input-field text-xs py-2"
        value={value}
        onChange={e => onChange(e.target.value)}
      >
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
