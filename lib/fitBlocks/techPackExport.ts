// GRACE Tech Pack Export.
//
// RULE: measurements, callouts, and graphic placements all come from
// getTechnicalDrawingData(). This module does NOT recreate sizing/grading logic
// and does NOT read from the consumer size guide. It iterates the existing
// per-size drawing data to assemble a full graded spec sheet for suppliers.

import { getTechnicalDrawingData, type DrawingPlacement } from './technicalDrawing'
import { fitLabel, formatInches } from './sizeGuide'
import { ALL_SIZES } from './types'
import type { GarmentType, FitVariant, SizeKey } from './types'
import type { SizeGuideOverrides } from './sizeGuide'

export interface TechPackMeta {
  styleName?: string
  sku?: string
  brand?: string
  season?: string
  revision?: string
  fabric?: string
  careInstructions?: string
  supplierNotes?: string
}

export interface TechPackMeasurementRow {
  key: string
  label: string
  tier: 'consumer' | 'technical'
  valuesInches: Record<SizeKey, number>
  valuesDisplay: Record<SizeKey, string>
}

export interface TechPackDocument {
  garmentType: GarmentType
  fit: FitVariant
  fitLabel: string
  category: 'top' | 'bottom'
  sizes: readonly SizeKey[]
  /** Sample size used as the placement reference (M). */
  referenceSize: SizeKey
  measurementRows: TechPackMeasurementRow[]
  /** Graphic placements graded to the reference size. */
  placements: DrawingPlacement[]
  meta: TechPackMeta
  generatedAt: string
  /** Provenance — confirms the measurement source. */
  source: 'getTechnicalDrawingData'
}

const REFERENCE_SIZE: SizeKey = 'M'

/**
 * Build the full tech pack document. Iterates ALL sizes through
 * getTechnicalDrawingData() — the single source for measurements, callouts,
 * and placements — so no sizing logic is duplicated here.
 */
export function buildTechPackDocument(
  garmentType: GarmentType,
  fit?: FitVariant,
  overrides?: SizeGuideOverrides,
  meta: TechPackMeta = {},
): TechPackDocument | null {
  // Pull each size's drawing data.
  const perSize: Partial<Record<SizeKey, ReturnType<typeof getTechnicalDrawingData>>> = {}
  for (const size of ALL_SIZES) {
    perSize[size] = getTechnicalDrawingData(garmentType, fit, size, overrides)
  }

  const reference = perSize[REFERENCE_SIZE]
  if (!reference) return null

  // Use the reference size's callouts to define the row set (key/label/tier).
  const measurementRows: TechPackMeasurementRow[] = reference.callouts.map(c => {
    const valuesInches = {} as Record<SizeKey, number>
    const valuesDisplay = {} as Record<SizeKey, string>
    for (const size of ALL_SIZES) {
      const v = perSize[size]?.measurements[c.key]
      if (v != null) {
        valuesInches[size] = v
        valuesDisplay[size] = formatInches(v)
      }
    }
    return { key: c.key, label: c.label, tier: c.tier, valuesInches, valuesDisplay }
  })

  return {
    garmentType,
    fit: reference.fit,
    fitLabel: reference.fitLabel,
    category: reference.category,
    sizes: ALL_SIZES,
    referenceSize: REFERENCE_SIZE,
    measurementRows,
    placements: reference.placements,
    meta,
    generatedAt: new Date().toISOString(),
    source: 'getTechnicalDrawingData',
  }
}

// ── Serializers ────────────────────────────────────────────────────────────────

const GARMENT_DISPLAY: Record<GarmentType, string> = {
  short_sleeve_tee: 'Short Sleeve Tee', long_sleeve_tee: 'Long Sleeve Tee', crewneck: 'Crewneck',
  hoodie: 'Hoodie', zip_hoodie: 'Zip Hoodie', track_jacket: 'Track Jacket', windbreaker: 'Windbreaker',
  sweatpants: 'Sweatpants', track_pants: 'Track Pants', shorts: 'Shorts',
}

export function garmentDisplayName(g: GarmentType): string {
  return GARMENT_DISPLAY[g] ?? g
}

/** Plain-text spec sheet for the supplier package (.txt). */
export function techPackToPlainText(doc: TechPackDocument): string {
  const L: string[] = []
  const m = doc.meta
  L.push('=== GRACE TECH PACK ===', '')
  L.push(`Garment: ${garmentDisplayName(doc.garmentType)}   Fit: ${doc.fitLabel}`)
  if (m.styleName || m.sku) L.push(`Style: ${m.styleName ?? ''}   SKU: ${m.sku ?? ''}`)
  if (m.brand || m.season) L.push(`Brand: ${m.brand ?? ''}   Season: ${m.season ?? ''}   Rev: ${m.revision ?? ''}`)
  L.push(`Sample size: ${doc.referenceSize}   Generated: ${doc.generatedAt.slice(0, 10)}`)
  L.push('')

  L.push('MEASUREMENTS (inches)')
  L.push(['Point of Measure', ...doc.sizes].join('\t'))
  for (const row of doc.measurementRows) {
    const tag = row.tier === 'technical' ? ' [TECH]' : ''
    L.push([`${row.label}${tag}`, ...doc.sizes.map(s => row.valuesDisplay[s] ?? '–')].join('\t'))
  }
  L.push('')

  L.push('GRAPHIC PLACEMENT (at sample size ' + doc.referenceSize + ')')
  for (const p of doc.placements) {
    L.push(`  ${p.label}: max ${formatInches(p.widthInches)}" W × ${formatInches(p.heightInches)}" H`)
    L.push(`    offset x ${p.xOffsetInches}"  y ${p.yOffsetInches}"  — ${p.notes}`)
  }
  L.push('')

  if (m.fabric) L.push('FABRIC', `  ${m.fabric}`, '')
  if (m.careInstructions) L.push('CARE', `  ${m.careInstructions}`, '')
  if (m.supplierNotes) L.push('NOTES TO SUPPLIER', `  ${m.supplierNotes}`, '')

  L.push('Measurements sourced from GRACE fit blocks via getTechnicalDrawingData().')
  return L.join('\n')
}

/** CSV of the graded measurement grid. */
export function techPackToCsv(doc: TechPackDocument): string {
  const head = ['Point of Measure', 'Tier', ...doc.sizes].join(',')
  const rows = doc.measurementRows.map(row =>
    [escapeCsv(row.label), row.tier, ...doc.sizes.map(s => row.valuesInches[s] ?? '')].join(','),
  )
  return [head, ...rows].join('\n')
}

/** Printable standalone HTML document. */
export function techPackToHtml(doc: TechPackDocument): string {
  const m = doc.meta
  const measRows = doc.measurementRows.map(row => `
    <tr class="${row.tier}">
      <td class="pom">${row.label}${row.tier === 'technical' ? '<span class="tech">TECH</span>' : ''}</td>
      ${doc.sizes.map(s => `<td>${row.valuesDisplay[s] ?? '–'}</td>`).join('')}
    </tr>`).join('')

  const placeRows = doc.placements.map(p => `
    <tr>
      <td><strong>${p.label}</strong></td>
      <td>${formatInches(p.widthInches)}" × ${formatInches(p.heightInches)}"</td>
      <td>x ${p.xOffsetInches}", y ${p.yOffsetInches}"</td>
      <td class="notes">${p.notes}</td>
    </tr>`).join('')

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>GRACE Tech Pack — ${garmentDisplayName(doc.garmentType)}</title>
<style>
  body{font-family:Inter,-apple-system,sans-serif;color:#0A0A0A;max-width:900px;margin:0 auto;padding:40px}
  h1{font-size:22px;text-transform:uppercase;letter-spacing:-0.02em;margin:0 0 4px}
  .sub{color:#6B6B6B;font-size:13px;margin-bottom:24px}
  .meta{display:grid;grid-template-columns:repeat(2,1fr);gap:6px 24px;font-size:13px;margin-bottom:28px;border:1px solid #E4E4E4;border-radius:12px;padding:16px}
  .meta span{color:#6B6B6B}
  h2{font-size:11px;text-transform:uppercase;letter-spacing:0.18em;color:#6B6B6B;margin:28px 0 10px}
  table{width:100%;border-collapse:collapse;font-size:12px}
  th,td{border:1px solid #E4E4E4;padding:6px 8px;text-align:center}
  th{background:#F7F7F7;font-weight:700}
  td.pom,th:first-child{text-align:left}
  tr.technical{background:#fdf6f5}
  .tech{font-size:8px;font-weight:700;color:#C8372D;margin-left:6px;letter-spacing:0.1em}
  td.notes{font-size:10px;color:#6B6B6B;text-align:left}
  .foot{margin-top:24px;font-size:10px;color:#6B6B6B}
</style></head><body>
  <h1>${garmentDisplayName(doc.garmentType)} — ${doc.fitLabel}</h1>
  <div class="sub">GRACE Tech Pack · Sample size ${doc.referenceSize} · ${doc.generatedAt.slice(0, 10)}</div>
  <div class="meta">
    <div><span>Style</span> ${m.styleName ?? '—'}</div>
    <div><span>SKU</span> ${m.sku ?? '—'}</div>
    <div><span>Brand</span> ${m.brand ?? '—'}</div>
    <div><span>Season</span> ${m.season ?? '—'}</div>
    <div><span>Revision</span> ${m.revision ?? '—'}</div>
    <div><span>Fabric</span> ${m.fabric ?? '—'}</div>
  </div>
  <h2>Measurements (inches)</h2>
  <table><thead><tr><th>Point of Measure</th>${doc.sizes.map(s => `<th>${s}</th>`).join('')}</tr></thead>
  <tbody>${measRows}</tbody></table>
  <h2>Graphic Placement (sample size ${doc.referenceSize})</h2>
  <table><thead><tr><th>Location</th><th>Max Artwork</th><th>Offset</th><th>Notes</th></tr></thead>
  <tbody>${placeRows}</tbody></table>
  ${m.supplierNotes ? `<h2>Notes to Supplier</h2><p style="font-size:13px">${m.supplierNotes}</p>` : ''}
  <div class="foot">Measurements sourced from GRACE fit blocks via getTechnicalDrawingData(). TECH rows are supplier-only.</div>
</body></html>`
}

function escapeCsv(s: string): string {
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}
