// GRACE prepress — production-readiness analysis pipeline.
//
// Modular by design: `checks.ts` registers independent inspections, `fixes.ts`
// registers AI resolver actions, and `analyze.ts` runs them and scores the
// result. New checks/fixes can be added without touching the UI.

export type Severity = 'pass' | 'warning' | 'critical' | 'info'

export type CheckCategory =
  | 'artwork' | 'color' | 'typography' | 'dimensions' | 'specs' | 'files'

export type FileKind = 'vector' | 'raster' | 'document' | 'spreadsheet' | 'other'

export interface UploadedFile {
  id: string
  name: string
  size: number
  type: string
  ext: string
  kind: FileKind
  width?: number
  height?: number
  dataUrl?: string
}

export interface FixAction {
  /** Resolver id — see fixes.ts. */
  id: string
  label: string
  description?: string
}

export interface CheckResult {
  id: string
  label: string
  category: CheckCategory
  status: Severity
  detail: string
  evidence?: string[]
  /** AI actions offered to resolve a warning/critical. */
  fixes?: FixAction[]
  /** Set once an AI fix has resolved this item. */
  resolvedBy?: string
}

export interface PrepressReport {
  score: number
  ready: boolean
  generatedAt: string
  files: UploadedFile[]
  results: CheckResult[]
  summary: { pass: number; warning: number; critical: number }
}

export const CATEGORY_LABEL: Record<CheckCategory, string> = {
  artwork: 'Artwork',
  color: 'Color',
  typography: 'Typography',
  dimensions: 'Dimensions & Bleed',
  specs: 'Specifications',
  files: 'Files',
}
