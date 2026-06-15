'use client'

import { useMemo, useState } from 'react'
import { ChevronDown, Pencil, Check, X, RotateCcw } from 'lucide-react'
import {
  getConsumerSizeGuide,
  fitLabel,
  formatInches,
  type SizeGuideOverrides,
} from '@/lib/fitBlocks/sizeGuide'
import { getAllGarmentTypes } from '@/lib/fitBlocks'
import type { GarmentType, FitVariant, SizeKey } from '@/lib/fitBlocks/types'

interface Props {
  garmentType?: GarmentType
  fit?: FitVariant
  allowGarmentSwitch?: boolean
  editable?: boolean
  overrides?: SizeGuideOverrides
  onOverridesChange?: (next: SizeGuideOverrides) => void
}

const GARMENT_LABELS: Record<GarmentType, string> = {
  short_sleeve_tee: 'Short Sleeve Tee',
  long_sleeve_tee:  'Long Sleeve Tee',
  crewneck:         'Crewneck',
  hoodie:           'Hoodie',
  zip_hoodie:       'Zip Hoodie',
  track_jacket:     'Track Jacket',
  windbreaker:      'Windbreaker',
  sweatpants:       'Sweatpants',
  track_pants:      'Track Pants',
  shorts:           'Shorts',
}

const FIT_DESCRIPTIONS: Partial<Record<FitVariant, string>> = {
  standard:         'True-to-size. Clean lines, structured shoulder.',
  relaxed:          'Easy, lived-in feel. A little extra room throughout.',
  oversized:        'Intentionally large. Dropped shoulder, boxy silhouette.',
  vintage_oversized:'Soft oversize with a slightly shorter body. Faded-era proportions.',
  cropped:          'Cut above the natural waist. Pairs with high-rise bottoms.',
  wide_leg:         'Full, open leg from hip to hem. Contemporary silhouette.',
  tapered:          'Roomy at the hip, narrowing toward the ankle.',
  open_bottom:      'Relaxed through the leg with an open, unfinished hem.',
  vintage:          'Slightly shorter rise. Authentic retro proportions.',
}

export default function SizeGuide({
  garmentType: initialGarment = 'short_sleeve_tee',
  fit: initialFit,
  allowGarmentSwitch = true,
  editable = true,
  overrides: externalOverrides,
  onOverridesChange,
}: Props) {
  const [garment, setGarment] = useState<GarmentType>(initialGarment)
  const [fit, setFit] = useState<FitVariant | undefined>(initialFit)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<SizeGuideOverrides>(externalOverrides ?? {})

  const activeOverrides = editing ? draft : (externalOverrides ?? {})

  const guide = useMemo(
    () => getConsumerSizeGuide(garment, fit, activeOverrides),
    [garment, fit, activeOverrides],
  )

  if (!guide) {
    return <div className="p-6 text-sm text-grace-stone">No size guide available for this garment.</div>
  }

  const resolvedFit = guide.fit
  const fitDesc = FIT_DESCRIPTIONS[resolvedFit]

  function setDraftValue(measurementKey: string, size: SizeKey, raw: string) {
    const value = parseFloat(raw)
    setDraft(prev => {
      const next: SizeGuideOverrides = JSON.parse(JSON.stringify(prev))
      next[garment]       ??= {}
      next[garment][resolvedFit] ??= {}
      next[garment][resolvedFit][measurementKey] ??= {}
      if (Number.isFinite(value)) {
        next[garment][resolvedFit][measurementKey][size] = value
      } else {
        delete next[garment][resolvedFit][measurementKey][size]
      }
      return next
    })
  }

  function startEdit() { setDraft(externalOverrides ?? {}); setEditing(true) }
  function cancelEdit() { setDraft(externalOverrides ?? {}); setEditing(false) }
  function saveEdit() { onOverridesChange?.(draft); setEditing(false) }
  function resetFit() {
    setDraft(prev => {
      const next: SizeGuideOverrides = JSON.parse(JSON.stringify(prev))
      if (next[garment]) delete next[garment][resolvedFit]
      return next
    })
  }

  return (
    <div className="p-4 md:p-6 max-w-[900px]">

      {/* Garment selector */}
      {allowGarmentSwitch && (
        <div className="mb-8 flex flex-wrap gap-1.5">
          {getAllGarmentTypes().map(g => (
            <button
              key={g}
              onClick={() => { setGarment(g); setFit(undefined); setEditing(false) }}
              disabled={editing}
              className={`px-3 py-1.5 rounded-full text-[11px] font-semibold tracking-wide transition-colors disabled:opacity-40 ${
                g === garment
                  ? 'bg-grace-ink text-white'
                  : 'bg-grace-mist text-grace-stone hover:text-grace-ink border border-grace-border'
              }`}
            >
              {GARMENT_LABELS[g]}
            </button>
          ))}
        </div>
      )}

      {/* Fit selector — hero */}
      <div className="mb-8">
        <p className="text-[10px] font-bold tracking-[0.22em] uppercase text-grace-stone mb-3">Select Your Fit</p>
        <div className="flex flex-wrap gap-2">
          {guide.availableFits.map(f => (
            <button
              key={f}
              onClick={() => { setFit(f); setEditing(false) }}
              disabled={editing}
              className={`px-5 py-2.5 rounded-full text-[12px] font-bold tracking-wide transition-all disabled:opacity-40 ${
                f === resolvedFit
                  ? 'bg-grace-ink text-white shadow-md'
                  : 'bg-white text-grace-stone hover:text-grace-ink border border-grace-border hover:border-grace-ink'
              }`}
            >
              {fitLabel(f)}
              {f === guide.defaultFit && (
                <span className={`ml-2 text-[9px] font-semibold uppercase tracking-widest ${f === resolvedFit ? 'text-white/60' : 'text-grace-stone/60'}`}>
                  Default
                </span>
              )}
            </button>
          ))}
        </div>
        {fitDesc && (
          <p className="mt-2 text-[12px] text-grace-stone leading-relaxed pl-1">
            {fitDesc}
          </p>
        )}
      </div>

      {/* GRACE attribution + edit toggle */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="text-[10px] font-bold tracking-[0.22em] uppercase text-grace-stone">
            {GARMENT_LABELS[garment]} · {fitLabel(resolvedFit)}
          </p>
          <p className="text-[11px] text-grace-stone mt-0.5">
            Generated by GRACE based on your selected fit.
            {guide.edited && !editing && (
              <span className="ml-2 font-semibold text-grace-red">Edited</span>
            )}
          </p>
        </div>
        {editable && !editing && (
          <button
            onClick={startEdit}
            className="flex items-center gap-1.5 text-[11px] text-grace-stone hover:text-grace-ink font-medium transition-colors"
          >
            <Pencil size={12} /> Adjust
          </button>
        )}
        {editing && (
          <div className="flex items-center gap-2">
            <button onClick={cancelEdit} className="flex items-center gap-1 text-[11px] text-grace-stone hover:text-grace-ink">
              <X size={12}/> Cancel
            </button>
            <button onClick={saveEdit} className="flex items-center gap-1.5 text-[11px] font-semibold text-grace-ink bg-grace-ink text-white px-3 py-1 rounded-full">
              <Check size={12}/> Save
            </button>
          </div>
        )}
      </div>

      {/* Measurement table */}
      <div className="card overflow-x-auto p-0">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b border-grace-border">
              <th className="text-left font-semibold text-grace-stone text-[11px] uppercase tracking-wider px-4 py-3 sticky left-0 bg-white">
                Measurement
              </th>
              {guide.sizes.map(size => (
                <th key={size} className="font-bold text-grace-ink text-xs px-3 py-3 text-center min-w-[64px]">
                  {size}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {guide.rows.map(row => (
              <tr key={row.key} className="border-b border-grace-border last:border-0 hover:bg-grace-mist/40">
                <td className="px-4 py-3 sticky left-0 bg-white">
                  <div className="font-semibold text-grace-ink text-[13px]">{row.label}</div>
                  <div className="text-[10px] text-grace-stone leading-tight mt-0.5 max-w-[200px]">{row.hint}</div>
                </td>
                {guide.sizes.map(size => (
                  <td key={size} className="px-3 py-3 text-center">
                    {editing ? (
                      <input
                        type="number"
                        step="0.125"
                        defaultValue={row.values[size]}
                        onChange={e => setDraftValue(row.key, size, e.target.value)}
                        className="w-16 text-center text-[13px] rounded-lg border border-grace-border px-1.5 py-1 focus:outline-none focus:border-grace-ink"
                      />
                    ) : (
                      <span className="text-grace-ink text-[13px] tabular-nums">{formatInches(row.values[size])}</span>
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Footer */}
      <div className="mt-4 flex items-start justify-between gap-4">
        <p className="text-[11px] text-grace-stone leading-relaxed max-w-xl">
          Measurements shown flat in inches. Half-measurements (Chest, Waist, Thigh, Leg Opening) double for full circumference.
          Graded XS–3XL from the {fitLabel(resolvedFit)} fit block.
        </p>
        {editing && (
          <button
            onClick={resetFit}
            className="text-[11px] font-semibold text-grace-stone hover:text-grace-ink flex items-center gap-1 shrink-0"
          >
            <RotateCcw size={12} /> Reset to default
          </button>
        )}
      </div>
    </div>
  )
}
