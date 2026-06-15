import type { ProductionStage } from './productionStages'
import type { ProductionOrder } from './production'

export const CLIENT_CONTROLLED_TRANSITIONS: Partial<
  Record<ProductionStage, ProductionStage[]>
> = {
  FIRST_PIECE_REVIEW:        ['AWAITING_SAMPLE_SHIPMENT', 'FIRST_PIECE_IN_PRODUCTION', 'CLOSED_SAMPLE_ONLY'],
  // Client confirms they physically received the sample, which opens evaluation.
  SAMPLE_SHIPPED:            ['CLIENT_SAMPLE_EVALUATION'],
  // Approving the sample routes the client to pay the production deposit
  // before bulk production begins.
  CLIENT_SAMPLE_EVALUATION:  ['AWAITING_PRODUCTION_DEPOSIT', 'REVISION_REQUIRED', 'CANCELLED'],
  // Client confirms the bulk order arrived, completing the workflow.
  SHIPPED:                   ['DELIVERED'],
}

// Stages where the client must complete a payment (handled via Stripe checkout,
// not a direct stage transition). Surfaced as "action needed" in the portal.
export const CLIENT_PAYMENT_STAGES = new Set<ProductionStage>([
  'AWAITING_PRODUCTION_DEPOSIT',
  'AWAITING_FINAL_PAYMENT',
])

export const CLIENT_WAITING_STAGES = new Set<ProductionStage>([
  'PRODUCTION_FILES_RECEIVED',
  'FIRST_PIECE_IN_PRODUCTION',
  'REVISION_REQUIRED',
  'BULK_PRODUCTION',
  'QUALITY_CHECK',
  'PACKING',
  'SAMPLE_DELIVERED',
  'AWAITING_FIRST_PIECE',
  'AWAITING_SAMPLE_SHIPMENT',
  'READY_TO_SHIP',
])

export type ClientAction = {
  id:              string
  label:           string
  description:     string
  toStage:         ProductionStage
  requiredFields:  ClientActionField[]
  variant:         'primary' | 'secondary' | 'danger'
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
      description: 'Mark your sample as delivered. Once confirmed, you can review it and decide how to proceed.',
      toStage:     'CLIENT_SAMPLE_EVALUATION',
      requiredFields: [],
      variant:        'primary',
      confirmMessage: 'Confirm you have physically received your sample. You\'ll then be able to approve, request changes, or cancel.',
    },
  ],
  SHIPPED: [
    {
      id:          'confirm_order_received',
      label:       'Confirm Order Delivered',
      description: 'Mark your bulk order as delivered. This completes your order.',
      toStage:     'DELIVERED',
      requiredFields: [],
      variant:        'primary',
      confirmMessage: 'Confirm you have received your full order. This will mark the order complete.',
    },
  ],
  FIRST_PIECE_REVIEW: [
    {
      id:          'approve_first_piece',
      label:       'Approve — Move to Production',
      description: 'The first piece looks great. Pay the production deposit to begin bulk manufacturing.',
      toStage:     'AWAITING_PRODUCTION_DEPOSIT',
      requiredFields: [
        { key: 'approval_notes', label: 'Approval Notes (optional)', type: 'textarea', placeholder: 'Any notes for the factory…' },
      ],
      variant:        'primary',
      confirmMessage: 'Approving will move this order to the production deposit step.',
    },
    {
      id:          'close_sample_only',
      label:       'Close Project',
      description: 'Stop after the sample — no bulk production will be ordered.',
      toStage:     'CLOSED_SAMPLE_ONLY',
      requiredFields: [
        { key: 'close_reason', label: 'Reason (optional)', type: 'textarea', placeholder: 'Why are you closing the project?' },
      ],
      variant:        'danger',
      confirmMessage: 'Closing the project is permanent. No further charges will be made.',
    },
  ],
  CLIENT_SAMPLE_EVALUATION: [
    {
      id:          'approve_sample',
      label:       'Approve — Pay Production Deposit',
      description: 'The sample meets your standards. Pay the production deposit to authorise the full production run.',
      toStage:     'AWAITING_PRODUCTION_DEPOSIT',
      requiredFields: [
        { key: 'evaluation_notes', label: 'Approval Notes (optional)', type: 'textarea', placeholder: 'Any notes for the factory…' },
      ],
      variant:        'primary',
      confirmMessage: 'Approving the sample will move you to the production deposit payment.',
    },
    {
      id:          'request_revision',
      label:       'Request Revisions',
      description: 'The sample needs changes before bulk production can begin.',
      toStage:     'REVISION_REQUIRED',
      requiredFields: [
        { key: 'revision_notes', label: 'Revision Notes', type: 'textarea', placeholder: 'Describe exactly what needs to be changed…' },
      ],
      variant: 'secondary',
    },
    {
      id:          'cancel_order',
      label:       'Cancel Order',
      description: 'Cancel this production order. This action cannot be undone.',
      toStage:     'CANCELLED',
      requiredFields: [
        { key: 'cancellation_reason', label: 'Cancellation Reason', type: 'textarea', placeholder: 'Why are you cancelling this order?' },
      ],
      variant:        'danger',
      confirmMessage: 'Cancelling this order is permanent and cannot be undone.',
    },
  ],
}

export function clientCanAct(stage: ProductionStage | null): boolean {
  if (!stage) return false
  return stage in CLIENT_CONTROLLED_TRANSITIONS
}

/** True if the client owes a payment at this stage. */
export function clientNeedsPayment(stage: ProductionStage | null): boolean {
  if (!stage) return false
  return CLIENT_PAYMENT_STAGES.has(stage)
}

/** True if the client has any pending action (decision or payment) at this stage. */
export function clientActionNeeded(stage: ProductionStage | null): boolean {
  return clientCanAct(stage) || clientNeedsPayment(stage)
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
