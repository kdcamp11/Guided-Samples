// GRACE prepress — production-readiness analysis pipeline.
//
// Modular by design: `checks.ts` registers independent inspections, `fixes.ts`
// registers AI resolver actions, and `analyze.ts` runs them and scores the
// result. New checks/fixes can be added without touching the UI.

export type Severity = 'pass' | 'warning' | 'critical' | 'info'

export type CheckCategory =
  | 'artwork' | 'color' | 'typography' | 'dimensions' | 'specs' | 'files'

export type FileKind = 'vector' | 'raster' | 'document' | 'spreadsheet' | 'other'

/** Real, parsed metadata extracted from a file's actual bytes/contents. */
export interface FileInspection {
  inspected: boolean
  // raster
  width?: number
  height?: number
  dpi?: number
  colorType?: 'gray' | 'rgb' | 'rgba' | 'indexed' | 'cmyk' | 'unknown'
  hasAlpha?: boolean
  // pdf / vector
  pages?: number
  pageSizeIn?: { w: number; h: number }
  hasLiveText?: boolean
  embeddedImages?: number
  vectorEmbeddedRaster?: boolean
  // shared signals
  cmyk?: boolean
  pantone?: boolean
  // tabular (size charts)
  isSizeChart?: boolean
  table?: { headers: string[]; rows: string[][] }
  notes?: string[]
}

/** What a vision model actually sees in an uploaded image (not filename guessing). */
export interface FileClassification {
  /** The image depicts a garment mockup / technical flat / on-body shot. */
  isGarmentMockup: boolean
  /** Garment views visible in the image. */
  views: { front: boolean; back: boolean; side: boolean }
  /** True only when the model genuinely classified the image. */
  classified: boolean
}

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
  inspection?: FileInspection
  /** Real vision classification of the image (mockup? which views?). */
  classification?: FileClassification
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
