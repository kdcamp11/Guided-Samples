// GRACE sizing — a reusable source of truth for measurements.
//
// A SizeProfile is a named, editable, persisted graded size chart. It can be
// created from a GRACE standard fit, a popular brand fit, or an uploaded chart,
// then reused across projects and referenced by Tech Packs, Production Review,
// and the GRACE Assistant.

export type SizeProfileSource = 'standard' | 'brand' | 'upload' | 'custom'

export interface SizeRow {
  /** Stable key, e.g. 'chest'. */
  key: string
  /** Human label, e.g. 'Chest'. */
  label: string
  unit: 'in' | 'cm'
  /** Per-size value, keyed by the size label (e.g. 'M'). */
  values: Record<string, number>
}

export interface SizeProfile {
  id: string
  name: string
  source: SizeProfileSource
  /** Optional links/provenance. */
  garmentType?: string
  fit?: string
  brand?: string
  sizes: string[]
  rows: SizeRow[]
  createdAt: string
  updatedAt: string
  isDefault?: boolean
}
