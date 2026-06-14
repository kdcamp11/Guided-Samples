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
  'AWAITING_FIRST_PIECE',
  'CLOSED_SAMPLE_ONLY',
  'AWAITING_PRODUCTION_DEPOSIT',
  'AWAITING_FINAL_PAYMENT',
  'READY_TO_SHIP',
] as const

export type ProductionStage = (typeof PRODUCTION_STAGES)[number]

// ─── Human-readable labels ────────────────────────────────────────────────────

export const STAGE_LABELS: Record<ProductionStage, string> = {
  PRODUCTION_FILES_RECEIVED:    'Production Files Received',
  FIRST_PIECE_IN_PRODUCTION:    'First Piece in Production',
  FIRST_PIECE_REVIEW:           'First Piece Review',
  SAMPLE_SHIPPED:               'Sample Shipped',
  SAMPLE_DELIVERED:             'Sample Delivered',
  CLIENT_SAMPLE_EVALUATION:     'Client Sample Evaluation',
  REVISION_REQUIRED:            'Revision Required',
  BULK_PRODUCTION:              'Bulk Production',
  QUALITY_CHECK:                'Quality Check',
  PACKING:                      'Packing',
  SHIPPED:                      'Shipped',
  DELIVERED:                    'Delivered',
  CANCELLED:                    'Cancelled',
  AWAITING_FIRST_PIECE:         'Awaiting First Piece',
  CLOSED_SAMPLE_ONLY:           'Sample Only — Closed',
  AWAITING_PRODUCTION_DEPOSIT:  'Awaiting Production Deposit',
  AWAITING_FINAL_PAYMENT:       'Awaiting Final Payment',
  READY_TO_SHIP:                'Ready to Ship',
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
  AWAITING_FIRST_PIECE:
    'Waiting for the factory to produce the first piece sample.',
  CLOSED_SAMPLE_ONLY:
    'Client opted not to proceed to bulk production after sample review.',
  AWAITING_PRODUCTION_DEPOSIT:
    'Sample approved. Awaiting 50% production deposit to begin bulk run.',
  AWAITING_FINAL_PAYMENT:
    'Bulk production complete. Awaiting final payment before shipment.',
  READY_TO_SHIP:
    'Final payment received. Order is packed and ready for dispatch.',
}

// ─── Terminal and reversible stages ──────────────────────────────────────────

export const TERMINAL_STAGES = new Set<ProductionStage>([
  'DELIVERED',
  'CANCELLED',
  'CLOSED_SAMPLE_ONLY',
])

export const CANCELLABLE_STAGES = new Set<ProductionStage>([
  'PRODUCTION_FILES_RECEIVED',
  'FIRST_PIECE_IN_PRODUCTION',
  'FIRST_PIECE_REVIEW',
  'REVISION_REQUIRED',
])

// ─── Transition graph ─────────────────────────────────────────────────────────

export const TRANSITION_GRAPH: Record<ProductionStage, ProductionStage[]> = {
  PRODUCTION_FILES_RECEIVED:    ['FIRST_PIECE_IN_PRODUCTION', 'CANCELLED'],
  FIRST_PIECE_IN_PRODUCTION:    ['FIRST_PIECE_REVIEW', 'CANCELLED'],
  FIRST_PIECE_REVIEW:           ['SAMPLE_SHIPPED', 'FIRST_PIECE_IN_PRODUCTION', 'CANCELLED',
                                  'CLOSED_SAMPLE_ONLY', 'AWAITING_PRODUCTION_DEPOSIT'],
  SAMPLE_SHIPPED:               ['SAMPLE_DELIVERED'],
  SAMPLE_DELIVERED:             ['CLIENT_SAMPLE_EVALUATION'],
  CLIENT_SAMPLE_EVALUATION:     ['BULK_PRODUCTION', 'REVISION_REQUIRED', 'CANCELLED'],
  REVISION_REQUIRED:            ['FIRST_PIECE_IN_PRODUCTION', 'CANCELLED'],
  BULK_PRODUCTION:              ['QUALITY_CHECK'],
  QUALITY_CHECK:                ['AWAITING_FINAL_PAYMENT', 'BULK_PRODUCTION'],
  PACKING:                      ['SHIPPED'],
  SHIPPED:                      ['DELIVERED'],
  DELIVERED:                    [],
  CANCELLED:                    [],
  AWAITING_FIRST_PIECE:         ['FIRST_PIECE_REVIEW'],
  CLOSED_SAMPLE_ONLY:           [],
  AWAITING_PRODUCTION_DEPOSIT:  ['BULK_PRODUCTION'],
  AWAITING_FINAL_PAYMENT:       ['READY_TO_SHIP'],
  READY_TO_SHIP:                ['SHIPPED'],
}

// ─── Metadata requirements per transition ─────────────────────────────────────

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
  CLOSED_SAMPLE_ONLY: [
    { key: 'close_reason', label: 'Close Reason', required: false },
  ],
}

// ─── Stage ordering (for progress display) ────────────────────────────────────

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

export function stageProgress(stage: ProductionStage): number {
  if (stage === 'CANCELLED' || stage === 'CLOSED_SAMPLE_ONLY') return 0
  const idx = HAPPY_PATH_SEQUENCE.indexOf(stage)
  if (idx === -1) {
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
  from_stage:  ProductionStage | null
  to_stage:    ProductionStage
  actor_id?:   string
  metadata:    Record<string, unknown>
  transitioned_at: string
}
