// Build SizeProfiles from the three first-class sources: GRACE standard fits,
// popular brand fits (benchmarks), and uploaded charts. All deterministic/real.

import { getConsumerSizeGuide, fitLabel } from '@/lib/fitBlocks/sizeGuide'
import { getFitLibrary, getAllGarmentTypes, resolveGarmentType } from '@/lib/fitBlocks'
import { garmentDisplayName } from '@/lib/fitBlocks/techPackExport'
import { BENCHMARKS } from '@/lib/fitBlocks/benchmarks'
import { SIZE_STEPS } from '@/lib/fitBlocks/transformRules'
import { ALL_SIZES, type GarmentType, type SizeKey } from '@/lib/fitBlocks/types'
import type { SizeProfile, SizeRow } from './types'

const now = () => new Date().toISOString()
const uid = () => (globalThis.crypto?.randomUUID?.() ?? `sp-${Date.now()}-${Math.random().toString(36).slice(2)}`)
const round = (n: number) => Math.round(n * 4) / 4
const prettyKey = (k: string) => k.replace(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase()).trim()

export interface SourceOption { garmentType: GarmentType; label: string }

export function standardGarments(): SourceOption[] {
  return getAllGarmentTypes().map(g => ({ garmentType: g, label: garmentDisplayName(g) }))
}

export function fitsFor(garmentType: GarmentType): { value: string; label: string }[] {
  try { return getFitLibrary(garmentType).availableFits.map(f => ({ value: f, label: fitLabel(f) })) }
  catch { return [] }
}

export function brandGarments(): { garmentType: GarmentType; label: string; brand: string; product: string }[] {
  return getAllGarmentTypes()
    .filter(g => BENCHMARKS[g])
    .map(g => ({ garmentType: g, label: garmentDisplayName(g), brand: BENCHMARKS[g].source.brand, product: BENCHMARKS[g].source.productName }))
}

// ── GRACE standard fit → profile ────────────────────────────────────────────────
export function fromStandardFit(garmentType: GarmentType, fit?: string): SizeProfile | null {
  const guide = getConsumerSizeGuide(garmentType, fit as never)
  if (!guide) return null
  const rows: SizeRow[] = guide.rows.map(r => ({
    key: r.key, label: r.label, unit: 'in',
    values: Object.fromEntries(guide.sizes.map(s => [s, round(r.values[s] ?? 0)])),
  }))
  return base({
    name: `GRACE ${garmentDisplayName(garmentType)} · ${fitLabel(guide.fit)}`,
    source: 'standard', garmentType, fit: guide.fit, sizes: [...guide.sizes], rows,
  })
}

// ── Popular brand fit (benchmark) → profile ─────────────────────────────────────
export function fromBrand(garmentType: GarmentType): SizeProfile | null {
  const b = BENCHMARKS[garmentType]
  if (!b) return null
  const sizes = [...ALL_SIZES]
  const rows: SizeRow[] = Object.entries(b.publishedMeasurementsAtM).map(([key, atM]) => {
    const grade = b.publishedGrade[key] ?? 0
    return {
      key, label: prettyKey(key), unit: 'in',
      values: Object.fromEntries(sizes.map(s => [s, round(atM + grade * (SIZE_STEPS[s as SizeKey] ?? 0))])),
    }
  })
  return base({
    name: `${b.source.brand} · ${b.source.productName}`,
    source: 'brand', garmentType, brand: b.source.brand, sizes, rows,
  })
}

// ── Uploaded CSV → profile ──────────────────────────────────────────────────────
export function fromCsv(text: string, name = 'Uploaded size chart'): SizeProfile | null {
  const lines = text.split(/\r?\n/).filter(l => l.trim()).map(splitCsv)
  if (lines.length < 2) return null
  const header = lines[0]
  const sizes = header.slice(1).map(h => h.trim()).filter(Boolean)
  if (!sizes.length) return null
  const cm = /\bcm\b/i.test(text) && !/\bin(ch)?\b/i.test(text)
  const rows: SizeRow[] = lines.slice(1).map(cells => {
    const label = (cells[0] || '').trim() || 'Measurement'
    return {
      key: label.toLowerCase().replace(/[^a-z0-9]+/g, '_'),
      label, unit: (cm ? 'cm' : 'in') as SizeRow['unit'],
      values: Object.fromEntries(sizes.map((s, i) => [s, parseFloat(cells[i + 1]) || 0])),
    }
  }).filter(r => Object.values(r.values).some(v => v > 0))
  if (!rows.length) return null
  return base({ name, source: 'upload', sizes, rows })
}

/** Build an empty editable profile (manual entry / AI-extraction fallback). */
export function blankProfile(name = 'New size chart', sizes = [...ALL_SIZES] as string[]): SizeProfile {
  const measure = (label: string): SizeRow => ({ key: label.toLowerCase(), label, unit: 'in', values: Object.fromEntries(sizes.map(s => [s, 0])) })
  return base({ name, source: 'custom', sizes, rows: [measure('Chest'), measure('Length'), measure('Sleeve')] })
}

export function profileToCsv(p: SizeProfile): string {
  const head = [`Measurement (${p.rows[0]?.unit ?? 'in'})`, ...p.sizes].join(',')
  const body = p.rows.map(r => [csv(r.label), ...p.sizes.map(s => r.values[s] ?? '')].join(','))
  return [head, ...body].join('\n') + `\n# ${p.name} · graded ${p.sizes.join('/')} · GRACE`
}

function base(p: Omit<SizeProfile, 'id' | 'createdAt' | 'updatedAt'>): SizeProfile {
  const t = now()
  return { id: uid(), createdAt: t, updatedAt: t, ...p }
}

const csv = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s)
function splitCsv(line: string): string[] {
  const out: string[] = []; let cur = '', q = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (c === '"') { if (q && line[i + 1] === '"') { cur += '"'; i++ } else q = !q }
    else if (c === ',' && !q) { out.push(cur); cur = '' } else cur += c
  }
  out.push(cur); return out
}
