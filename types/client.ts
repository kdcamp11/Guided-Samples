/**
 * Client Portal — type definitions
 *
 * Defines which stage transitions clients control and the actions they can take.
 * Clients can only act on stages that suppliers have handed off to them.
 */

import type { ProductionStage } from './productionStages'
import type { ProductionOrder } from './production'

/**
 * Maps each stage to the target stages a client is authorised to transition to.
 * Supplier-controlled stages are not listed here.
 */
export const CLIENT_CONTROLLED_TRANSITIONS: Partial<
  Record<ProductionStage, ProductionStage[]>
> = {
  // Client confirms the sample was physically received
  SAMPLE_SHIPPED:           ['SAMPLE_DELIVERED'],

  // Client begins the evaluation process
  SAMPLE_DELIVERED:         ['CLIENT_SAMPLE_EVALUATION'],

  // Client approves (→ bulk) or requests changes (→ revision) or cancels
  CLIENT_SAMPLE_EVALUATION: ['BULK_PRODUCTION', 'REVISION_REQUIRED', 'CANCELLED'],
}

/**
 * Stages where the client has no pending action.
 * Used to render a "supplier working" state in the portal.
 */
export const CLIENT_WAITING_STAGES = new Set<ProductionStage>([
  'PRODUCTION_FILES_RECEIVED',
  'FIRST_PIECE_IN_PRODUCTION',
  'FIRST_PIECE_REVIEW',
  'REVISION_REQUIRED',
  'BULK_PRODUCTION',
  'QUALITY_CHECK',
  'PACKING',
])

export type ClientAction = {
  id:             string
  label:          string
  description:    string
  toStage:        ProductionStage
  requiredFields: ClientActionField[]
  variant:        'primary' | 'secondary' | 'danger'
  confirmMessage?: string
}

export type ClientActionField = {
  key:         string
  label:       string
  type:        'text' | 'textarea'
  placeholder: string
}

export const CLIENT_ACTIONS: Partial<Record<ProductionStage, ClientAction[]>> = {
  SAMPLE_SHIPPED: [
    {
      id:          'confirm_sample_received',
      label:       'Confirm Sample Received',
      description: 'Mark the sample as delivered to begin your evaluation.',
      toStage:     'SAMPLE_DELIVERED',
      requiredFields: [],
      variant:     'primary',
    },
  ],

  SAMPLE_DELIVERED: [
    {
      id:          'begin_evaluation',
      label:       'Begin Sample Evaluation',
      description: 'Start your formal review of the physical sample.',
      toStage:     'CLIENT_SAMPLE_EVALUATION',
      requiredFields: [],
      variant:     'primary',
    },
  ],

  CLIENT_SAMPLE_EVALUATION: [
    {
      id:          'approve_sample',
      label:       'Approve Sample — Start Bulk Production',
      description: 'The sample meets your standards. Authorise the factory to begin the full production run.',
      toStage:     'BULK_PRODUCTION',
      requiredFields: [
        { key: 'evaluation_notes', label: 'Approval Notes (optional)', type: 'textarea', placeholder: 'Any notes for the factory…' },
      ],
      variant:     'primary',
      confirmMessage: 'Approving the sample will authorise bulk production. This cannot be undone.',
    },
    {
      id:          'request_revision',
      label:       'Request Revisions',
      description: 'The sample needs changes before bulk production can begin.',
      toStage:     'REVISION_REQUIRED',
      requiredFields: [
        { key: 'revision_notes', label: 'Revision Notes', type: 'textarea', placeholder: 'Describe exactly what needs to be changed…' },
      ],
      variant:     'secondary',
    },
    {
      id:          'cancel_order',
      label:       'Cancel Order',
      description: 'Cancel this production order. This action cannot be undone.',
      toStage:     'CANCELLED',
      requiredFields: [
        { key: 'cancellation_reason', label: 'Cancellation Reason', type: 'textarea', placeholder: 'Why are you cancelling this order?' },
      ],
      variant:     'danger',
      confirmMessage: 'Cancelling this order is permanent and cannot be undone.',
    },
  ],
}

export function clientCanAct(stage: ProductionStage | null): boolean {
  if (!stage) return false
  return stage in CLIENT_CONTROLLED_TRANSITIONS
}

export function clientIsWaiting(stage: ProductionStage | null): boolean {
  if (!stage) return false
  return CLIENT_WAITING_STAGES.has(stage)
}

export function getClientActions(stage: ProductionStage | null): ClientAction[] {
  if (!stage) return []
  return CLIENT_ACTIONS[stage] ?? []
}

export function isClientControlledTransition(
  from: ProductionStage,
  to:   ProductionStage,
): boolean {
  const allowed = CLIENT_CONTROLLED_TRANSITIONS[from] ?? []
  return allowed.includes(to)
}

export type ClientTransitionRequest = {
  order_id: string
  to_stage: ProductionStage
  metadata: Record<string, unknown>
}

export type ClientTransitionResponse =
  | { ok: true;  order: ProductionOrder }
  | { ok: false; errors: string[] }
