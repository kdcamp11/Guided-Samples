'use client'

import { useMemo, useState } from 'react'
import { CheckCircle2, ChevronDown, ChevronUp, Download, Send, Save, Package } from 'lucide-react'
import {
  buildTechPackDocument,
  techPackToPlainText,
  techPackToCsv,
  techPackToHtml,
  garmentDisplayName,
  type TechPackMeta,
} from '@/lib/fitBlocks/techPackExport'
import { fitLabel, formatInches, type SizeGuideOverrides } from '@/lib/fitBlocks/sizeGuide'
import { getAllGarmentTypes, getFitLibrary } from '@/lib/fitBlocks'
import type { GarmentType, FitVariant } from '@/lib/fitBlocks/types'

interface Props {
  garmentType?: GarmentType
  fit?: FitVariant
  overrides?: SizeGuideOverrides
  meta?: TechPackMeta
  allowGarmentSwitch?: boolean
}

const CONSTRUCTION_NOTES: Record<string, string[]> = {
  short_sleeve_tee:  ['Single-needle stitching throughout', 'Ribbed neck collar, 1×1 rib', 'Shoulder-to-shoulder taping', 'Hemmed sleeves and body'],
  long_sleeve_tee:   ['Single-needle stitching throughout', 'Ribbed neck collar, 1×1 rib', 'Shoulder-to-shoulder taping', 'Hemmed sleeves and body'],
  crewneck:          ['Double-needle stitching', 'Ribbed crewneck collar, 2×2 rib', 'Ribbed cuffs and waistband', 'Pouch pocket optional'],
  hoodie:            ['Double-needle stitching', 'Lined hood with matching drawcord', 'Ribbed cuffs and waistband', 'Kangaroo pocket, self-fabric'],
  zip_hoodie:        ['Full-length YKK zipper', 'Lined hood with matching drawcord', 'Ribbed cuffs and waistband', 'Side-seam hand pockets'],
  track_jacket:      ['Full-length YKK zipper', 'Contrast trim at collar, cuffs, and hem', 'Side-seam hand pockets', 'Woven label at back neck'],
  windbreaker:       ['Full-length YKK zipper', 'Packable shell, no lining', 'Elastic cuffs and hem', 'Chest pocket, self-fabric'],
  sweatpants:        ['Elasticated waistband with internal drawcord', 'Ribbed ankle cuffs', 'Side-seam hand pockets', 'Single back pocket optional'],
  track_pants:       ['Elasticated waistband with internal drawcord', 'Contrast trim at outer leg seam', 'Side-seam hand pockets', 'Woven label at waistband'],
  shorts:            ['Elasticated waistband with internal drawcord', 'Side-seam hand pockets', 'Inseam liner optional', 'Single back pocket optional'],
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
  const [notesOpen, setNotesOpen] = useState(false)
  const [saved, setSaved] = useState(false)

  const doc = useMemo(
    () => buildTechPackDocument(garment, fit, overrides, meta),
    [garment, fit, overrides, meta],
  )

  const library = getFitLibrary(garment)

  if (!doc) {
    return <div className="p-6 text-sm text-grace-stone">No tech pack available for this garment.</div>
  }

  const base = `${garment}_${doc.fit}_techpack`
  const notes = CONSTRUCTION_NOTES[garment] ?? []

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

  function handleSave() {
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  return (
    <div className="p-4 md:p-6 max-w-[900px]">

      {/* Hero completion state */}
      <div className="mb-8 rounded-2xl border border-grace-border bg-grace-mist/40 px-6 py-7 flex flex-col sm:flex-row sm:items-center gap-5">
        <div className="w-12 h-12 rounded-full bg-grace-ink flex items-center justify-center shrink-0">
          <CheckCircle2 size={22} className="text-white" />
        </div>
        <div className="flex-1">
          <p className="text-[10px] font-bold tracking-[0.22em] uppercase text-grace-stone mb-0.5">Production Package</p>
          <h1 className="text-2xl font-black text-grace-ink uppercase tracking-tight leading-tight">
            Your tech pack is ready.
          </h1>
          <p className="text-grace-stone text-sm mt-1">
            {garmentDisplayName(garment)} · {doc.fitLabel} · Graded XS–3XL ·{' '}
            {meta.season && <span>{meta.season} · </span>}
            Sample size {doc.referenceSize}
          </p>
        </div>
      </div>

      {/* Garment / fit selectors */}
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
      <div className="mb-7 flex flex-wrap items-center gap-1.5">
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

      {/* Graphic Placements */}
      <div className="card mb-4">
        <p className="text-[10px] font-bold tracking-[0.22em] uppercase text-grace-stone mb-3">
          Graphic Placement · Sample size {doc.referenceSize}
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {doc.placements.map((p, i) => (
            <div key={i} className="rounded-xl border border-grace-border px-4 py-3 bg-grace-mist/30">
              <p className="text-[12px] font-bold text-grace-ink mb-0.5">{p.label}</p>
              <p className="text-[11px] text-grace-stone tabular-nums">
                {formatInches(p.widthInches)}" wide × {formatInches(p.heightInches)}" tall
              </p>
              <p className="text-[10px] text-grace-stone mt-0.5 leading-tight">{p.notes}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Construction Notes — collapsed by default */}
      <div className="card mb-6">
        <button
          onClick={() => setNotesOpen(v => !v)}
          className="w-full flex items-center justify-between text-left"
        >
          <p className="text-[10px] font-bold tracking-[0.22em] uppercase text-grace-stone">
            Construction Notes
          </p>
          {notesOpen ? <ChevronUp size={15} className="text-grace-stone"/> : <ChevronDown size={15} className="text-grace-stone"/>}
        </button>
        {notesOpen && (
          <ul className="mt-3 space-y-1.5 pt-3 border-t border-grace-border">
            {notes.map((note, i) => (
              <li key={i} className="flex items-start gap-2 text-[12px] text-grace-ink">
                <span className="mt-1.5 w-1 h-1 rounded-full bg-grace-ink shrink-0" />
                {note}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Primary actions */}
      <div className="flex flex-col sm:flex-row gap-3">
        <button
          onClick={handleSave}
          className="flex-1 flex items-center justify-center gap-2 py-3 px-6 rounded-full border border-grace-border bg-white text-grace-ink text-[12px] font-bold tracking-widest uppercase hover:bg-grace-mist transition-colors"
        >
          <Save size={14}/>
          {saved ? 'Saved!' : 'Save Draft'}
        </button>
        <button
          onClick={openPrintable}
          className="flex-1 flex items-center justify-center gap-2 py-3 px-6 rounded-full bg-grace-ink text-white text-[12px] font-bold tracking-widest uppercase hover:bg-zinc-800 transition-colors"
        >
          <Download size={14}/> Download Tech Pack
        </button>
        <button
          className="flex-1 flex items-center justify-center gap-2 py-3 px-6 rounded-full bg-grace-red text-white text-[12px] font-bold tracking-widest uppercase hover:bg-red-700 transition-colors"
          onClick={() => alert('Send to Production — connect your supplier integration.')}
        >
          <Send size={14}/> Send to Production
        </button>
      </div>

      {/* Utility export links */}
      <div className="mt-4 flex items-center gap-4 justify-center">
        <button
          onClick={() => download(techPackToPlainText(doc), `${base}.txt`, 'text/plain')}
          className="text-[11px] text-grace-stone hover:text-grace-ink underline underline-offset-2 transition-colors"
        >
          Export .TXT
        </button>
        <span className="text-grace-border">·</span>
        <button
          onClick={() => download(techPackToCsv(doc), `${base}.csv`, 'text/csv')}
          className="text-[11px] text-grace-stone hover:text-grace-ink underline underline-offset-2 transition-colors"
        >
          Export .CSV
        </button>
      </div>

      <p className="text-[10px] text-grace-stone mt-5 text-center leading-relaxed">
        Measurements sourced from GRACE fit blocks via getTechnicalDrawingData() · Graded XS–3XL
      </p>
    </div>
  )
}
