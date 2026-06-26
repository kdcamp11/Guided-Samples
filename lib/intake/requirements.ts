// Production intake — the deterministic core.
//
// Defines exactly what a complete production packet needs (parity with the data
// the build-it-yourself path sends to production), assesses what's present from
// real evidence (uploaded files + extracted size chart + captured answers), and
// assembles a sendable TechPackData once everything required is gathered.
//
// The LLM (see /api/intake) only phrases questions and parses typed answers into
// these fields — completeness is judged here, in code, so it can't be faked.

import { resolveGarmentType } from '@/lib/fitBlocks'
import { categoryOf } from '@/lib/fitBlocks/sizeGuide'
import { ALL_SIZES } from '@/lib/fitBlocks/types'
import type { SizeProfile } from '@/lib/sizing/types'
import type { TechPackData } from '@/components/Phase6Production'

// ── Captured, structured answers (from typed chat or extracted data) ────────────
export interface PacketFields {
  garmentType?: string
  styleName?: string
  brandName?: string
  colorway?: string
  season?: string
  gender?: string
  fabricContent?: string
  fabricWeight?: string
  construction?: string
  careInstructions?: string
  decorationMethod?: string
  placementNotes?: string
}

export const FIELD_KEYS: (keyof PacketFields)[] = [
  'garmentType', 'styleName', 'brandName', 'colorway', 'season', 'gender',
  'fabricContent', 'fabricWeight', 'construction', 'careInstructions',
  'decorationMethod', 'placementNotes',
]

// Deterministic extraction of high-confidence values from a single message, so a
// line like "250 gsm and screen printed" instantly fills BOTH fabric weight and
// decoration method — independent of the LLM (which still refines/extends this).
// Conservative on purpose: only unambiguous patterns, and skipped for questions.
const DECORATION_PATTERNS: [RegExp, string][] = [
  [/\bscreen[\s-]?print(?:ed|ing)?\b|\bsilk[\s-]?screen/i, 'Screen print'],
  [/\bdtg\b|direct[\s-]?to[\s-]?garment/i, 'DTG'],
  [/\bembroider(?:y|ed|ing)?\b/i, 'Embroidery'],
  [/\bsublimat(?:e|ed|ion)\b/i, 'Sublimation'],
  [/\bpuff\s?print(?:ed|ing)?\b/i, 'Puff print'],
  [/\b(?:htv|heat[\s-]?transfer|heat[\s-]?press|vinyl)\b/i, 'Heat transfer vinyl'],
  [/\bpatch(?:es)?\b/i, 'Patch'],
]

export function extractFieldsLocal(text: string): Partial<PacketFields> {
  const out: Partial<PacketFields> = {}
  const t = text.trim()
  if (!t || /\?\s*$/.test(t)) return out // don't capture from a question

  // Fabric weight: "250 gsm", "240 g/m2", "7 oz"
  const w = t.match(/(\d{1,4}(?:\.\d+)?)\s*(gsm|g\/m2?|g\/m²|oz\.?|ounces?)\b/i)
  if (w) out.fabricWeight = `${w[1]} ${/oz|ounce/i.test(w[2]) ? 'oz' : 'gsm'}`

  // Decoration method (first match wins)
  for (const [re, label] of DECORATION_PATTERNS) {
    if (re.test(t)) { out.decorationMethod = label; break }
  }

  // Fabric composition: "100% combed cotton", "50% cotton 50% polyester"
  const comp = Array.from(t.matchAll(/(\d{1,3})\s*%\s*([a-z][a-z\- ]{1,20}?)(?=[,/&]|\s*\d|\s+and\b|\.|$)/gi))
  if (comp.length) out.fabricContent = comp.map(m => `${m[1]}% ${m[2].trim()}`).join(', ')

  return out
}

// ── Everything we know so far ──────────────────────────────────────────────────
export interface IntakeEvidence {
  fields: PacketFields
  sizeProfile: SizeProfile | null
  artworkViews: { front: boolean; back: boolean; side: boolean }
  hasArtwork: boolean
  hasMockup: boolean
  pantones: { color: string; name: string }[]
}

// ── Size-chart validation against the "Select Fit" points of measure ────────────
const POM_SYNONYMS: Record<string, RegExp> = {
  chest: /chest|pit.?to.?pit|bust|½\s*chest|half.?chest/i,
  length: /\blength\b|body.?length|hps|front.?length/i,
  shoulder: /shoulder/i,
  sleeve: /sleeve/i,
  waist: /waist/i,
  rise: /\brise\b/i,
  inseam: /inseam|inside.?leg/i,
  thigh: /thigh/i,
  legOpening: /leg.?opening|bottom.?opening|\bhem\b|cuff/i,
}

const REQUIRED_POMS: Record<'top' | 'bottom', { required: string[]; recommended: string[] }> = {
  top: { required: ['chest', 'length'], recommended: ['shoulder', 'sleeve'] },
  bottom: { required: ['waist', 'inseam'], recommended: ['rise', 'thigh', 'legOpening'] },
}

export function packetCategory(fields: PacketFields): 'top' | 'bottom' {
  const g = fields.garmentType ? resolveGarmentType(fields.garmentType) : null
  if (!g) return 'top'
  try { return categoryOf(g) === 'bottom' ? 'bottom' : 'top' } catch { return 'top' }
}

export interface SizeChartValidation {
  ok: boolean
  gradedSizes: number
  missingRequired: string[]
  missingRecommended: string[]
}

export function validateSizeProfile(profile: SizeProfile | null, category: 'top' | 'bottom'): SizeChartValidation {
  if (!profile || !profile.rows.length) {
    return { ok: false, gradedSizes: 0, missingRequired: REQUIRED_POMS[category].required, missingRecommended: REQUIRED_POMS[category].recommended }
  }
  const labels = profile.rows.map(r => `${r.label} ${r.key}`)
  const has = (pom: string) => labels.some(l => POM_SYNONYMS[pom]?.test(l))
  const { required, recommended } = REQUIRED_POMS[category]
  const missingRequired = required.filter(p => !has(p))
  const missingRecommended = recommended.filter(p => !has(p))
  const gradedSizes = profile.sizes.filter(s => profile.rows.some(r => (r.values[s] ?? 0) > 0)).length
  return { ok: missingRequired.length === 0 && gradedSizes >= 3, gradedSizes, missingRequired, missingRecommended }
}

const POM_LABEL: Record<string, string> = {
  chest: 'chest', length: 'body length', shoulder: 'shoulder width', sleeve: 'sleeve length',
  waist: 'waist', rise: 'front rise', inseam: 'inseam', thigh: 'thigh', legOpening: 'leg opening',
}
export const pomLabels = (keys: string[]) => keys.map(k => POM_LABEL[k] ?? k)

// ── Packet requirement slots ────────────────────────────────────────────────────
export interface Slot {
  id: string
  label: string
  section: 'Garment' | 'Artwork' | 'Measurements' | 'Materials' | 'Decoration' | 'Color'
  required: boolean
  satisfied: (e: IntakeEvidence) => boolean
  /** A short note shown on the checklist when missing or partial. */
  detail: (e: IntakeEvidence) => string
}

export const SLOTS: Slot[] = [
  {
    id: 'garment', label: 'Garment type', section: 'Garment', required: true,
    satisfied: e => !!e.fields.garmentType?.trim(),
    detail: e => e.fields.garmentType?.trim() || 'What garment is this (e.g. heavyweight t-shirt, hoodie)?',
  },
  {
    id: 'brand', label: 'Brand / label', section: 'Garment', required: true,
    satisfied: e => !!e.fields.brandName?.trim(),
    detail: e => e.fields.brandName?.trim() || 'What brand or label is this produced under?',
  },
  {
    id: 'artwork', label: 'Print artwork', section: 'Artwork', required: true,
    satisfied: e => e.hasArtwork || e.artworkViews.front || e.artworkViews.back,
    detail: e => (e.hasArtwork || e.artworkViews.front || e.artworkViews.back)
      ? [e.artworkViews.front && 'front', e.artworkViews.back && 'back', e.artworkViews.side && 'side'].filter(Boolean).join(' + ') + ' detected'
      : 'Upload print-ready artwork (front at minimum) — PNG, SVG, or PDF.',
  },
  {
    id: 'placement', label: 'Placement spec', section: 'Artwork', required: true,
    satisfied: e => !!e.fields.placementNotes?.trim(),
    detail: e => e.fields.placementNotes?.trim() || 'Where does each graphic sit and at what size (e.g. center chest, 10in wide, 3in below collar)?',
  },
  {
    id: 'sizechart', label: 'Size chart', section: 'Measurements', required: true,
    satisfied: e => validateSizeProfile(e.sizeProfile, packetCategory(e.fields)).ok,
    detail: e => {
      const v = validateSizeProfile(e.sizeProfile, packetCategory(e.fields))
      if (v.ok) return `Graded ${e.sizeProfile?.sizes.join('/')} with required measurements`
      if (!e.sizeProfile) return 'Upload a size chart (CSV, PDF, or a clear photo) — or start from a GRACE standard fit.'
      if (v.missingRequired.length) return `Chart is missing required measurements: ${pomLabels(v.missingRequired).join(', ')}.`
      return `Add measurements across more sizes (need at least 3 graded).`
    },
  },
  {
    id: 'fabricContent', label: 'Fabric composition', section: 'Materials', required: true,
    satisfied: e => !!e.fields.fabricContent?.trim(),
    detail: e => e.fields.fabricContent?.trim() || 'Fabric composition (e.g. 100% combed cotton)?',
  },
  {
    id: 'fabricWeight', label: 'Fabric weight', section: 'Materials', required: true,
    satisfied: e => !!e.fields.fabricWeight?.trim(),
    detail: e => e.fields.fabricWeight?.trim() || 'Fabric weight (e.g. 240 gsm / 7 oz)?',
  },
  {
    id: 'decoration', label: 'Decoration method', section: 'Decoration', required: true,
    satisfied: e => !!e.fields.decorationMethod?.trim(),
    detail: e => e.fields.decorationMethod?.trim() || 'How is the artwork applied — screen print, DTG, embroidery, or sublimation?',
  },
  // Recommended (non-blocking) — strengthen the packet but don't gate sending.
  {
    id: 'colorway', label: 'Colorway', section: 'Color', required: false,
    satisfied: e => !!e.fields.colorway?.trim() || e.pantones.length > 0,
    detail: e => e.fields.colorway?.trim() || (e.pantones.length ? `${e.pantones.length} Pantone ref(s)` : 'Garment color / Pantone references (optional but recommended).'),
  },
  {
    id: 'season', label: 'Season', section: 'Garment', required: false,
    satisfied: e => !!e.fields.season?.trim(),
    detail: e => e.fields.season?.trim() || 'Season (optional, e.g. FW25).',
  },
]

export interface Assessment {
  rows: { slot: Slot; satisfied: boolean; detail: string }[]
  missingRequired: Slot[]
  firstGap: Slot | null
  requiredTotal: number
  requiredDone: number
  ready: boolean
}

export function assess(e: IntakeEvidence): Assessment {
  const rows = SLOTS.map(slot => ({ slot, satisfied: slot.satisfied(e), detail: slot.detail(e) }))
  const required = rows.filter(r => r.slot.required)
  const missingRequired = required.filter(r => !r.satisfied).map(r => r.slot)
  return {
    rows,
    missingRequired,
    firstGap: missingRequired[0] ?? null,
    requiredTotal: required.length,
    requiredDone: required.filter(r => r.satisfied).length,
    ready: missingRequired.length === 0,
  }
}

// ── Assemble the production packet (parity with the do-it-yourself path) ─────────
export function buildTechPack(e: IntakeEvidence): TechPackData {
  const f = e.fields
  const profile = e.sizeProfile
  const measurements: Record<string, number[]> = {}
  if (profile) {
    for (const row of profile.rows) {
      measurements[row.label] = ALL_SIZES.map(s => row.values[s] ?? 0)
    }
  }
  const supplierNotes = [
    f.decorationMethod ? `Decoration: ${f.decorationMethod}.` : '',
    f.placementNotes ? `Placement: ${f.placementNotes}` : '',
    f.construction ? `Construction: ${f.construction}.` : '',
  ].filter(Boolean).join(' ')

  return {
    styleInfo: {
      styleName: f.styleName || `${f.brandName ?? 'GRACE'} ${f.garmentType ?? 'Garment'}`.trim(),
      sku: '',
      revision: 'A',
      season: f.season ?? '',
      brandName: f.brandName ?? '',
      garmentType: f.garmentType ?? '',
      gender: f.gender ?? 'Unisex',
      sizeRange: profile?.sizes.join('–') ?? '',
      fitDescription: profile?.fit ?? '',
      fabricContent: f.fabricContent ?? '',
      fabricWeight: f.fabricWeight ?? '',
      construction: f.construction ?? '',
      careInstructions: f.careInstructions ?? '',
      supplierNotes,
      colorway: f.colorway ?? '',
      dateCreated: new Date().toISOString().split('T')[0],
    },
    measurements,
    pantones: e.pantones,
    placements: f.placementNotes ? [{ location: 'See spec', description: f.placementNotes }] : [],
  }
}
