/**
 * Production Hub — Workflow Stage definitions
 *
 * Single source of truth for the production_stage field on production_orders.
 * All portals (brand owner, factory, internal) derive their displayed status
 * from this one field — no parallel stage fields exist.
 *
 * Relationship to ProductionOrderStatus (types/production.ts):
 *   - `status` tracks payment lifecycle: pending_payment → paid → cancelled
 *   - `production_stage` tracks the factory lifecycle that begins after payment
 *   - A production order enters PRODUCTION_FILES_RECEIVED only after status = 'paid'
 */

// ─── Stage enum ───────────────────────────────────────────────────────────────

export const PRODUCTION_STAGES = [
  'PRODUCTION_FILES_RECEIVED',
  'FIRST_PIECE_IN_PRODUCTION',
  'FIRST_PIECE_REVIEW',
  'SAMPLE_SHIPPED',
  'SAMPLE_DELIVERED',
  'CLIENT_SAMPLE_EVALUATION',
  'REVISION_REQUIRED',
  'BULK_PRODUCTION',
  'QUALITY_CHECK',
  'PACKING',
  'SHIPPED',
  'DELIVERED',
  'CANCELLED',
] as const

export type ProductionStage = (typeof PRODUCTION_STAGES)[number]

// ─── Human-readable labels ────────────────────────────────────────────────────

export const STAGE_LABELS: Record<ProductionStage, string> = {
  PRODUCTION_FILES_RECEIVED:  'Production Files Received',
  FIRST_PIECE_IN_PRODUCTION:  'First Piece in Production',
  FIRST_PIECE_REVIEW:         'First Piece Review',
  SAMPLE_SHIPPED:             'Sample Shipped',
  SAMPLE_DELIVERED:           'Sample Delivered',
  CLIENT_SAMPLE_EVALUATION:   'Client Sample Evaluation',
  REVISION_REQUIRED:          'Revision Required',
  BULK_PRODUCTION:            'Bulk Production',
  QUALITY_CHECK:              'Quality Check',
  PACKING:                    'Packing',
  SHIPPED:                    'Shipped',
  DELIVERED:                  'Delivered',
  CANCELLED:                  'Cancelled',
}

// ─── Stage descriptions (for portal display) ──────────────────────────────────

export const STAGE_DESCRIPTIONS: Record<ProductionStage, string> = {
  PRODUCTION_FILES_RECEIVED:
    'Factory has received the approved tech pack and all production files.',
  FIRST_PIECE_IN_PRODUCTION:
    'Factory is constructing the first physical sample.',
  FIRST_PIECE_REVIEW:
    'First piece is complete and undergoing internal factory review before shipping.',
  SAMPLE_SHIPPED:
    'Pre-production sample is in transit to the brand owner.',
  SAMPLE_DELIVERED:
    'Sample has been delivered. Awaiting brand owner evaluation.',
  CLIENT_SAMPLE_EVALUATION:
    'Brand owner is reviewing the sample for fit, quality, and construction.',
  REVISION_REQUIRED:
    'Sample did not meet approval. Revision notes have been submitted to the factory.',
  BULK_PRODUCTION:
    'Sample approved. Factory is producing the full run.',
  QUALITY_CHECK:
    'Finished goods are undergoing final quality inspection.',
  PACKING:
    'Goods have passed QC and are being packed for shipment.',
  SHIPPED:
    'Bulk order is in transit. Tracking information available.',
  DELIVERED:
    'Order received and confirmed by the brand owner.',
  CANCELLED:
    'Production order has been cancelled.',
}

// ─── Terminal and reversible stages ──────────────────────────────────────────

/** No further transitions are permitted from these stages */
export const TERMINAL_STAGES = new Set<ProductionStage>(['DELIVERED', 'CANCELLED'])

/** Stages that can be cancelled */
export const CANCELLABLE_STAGES = new Set<ProductionStage>([
  'PRODUCTION_FILES_RECEIVED',
  'FIRST_PIECE_IN_PRODUCTION',
  'FIRST_PIECE_REVIEW',
  'REVISION_REQUIRED',
])

// ─── Transition graph ─────────────────────────────────────────────────────────
//
// Directed edges define every permitted stage hop.
// The engine rejects any transition not listed here.
//
// Visual flow:
//
//   PRODUCTION_FILES_RECEIVED
//     → FIRST_PIECE_IN_PRODUCTION
//
//   FIRST_PIECE_IN_PRODUCTION
//     → FIRST_PIECE_REVIEW
//
//   FIRST_PIECE_REVIEW
//     → SAMPLE_SHIPPED          (approved; ship to client)
//     → FIRST_PIECE_IN_PRODUCTION (internal rework; retry)
//
//   SAMPLE_SHIPPED
//     → SAMPLE_DELIVERED
//
//   SAMPLE_DELIVERED
//     → CLIENT_SAMPLE_EVALUATION
//
//   CLIENT_SAMPLE_EVALUATION
//     → BULK_PRODUCTION         (approved)
//     → REVISION_REQUIRED       (changes requested)
//
//   REVISION_REQUIRED
//     → FIRST_PIECE_IN_PRODUCTION (restart with new specs)
//
//   BULK_PRODUCTION
//     → QUALITY_CHECK
//
//   QUALITY_CHECK
//     → PACKING                 (passed)
//     → BULK_PRODUCTION         (failed; rework)
//
//   PACKING
//     → SHIPPED
//
//   SHIPPED
//     → DELIVERED
//
//   DELIVERED  → (terminal)
//   CANCELLED  → (terminal)
//
//   Any stage in CANCELLABLE_STAGES → CANCELLED

export const TRANSITION_GRAPH: Record<ProductionStage, ProductionStage[]> = {
  PRODUCTION_FILES_RECEIVED:  ['FIRST_PIECE_IN_PRODUCTION', 'CANCELLED'],
  FIRST_PIECE_IN_PRODUCTION:  ['FIRST_PIECE_REVIEW', 'CANCELLED'],
  FIRST_PIECE_REVIEW:         ['SAMPLE_SHIPPED', 'FIRST_PIECE_IN_PRODUCTION', 'CANCELLED'],
  SAMPLE_SHIPPED:             ['SAMPLE_DELIVERED'],
  SAMPLE_DELIVERED:           ['CLIENT_SAMPLE_EVALUATION'],
  CLIENT_SAMPLE_EVALUATION:   ['BULK_PRODUCTION', 'REVISION_REQUIRED', 'CANCELLED'],
  REVISION_REQUIRED:          ['FIRST_PIECE_IN_PRODUCTION', 'CANCELLED'],
  BULK_PRODUCTION:            ['QUALITY_CHECK'],
  QUALITY_CHECK:              ['PACKING', 'BULK_PRODUCTION'],
  PACKING:                    ['SHIPPED'],
  SHIPPED:                    ['DELIVERED'],
  DELIVERED:                  [],
  CANCELLED:                  [],
}

// ─── Metadata requirements per transition ─────────────────────────────────────
//
// Some transitions require specific metadata fields to be present.
// The validation layer uses this map to enforce completeness before writing.

export type MetadataField = {
  key:      string
  label:    string
  required: boolean
}

export const TRANSITION_METADATA_REQUIREMENTS: Partial<
  Record<ProductionStage, MetadataField[]>
> = {
  SAMPLE_SHIPPED: [
    { key: 'tracking_number', label: 'Tracking Number', required: true },
    { key: 'carrier',         label: 'Carrier',         required: true },
    { key: 'shipped_at',      label: 'Ship Date',        required: false },
  ],
  CLIENT_SAMPLE_EVALUATION: [
    { key: 'evaluation_notes', label: 'Evaluation Notes', required: false },
  ],
  REVISION_REQUIRED: [
    { key: 'revision_notes', label: 'Revision Notes', required: true },
  ],
  SHIPPED: [
    { key: 'tracking_number', label: 'Tracking Number', required: true },
    { key: 'carrier',         label: 'Carrier',         required: true },
  ],
  CANCELLED: [
    { key: 'cancellation_reason', label: 'Cancellation Reason', required: true },
  ],
  QUALITY_CHECK: [
    { key: 'qc_inspector', label: 'QC Inspector', required: false },
    { key: 'qc_notes',     label: 'QC Notes',     required: false },
  ],
  PACKING: [
    { key: 'packing_notes', label: 'Packing Notes', required: false },
  ],
}

// ─── Stage ordering (for progress display) ────────────────────────────────────
//
// The happy-path sequence, used to compute "percent complete" or highlight
// the current step in a progress indicator.  Revision loops collapse back;
// CANCELLED is excluded from the happy path.

export const HAPPY_PATH_SEQUENCE: ProductionStage[] = [
  'PRODUCTION_FILES_RECEIVED',
  'FIRST_PIECE_IN_PRODUCTION',
  'FIRST_PIECE_REVIEW',
  'SAMPLE_SHIPPED',
  'SAMPLE_DELIVERED',
  'CLIENT_SAMPLE_EVALUATION',
  'BULK_PRODUCTION',
  'QUALITY_CHECK',
  'PACKING',
  'SHIPPED',
  'DELIVERED',
]

/**
 * Returns a 0–1 progress fraction based on the happy-path sequence.
 * Returns 0 for CANCELLED, 1 for DELIVERED.
 * Revision loop stages (REVISION_REQUIRED, FIRST_PIECE_IN_PRODUCTION re-entry)
 * map to the position of FIRST_PIECE_IN_PRODUCTION.
 */
export function stageProgress(stage: ProductionStage): number {
  if (stage === 'CANCELLED') return 0
  const idx = HAPPY_PATH_SEQUENCE.indexOf(stage)
  if (idx === -1) {
    // REVISION_REQUIRED maps to roughly the position of FIRST_PIECE_IN_PRODUCTION
    return 1 / HAPPY_PATH_SEQUENCE.length
  }
  return (idx + 1) / HAPPY_PATH_SEQUENCE.length
}

// ─── Validation result type ───────────────────────────────────────────────────

export type TransitionValidationResult =
  | { valid: true }
  | { valid: false; errors: TransitionValidationError[] }

export type TransitionValidationError =
  | { code: 'TERMINAL_STAGE';      message: string }
  | { code: 'DISALLOWED_TRANSITION'; message: string; from: ProductionStage; to: ProductionStage }
  | { code: 'MISSING_METADATA';    message: string; field: string }
  | { code: 'INVALID_STAGE';       message: string; value: string }

// ─── Audit event types ────────────────────────────────────────────────────────

export type StageTransitionEvent = {
  from_stage:  ProductionStage | null   // null on initial stage assignment
  to_stage:    ProductionStage
  actor_id?:   string                   // user or system that triggered the transition
  metadata:    Record<string, unknown>
  transitioned_at: string               // ISO timestamp
}
