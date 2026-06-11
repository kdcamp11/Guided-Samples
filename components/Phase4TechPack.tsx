'use client'

import { useState } from 'react'
import { Plus, Upload, Download, Save, CheckCircle2, ArrowLeft } from 'lucide-react'
import { AppState } from '@/app/page'

interface Props {
  state: AppState
  onBack: () => void
}

const SIZES = ['S', 'M', 'L', 'XL', '2XL']

const DEFAULT_MEASUREMENTS: Record<string, number[]> = {
  'Chest (Flat)': [22, 23, 24, 25, 26],
  'Length': [27, 28, 29, 30, 31],
  'Sleeve Length': [24, 24.5, 25, 25.5, 26],
  'Shoulder': [22, 23, 24, 25, 26],
  'Bottom Opening': [18, 19, 20, 21, 22],
}

const SECTIONS = [
  'Style Information',
  'Fabric & Material',
  'Measurements',
  'Pantones',
  'Graphic Placement',
  'Construction',
  'Notes & Finishes',
]

export default function Phase4TechPack({ state, onBack }: Props) {
  const [styleInfo, setStyleInfo] = useState({
    styleName: 'GRACE HOODIE',
    sku: 'GRH-001',
    season: 'FW25',
    fitDescription: 'Oversized',
    garmentType: 'Hoodie',
    revision: 'A',
  })
  const [measurements, setMeasurements] = useState(DEFAULT_MEASUREMENTS)
  const [pantones, setPantones] = useState([{ color: '#184D3E', name: 'PANTONE 5535 C' }])
  const [newPantone, setNewPantone] = useState('')
  const [placements, setPlacements] = useState([
    { location: 'Front', description: 'Center chest logo placement' },
  ])
  const [completedSections, setCompletedSections] = useState<Set<string>>(
    new Set(['Style Information', 'Fabric & Material', 'Measurements', 'Pantones', 'Graphic Placement', 'Construction', 'Notes & Finishes'])
  )
  const [uploadMsg, setUploadMsg] = useState('')

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
      setUploadMsg(`${file.name} attached (PDF/XLSX parsing coming soon)`)
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
    setPantones(p => [...p, { color: '#888', name: newPantone.trim() }])
    setNewPantone('')
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

  return (
    <div className="p-6 max-w-[1200px]">
      <div className="mb-5 flex items-start justify-between">
        <div>
          <p className="phase-header">Phase 4</p>
          <h1 className="text-xl font-bold text-white">Tech Pack & Specifications</h1>
          <p className="text-gray-500 text-sm mt-1">Fill in garment specifications, measurements, and placement details</p>
        </div>
        <button onClick={onBack} className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-white transition-colors mt-1">
          <ArrowLeft size={14}/>
          Back
        </button>
      </div>

      <div className="grid grid-cols-[200px_1fr_1fr_200px] gap-4">
        {/* Col 1: Input / Upload */}
        <div className="space-y-3">
          <div className="card">
            <p className="text-xs font-medium text-gray-400 mb-3">Input Details</p>
            <p className="text-[11px] text-gray-600 mb-3">Fill out the spec sheet or</p>
            <label className="btn-secondary w-full flex items-center justify-center gap-2 cursor-pointer mb-2">
              <Upload size={13}/>
              Upload Tech Pack
              <input type="file" className="hidden" accept=".json,.pdf,.xlsx" onChange={handleUpload}/>
            </label>
            <p className="text-[11px] text-gray-600 text-center">Supported formats: JSON, PDF, XLSX</p>
            {uploadMsg && <p className="text-[11px] text-brand-green text-center mt-2">{uploadMsg}</p>}
          </div>

          {/* Section completion */}
          <div className="card">
            <p className="text-xs font-medium text-gray-400 mb-2">Sections</p>
            <div className="space-y-1.5">
              {SECTIONS.map(section => {
                const done = completedSections.has(section)
                return (
                  <div key={section} className="flex items-center gap-2">
                    <CheckCircle2 size={12} className={done ? 'text-brand-green' : 'text-gray-600'}/>
                    <span className={`text-xs ${done ? 'text-gray-300' : 'text-gray-600'}`}>{section}</span>
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        {/* Col 2: Style Info + Pantones */}
        <div className="space-y-3">
          <div className="card">
            <p className="text-xs font-medium text-gray-400 mb-3">Style Information</p>
            <div className="space-y-2.5">
              {[
                { label: 'Style Name', key: 'styleName' },
                { label: 'SKU / Style Number', key: 'sku' },
                { label: 'Season', key: 'season' },
                { label: 'Fit Description', key: 'fitDescription' },
                { label: 'Garment Type', key: 'garmentType' },
                { label: 'Revision', key: 'revision' },
              ].map(({ label, key }) => (
                <div key={key}>
                  <label className="text-[11px] text-gray-500 mb-1 block">{label}</label>
                  <input
                    className="input-field text-xs py-2"
                    value={styleInfo[key as keyof typeof styleInfo]}
                    onChange={e => setStyleInfo(s => ({ ...s, [key]: e.target.value }))}
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="card">
            <p className="text-xs font-medium text-gray-400 mb-3">Pantones</p>
            <div className="space-y-2 mb-3">
              {pantones.map((p, i) => (
                <div key={i} className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg border border-dark-400" style={{ background: p.color }}/>
                  <span className="text-xs text-gray-300">{p.name}</span>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
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
        </div>

        {/* Col 3: Measurements + Placements */}
        <div className="space-y-3">
          <div className="card">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-medium text-gray-400">Measurements (inches)</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr>
                    <th className="text-left text-gray-500 pb-2 pr-3 font-normal">Point</th>
                    {SIZES.map(s => (
                      <th key={s} className="text-center text-gray-500 pb-2 px-1 font-normal w-10">{s}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(measurements).map(([row, vals]) => (
                    <tr key={row} className="border-t border-dark-600">
                      <td className="py-2 pr-3 text-gray-400 whitespace-nowrap">{row}</td>
                      {vals.map((v, i) => (
                        <td key={i} className="py-1 px-1">
                          <input
                            type="number"
                            step="0.5"
                            value={v}
                            onChange={e => updateMeasurement(row, i, e.target.value)}
                            className="w-10 bg-dark-600 border border-dark-400 rounded px-1 py-1 text-center text-gray-300 text-xs focus:outline-none focus:border-brand-green"
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
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-medium text-gray-400">Graphic Placement</p>
              <button
                onClick={() => setPlacements(p => [...p, { location: 'New', description: '' }])}
                className="text-xs text-brand-green hover:text-green-400 flex items-center gap-1"
              >
                <Plus size={11}/> Add Placement
              </button>
            </div>
            <div className="space-y-2">
              {placements.map((p, i) => (
                <div key={i} className="bg-dark-600 rounded-lg p-2.5 space-y-2">
                  <input
                    className="input-field text-xs py-1.5"
                    value={p.location}
                    onChange={e => setPlacements(ps => ps.map((x, j) => j === i ? { ...x, location: e.target.value } : x))}
                    placeholder="Location (e.g. Front, Back)"
                  />
                  <input
                    className="input-field text-xs py-1.5"
                    value={p.description}
                    onChange={e => setPlacements(ps => ps.map((x, j) => j === i ? { ...x, description: e.target.value } : x))}
                    placeholder="Description"
                  />
                </div>
              ))}
            </div>

            {/* Placement diagram */}
            {state.garment && (
              <div className="mt-3 grid grid-cols-4 gap-2">
                {['Front', 'Back', 'Left Sleeve', 'Right Sleeve'].map(view => (
                  <div key={view} className="text-center">
                    <div className="bg-dark-600 rounded-lg flex items-center justify-center" style={{ height: 64 }}>
                      {state.garment?.svg ? (
                        <div
                          dangerouslySetInnerHTML={{ __html: state.garment.svg }}
                          className="h-full [&>svg]:h-full [&>svg]:w-auto opacity-60"
                          style={{ padding: 6 }}
                        />
                      ) : (
                        <img src={state.garment?.dataUrl} alt={view} className="h-full w-full object-contain p-2 opacity-60"/>
                      )}
                    </div>
                    <p className="text-[10px] text-gray-600 mt-1">{view}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Col 4: Summary */}
        <div className="space-y-3">
          <div className="card">
            <p className="text-xs font-medium text-gray-400 mb-3">Summary</p>
            <div className="space-y-1.5">
              {SECTIONS.map(section => (
                <div key={section} className="flex items-center gap-2">
                  <CheckCircle2 size={12} className="text-brand-green shrink-0"/>
                  <span className="text-xs text-gray-300">{section}</span>
                </div>
              ))}
            </div>
          </div>

          <button
            onClick={downloadTechPack}
            className="btn-primary w-full flex items-center justify-center gap-2"
          >
            <Save size={14}/>
            Save Tech Pack
          </button>

          <button
            onClick={downloadTechPack}
            className="btn-secondary w-full flex items-center justify-center gap-2"
          >
            <Download size={14}/>
            Download Tech Pack
          </button>

          <div className="card text-center">
            <div className="text-4xl mb-2">🎉</div>
            <p className="text-xs font-medium text-white mb-1">Design Complete!</p>
            <p className="text-[11px] text-gray-500">Your tech pack is ready to send to your manufacturer.</p>
          </div>
        </div>
      </div>
    </div>
  )
}
