/**
 * Supplier Portal — type definitions
 *
 * Supplier-specific types that sit on top of the Production Hub data model.
 * Suppliers are authenticated Supabase users whose email matches
 * supplier_email on a production_orders row.
 */

import type { ProductionStage } from './productionStages'
import type { ProductionOrder } from './production'

// ─── Permission model ─────────────────────────────────────────────────────────

/**
 * Maps each stage to the set of target stages a supplier is authorised to
 * advance to.  Any transition not listed here is a client or system action
 * and must be rejected by the server.
 *
 * Stages not present as keys mean the supplier has no action at that point
 * (they are waiting on the client or the system).
 */
export const SUPPLIER_CONTROLLED_TRANSITIONS: Partial<
  Record<ProductionStage, ProductionStage[]>
> = {
  // Supplier acknowledges receipt and starts physical production
  PRODUCTION_FILES_RECEIVED:  ['FIRST_PIECE_IN_PRODUCTION'],

  // Dual-path SAMPLE flow: the order is created here after the sample payment.
  // The factory makes the first piece and submits it for review.
  AWAITING_FIRST_PIECE:       ['FIRST_PIECE_REVIEW'],

  // Supplier completes the first sample and submits for review
  FIRST_PIECE_IN_PRODUCTION:  ['FIRST_PIECE_REVIEW'],

  // Client has requested revisions; supplier restarts with updated specs
  REVISION_REQUIRED:          ['FIRST_PIECE_IN_PRODUCTION'],

  // Sample approved; supplier starts bulk run
  // (client must approve at CLIENT_SAMPLE_EVALUATION first — that transition
  //  is not listed here because it is NOT supplier-controlled)
  BULK_PRODUCTION:            ['QUALITY_CHECK'],

  // QC done: either advance to packing or send back for rework
  QUALITY_CHECK:              ['PACKING', 'BULK_PRODUCTION'],

  // Packing complete; supplier ships and enters tracking info
  PACKING:                    ['SHIPPED'],
}

/**
 * Stages where the supplier has no pending action.
 * Used to render a "waiting" state in the portal.
 */
export const SUPPLIER_WAITING_STAGES = new Set<ProductionStage>([
  'FIRST_PIECE_REVIEW',      // client reviewing photos before sample ships
  'SAMPLE_SHIPPED',          // GRACE confirms delivery
  'SAMPLE_DELIVERED',        // GRACE opens for client evaluation
  'CLIENT_SAMPLE_EVALUATION',// client is deciding
  'SHIPPED',                 // GRACE confirms delivery
  'DELIVERED',               // terminal — complete
  'CANCELLED',               // terminal — voided
])

// ─── Action definitions ───────────────────────────────────────────────────────

/**
 * Describes a single action a supplier can take at a given stage.
 * The UI renders one card/button per SupplierAction.
 */
export type SupplierAction = {
  id:             string
  label:          string
  description:    string
  toStage:        ProductionStage
  /** Fields the supplier must fill before the action is allowed */
  requiredFields: SupplierActionField[]
  /** Whether one or more media files must be attached */
  requiresMedia:  boolean
  mediaType?:     SupplierMediaType
  /** Visual emphasis for destructive or significant actions */
  variant:        'primary' | 'secondary' | 'warning'
}

export type SupplierActionField = {
  key:         string
  label:       string
  type:        'text' | 'textarea' | 'date'
  placeholder: string
}

export type SupplierMediaType =
  | 'first_piece_review'
  | 'revised_sample'
  | 'qc_report'
  | 'packing_photo'
  | 'other'

// ─── Action registry ──────────────────────────────────────────────────────────

export const SUPPLIER_ACTIONS: Partial<Record<ProductionStage, SupplierAction[]>> = {
  PRODUCTION_FILES_RECEIVED: [
    {
      id:          'start_first_piece',
      label:       'Mark First Piece In Production',
      description: 'Confirm you have received all production files and the first sample is now being manufactured.',
      toStage:     'FIRST_PIECE_IN_PRODUCTION',
      requiredFields: [],
      requiresMedia:  false,
      variant:        'primary',
    },
  ],

  // Dual-path SAMPLE flow: factory makes the first piece, then submits photos
  // for the client to review before the sample ships.
  AWAITING_FIRST_PIECE: [
    {
      id:          'submit_first_piece_review',
      label:       'Submit First Piece for Review',
      description: 'Upload photos of the completed first piece. It will be reviewed before shipping.',
      toStage:     'FIRST_PIECE_REVIEW',
      requiredFields: [],
      requiresMedia:  true,
      mediaType:      'first_piece_review',
      variant:        'primary',
    },
  ],

  FIRST_PIECE_IN_PRODUCTION: [
    {
      id:          'submit_first_piece_review',
      label:       'Submit First Piece for Review',
      description: 'Upload photos of the completed first piece. It will be reviewed before shipping.',
      toStage:     'FIRST_PIECE_REVIEW',
      requiredFields: [],
      requiresMedia:  true,
      mediaType:      'first_piece_review',
      variant:        'primary',
    },
  ],

  FIRST_PIECE_REVIEW: [
    {
      id:          'ship_sample',
      label:       'Ship Sample to Client',
      description: 'Enter tracking information and confirm the sample has been dispatched.',
      toStage:     'SAMPLE_SHIPPED',
      requiredFields: [
        { key: 'tracking_number', label: 'Tracking Number', type: 'text',     placeholder: '1Z999AA10123456784' },
        { key: 'carrier',         label: 'Carrier',         type: 'text',     placeholder: 'UPS, FedEx, DHL…' },
      ],
      requiresMedia: false,
      variant:       'primary',
    },
    {
      id:          'rework_first_piece',
      label:       'Send Back for Internal Rework',
      description: 'The first piece requires corrections. Return it to production without shipping.',
      toStage:     'FIRST_PIECE_IN_PRODUCTION',
      requiredFields: [
        { key: 'rework_notes', label: 'Rework Notes', type: 'textarea', placeholder: 'Describe what needs to be corrected…' },
      ],
      requiresMedia: false,
      variant:       'warning',
    },
  ],

  REVISION_REQUIRED: [
    {
      id:          'start_revised_production',
      label:       'Start Revised Production',
      description: 'Client revision notes have been reviewed. Begin manufacturing the updated first piece.',
      toStage:     'FIRST_PIECE_IN_PRODUCTION',
      requiredFields: [],
      requiresMedia:  false,
      variant:        'primary',
    },
  ],

  BULK_PRODUCTION: [
    {
      id:          'submit_for_qc',
      label:       'Submit for Quality Check',
      description: 'Bulk run is complete. Move goods to the QC station for inspection.',
      toStage:     'QUALITY_CHECK',
      requiredFields: [
        { key: 'qc_inspector', label: 'QC Inspector Name', type: 'text', placeholder: 'Inspector name or ID' },
      ],
      requiresMedia: false,
      variant:       'primary',
    },
  ],

  QUALITY_CHECK: [
    {
      id:          'pass_qc',
      label:       'Complete Quality Check — Pass',
      description: 'All units have passed inspection. Proceed to packing.',
      toStage:     'PACKING',
      requiredFields: [
        { key: 'qc_notes', label: 'QC Notes', type: 'textarea', placeholder: 'Summary of inspection results…' },
      ],
      requiresMedia:  true,
      mediaType:      'qc_report',
      variant:        'primary',
    },
    {
      id:          'fail_qc',
      label:       'QC Failed — Return to Production',
      description: 'Units did not pass inspection. Return to bulk production for correction.',
      toStage:     'BULK_PRODUCTION',
      requiredFields: [
        { key: 'qc_notes', label: 'Failure Notes', type: 'textarea', placeholder: 'Describe the defects found…' },
      ],
      requiresMedia: false,
      variant:       'warning',
    },
  ],

  PACKING: [
    {
      id:          'ship_bulk',
      label:       'Mark Packed & Upload Tracking',
      description: 'All units are packed and ready. Enter final shipping details to dispatch.',
      toStage:     'SHIPPED',
      requiredFields: [
        { key: 'tracking_number', label: 'Tracking Number', type: 'text', placeholder: '1Z999AA10123456784' },
        { key: 'carrier',         label: 'Carrier',         type: 'text', placeholder: 'UPS, FedEx, DHL…' },
      ],
      requiresMedia:  true,
      mediaType:      'packing_photo',
      variant:        'primary',
    },
  ],
}

// ─── Supplier-facing order summary ────────────────────────────────────────────

/**
 * A lightweight view of a production order for the supplier dashboard.
 * Strips out financial data and brand-owner-only fields.
 */
export type SupplierOrderSummary = {
  id:               string
  style_name:       string
  garment_type:     string
  production_stage: ProductionStage | null
  supplier_notes:   string | null
  revision_notes:   string | null
  tracking_number:  string | null
  carrier:          string | null
  created_at:       string
  updated_at:       string
  production_started_at: string | null
  sample_shipped_at:     string | null
  shipped_at:            string | null
}

export type OrderMedia = {
  id:            string
  stage:         ProductionStage
  media_type:    SupplierMediaType
  public_url:    string
  file_name:     string
  mime_type?:    string
  notes:         string | null
  created_at:    string
}

// ─── Transition request / response ────────────────────────────────────────────

export type SupplierTransitionRequest = {
  order_id:  string
  to_stage:  ProductionStage
  metadata:  Record<string, unknown>
  media_ids: string[]            // IDs of already-uploaded production_order_media rows
}

export type SupplierTransitionResponse =
  | { ok: true;  order: ProductionOrder }
  | { ok: false; errors: string[] }

// ─── Permission helpers ───────────────────────────────────────────────────────

export function supplierCanAct(stage: ProductionStage | null): boolean {
  if (!stage) return false
  return stage in SUPPLIER_CONTROLLED_TRANSITIONS
}

export function supplierIsWaiting(stage: ProductionStage | null): boolean {
  if (!stage) return false
  return SUPPLIER_WAITING_STAGES.has(stage)
}

export function getSupplierActions(stage: ProductionStage | null): SupplierAction[] {
  if (!stage) return []
  return SUPPLIER_ACTIONS[stage] ?? []
}

export function isSupplierControlledTransition(
  from: ProductionStage,
  to: ProductionStage,
): boolean {
  const allowed = SUPPLIER_CONTROLLED_TRANSITIONS[from] ?? []
  return allowed.includes(to)
}
