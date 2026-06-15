'use client'

import { useMemo, useState } from 'react'
import { Package, FileText, Table, Printer } from 'lucide-react'
import {
  buildTechPackDocument,
  techPackToPlainText,
  techPackToCsv,
  techPackToHtml,
  garmentDisplayName,
  type TechPackMeta,
} from '@/lib/fitBlocks/techPackExport'
import { fitLabel, type SizeGuideOverrides } from '@/lib/fitBlocks/sizeGuide'
import { getAllGarmentTypes, getFitLibrary } from '@/lib/fitBlocks'
import type { GarmentType, FitVariant } from '@/lib/fitBlocks/types'

interface Props {
  garmentType?: GarmentType
  fit?: FitVariant
  overrides?: SizeGuideOverrides
  meta?: TechPackMeta
  allowGarmentSwitch?: boolean
}

export default function TechPackExport({
  garmentType: initialGarment = 'short_sleeve_tee',
  fit: initialFit,
  overrides,
  meta = {},
  allowGarmentSwitch = true,
}: Props) {
  const [garment, setGarment] = useState<GarmentType>(initialGarment)
  const [fit, setFit] = useState<FitVariant | undefined>(initialFit)

  const doc = useMemo(
    () => buildTechPackDocument(garment, fit, overrides, meta),
    [garment, fit, overrides, meta],
  )

  const library = getFitLibrary(garment)

  if (!doc) {
    return <div className="p-6 text-sm text-grace-stone">No tech pack available for this garment.</div>
  }

  const base = `${garment}_${doc.fit}_techpack`

  function download(content: string, filename: string, type: string) {
    const blob = new Blob([content], { type })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  }

  function openPrintable() {
    const html = techPackToHtml(doc!)
    const w = window.open('', '_blank')
    if (w) { w.document.write(html); w.document.close() }
  }

  return (
    <div className="p-4 md:p-6 max-w-[1100px]">
      {/* Header */}
      <div className="mb-6 flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-grace-mist border border-grace-border flex items-center justify-center text-grace-ink">
            <Package size={18} />
          </div>
          <div>
            <h1 className="text-xl font-black text-grace-ink uppercase tracking-tight">Tech Pack Export</h1>
            <p className="text-grace-stone text-sm">Full graded spec sheet for your supplier. All inches.</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button onClick={() => download(techPackToPlainText(doc), `${base}.txt`, 'text/plain')} className="btn-secondary flex items-center gap-1.5">
            <FileText size={13} /> TXT
          </button>
          <button onClick={() => download(techPackToCsv(doc), `${base}.csv`, 'text/csv')} className="btn-secondary flex items-center gap-1.5">
            <Table size={13} /> CSV
          </button>
          <button onClick={openPrintable} className="btn-primary flex items-center gap-1.5">
            <Printer size={13} /> Print / PDF
          </button>
        </div>
      </div>

      {/* Selectors */}
      {allowGarmentSwitch && (
        <div className="mb-3 flex flex-wrap gap-1.5">
          {getAllGarmentTypes().map(g => (
            <button key={g} onClick={() => { setGarment(g); setFit(undefined) }}
              className={`px-3 py-1.5 rounded-full text-[11px] font-semibold tracking-wide transition-colors ${
                g === garment ? 'bg-grace-ink text-white' : 'bg-grace-mist text-grace-stone hover:text-grace-ink border border-grace-border'
              }`}>
              {garmentDisplayName(g)}
            </button>
          ))}
        </div>
      )}
      <div className="mb-5 flex flex-wrap items-center gap-1.5">
        <span className="text-[10px] font-bold tracking-[0.2em] uppercase text-grace-stone mr-1">Fit</span>
        {library.availableFits.map(f => (
          <button key={f} onClick={() => setFit(f)}
            className={`px-3 py-1.5 rounded-full text-[11px] font-semibold tracking-wide transition-colors ${
              f === doc.fit ? 'bg-grace-ink text-white' : 'bg-white text-grace-stone hover:text-grace-ink border border-grace-border'
            }`}>
            {fitLabel(f)}
          </button>
        ))}
      </div>

      {/* Measurement grid */}
      <div className="card p-0 overflow-x-auto mb-4">
        <div className="px-4 py-3 border-b border-grace-border">
          <p className="text-[10px] font-bold tracking-[0.2em] uppercase text-grace-stone">
            {garmentDisplayName(garment)} · {doc.fitLabel} · Graded XS–3XL
          </p>
        </div>
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b border-grace-border">
              <th className="text-left font-semibold text-grace-stone text-[11px] uppercase tracking-wider px-4 py-2.5 sticky left-0 bg-white">Point of Measure</th>
              {doc.sizes.map(s => (
                <th key={s} className="font-bold text-grace-ink text-xs px-3 py-2.5 text-center min-w-[56px]">{s}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {doc.measurementRows.map(row => (
              <tr key={row.key} className={`border-b border-grace-border last:border-0 ${row.tier === 'technical' ? 'bg-grace-red/[0.03]' : ''}`}>
                <td className="px-4 py-2.5 sticky left-0 bg-white">
                  <span className="font-semibold text-grace-ink text-[13px]">{row.label}</span>
                  {row.tier === 'technical' && (
                    <span className="ml-1.5 text-[8px] font-bold uppercase tracking-widest text-grace-red align-middle">Tech</span>
                  )}
                </td>
                {doc.sizes.map(s => (
                  <td key={s} className="px-3 py-2.5 text-center text-grace-ink text-[13px] tabular-nums">
                    {row.valuesDisplay[s] ?? '–'}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Placements */}
      <div className="card">
        <p className="text-[10px] font-bold tracking-[0.2em] uppercase text-grace-stone mb-3">
          Graphic Placement · sample size {doc.referenceSize}
        </p>
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-grace-border text-grace-stone">
              <th className="text-left font-semibold py-2">Location</th>
              <th className="text-left font-semibold py-2">Max Artwork</th>
              <th className="text-left font-semibold py-2">Offset</th>
              <th className="text-left font-semibold py-2">Notes</th>
            </tr>
          </thead>
          <tbody>
            {doc.placements.map((p, i) => (
              <tr key={i} className="border-b border-grace-border last:border-0">
                <td className="py-2 font-semibold text-grace-ink">{p.label}</td>
                <td className="py-2 text-grace-ink tabular-nums">{p.widthInches}" × {p.heightInches}"</td>
                <td className="py-2 text-grace-stone tabular-nums">x {p.xOffsetInches}", y {p.yOffsetInches}"</td>
                <td className="py-2 text-grace-stone">{p.notes}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-[11px] text-grace-stone mt-4 leading-relaxed">
        Measurements, callouts, and placements are sourced from the GRACE fit blocks via
        <span className="font-semibold text-grace-ink"> getTechnicalDrawingData()</span> — the same engine that powers the
        technical drawing. <span className="font-bold text-grace-red">Tech</span> rows are supplier-only and never appear on consumer size guides.
      </p>
    </div>
  )
}
