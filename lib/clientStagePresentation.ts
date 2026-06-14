import type { ProductionStage } from '@/types/productionStages'

export type Responsible = 'factory' | 'you' | 'transit' | 'grace' | 'done' | 'cancelled'

export const STAGE_RESPONSIBLE: Record<ProductionStage, Responsible> = {
  PRODUCTION_FILES_RECEIVED:    'factory',
  FIRST_PIECE_IN_PRODUCTION:    'factory',
  FIRST_PIECE_REVIEW:           'you',
  SAMPLE_SHIPPED:               'transit',
  SAMPLE_DELIVERED:             'grace',
  CLIENT_SAMPLE_EVALUATION:     'you',
  REVISION_REQUIRED:            'factory',
  BULK_PRODUCTION:              'factory',
  QUALITY_CHECK:                'factory',
  PACKING:                      'factory',
  SHIPPED:                      'transit',
  DELIVERED:                    'done',
  CANCELLED:                    'cancelled',
  AWAITING_FIRST_PIECE:         'factory',
  CLOSED_SAMPLE_ONLY:           'done',
  AWAITING_PRODUCTION_DEPOSIT:  'you',
  AWAITING_FINAL_PAYMENT:       'you',
  READY_TO_SHIP:                'factory',
}

export const CLIENT_STAGE_LABELS: Record<ProductionStage, string> = {
  PRODUCTION_FILES_RECEIVED:    'Order Confirmed',
  FIRST_PIECE_IN_PRODUCTION:    'Sample Being Made',
  FIRST_PIECE_REVIEW:           'Review First Sample',
  SAMPLE_SHIPPED:               'Sample in Transit',
  SAMPLE_DELIVERED:             'Sample Arrived',
  CLIENT_SAMPLE_EVALUATION:     'Review Your Sample',
  REVISION_REQUIRED:            'Changes in Progress',
  BULK_PRODUCTION:              'Your Order Being Made',
  QUALITY_CHECK:                'Your Order Being Made',
  PACKING:                      'Packing Your Order',
  SHIPPED:                      'Order in Transit',
  DELIVERED:                    'Delivered',
  CANCELLED:                    'Order Cancelled',
  AWAITING_FIRST_PIECE:         'Sample Being Made',
  CLOSED_SAMPLE_ONLY:           'Project Closed',
  AWAITING_PRODUCTION_DEPOSIT:  'Production Deposit Required',
  AWAITING_FINAL_PAYMENT:       'Final Payment Required',
  READY_TO_SHIP:                'Ready to Ship',
}

export const CLIENT_STAGE_MESSAGES: Record<ProductionStage, string> = {
  PRODUCTION_FILES_RECEIVED:
    'Your factory has everything they need and is getting started.',
  FIRST_PIECE_IN_PRODUCTION:
    'Your factory is hand-crafting the first physical sample of your design.',
  FIRST_PIECE_REVIEW:
    'Your factory has completed the first sample. Review the photos and video below, then approve to ship or request changes.',
  SAMPLE_SHIPPED:
    'Your sample is on its way to you. You\'ll be able to hold it soon.',
  SAMPLE_DELIVERED:
    'Your sample has arrived and is being confirmed by GRACE. You\'ll be notified when it\'s ready for your review.',
  CLIENT_SAMPLE_EVALUATION:
    'Your sample is ready. Review it and let us know — approve to start full production, or request changes.',
  REVISION_REQUIRED:
    'Your feedback has been sent to the factory. They\'re making the changes you requested.',
  BULK_PRODUCTION:
    'Sample approved! Your factory is now making all the units in your order.',
  QUALITY_CHECK:
    'Production is complete. Every item is being inspected before it ships to you.',
  PACKING:
    'Everything passed inspection and is being carefully packed for shipment.',
  SHIPPED:
    'Your order is on its way! Check the tracking details below.',
  DELIVERED:
    'Your order has been delivered. Enjoy!',
  CANCELLED:
    'This order has been cancelled.',
  AWAITING_FIRST_PIECE:
    'Our supplier is crafting your first piece. We\'ll notify you when photos are ready for review.',
  CLOSED_SAMPLE_ONLY:
    'You\'ve chosen to close this project after the sample phase. No further charges will be made.',
  AWAITING_PRODUCTION_DEPOSIT:
    'You approved the sample. Pay the 50% production deposit to begin bulk manufacturing.',
  AWAITING_FINAL_PAYMENT:
    'Your order has passed quality check. Pay the remaining balance to authorize shipment.',
  READY_TO_SHIP:
    'Payment confirmed. Your supplier has been authorized to ship your order.',
}

export const RESPONSIBLE_LABELS: Record<Responsible, { label: string; color: string; dot: string }> = {
  factory:   { label: 'Factory is working on this',   color: 'text-brand-green',  dot: 'bg-brand-green animate-pulse' },
  you:       { label: 'Your decision needed',          color: 'text-amber-600',    dot: 'bg-amber-500 animate-pulse' },
  transit:   { label: 'In transit',                   color: 'text-blue-500',     dot: 'bg-blue-400' },
  grace:     { label: 'GRACE is confirming delivery',  color: 'text-brand-green',  dot: 'bg-brand-green' },
  done:      { label: 'Complete',                     color: 'text-green-600',    dot: 'bg-green-500' },
  cancelled: { label: 'Cancelled',                    color: 'text-red-500',      dot: 'bg-red-400' },
}

export type JourneyMilestone = {
  id:     string
  label:  string
  stages: ProductionStage[]
}

export const CLIENT_JOURNEY: JourneyMilestone[] = [
  {
    id:     'confirmed',
    label:  'Order Confirmed',
    stages: ['PRODUCTION_FILES_RECEIVED'],
  },
  {
    id:     'sample_making',
    label:  'Sample Being Made',
    stages: ['FIRST_PIECE_IN_PRODUCTION', 'AWAITING_FIRST_PIECE'],
  },
  {
    id:     'first_piece_review',
    label:  'Review First Sample',
    stages: ['FIRST_PIECE_REVIEW'],
  },
  {
    id:     'sample_review',
    label:  'Physical Sample Review',
    stages: ['SAMPLE_SHIPPED', 'SAMPLE_DELIVERED', 'CLIENT_SAMPLE_EVALUATION', 'REVISION_REQUIRED'],
  },
  {
    id:     'deposit',
    label:  'Production Deposit',
    stages: ['AWAITING_PRODUCTION_DEPOSIT'],
  },
  {
    id:     'production',
    label:  'Full Production',
    stages: ['BULK_PRODUCTION', 'QUALITY_CHECK', 'PACKING'],
  },
  {
    id:     'final_payment',
    label:  'Final Payment',
    stages: ['AWAITING_FINAL_PAYMENT'],
  },
  {
    id:     'shipped',
    label:  'Shipped',
    stages: ['SHIPPED', 'READY_TO_SHIP'],
  },
  {
    id:     'delivered',
    label:  'Delivered',
    stages: ['DELIVERED'],
  },
]

export function journeyMilestoneIndex(stage: ProductionStage | null): number {
  if (!stage || stage === 'CANCELLED' || stage === 'CLOSED_SAMPLE_ONLY') return -1
  for (let i = 0; i < CLIENT_JOURNEY.length; i++) {
    if (CLIENT_JOURNEY[i].stages.includes(stage)) return i
  }
  return 0
}

export function clientProgress(stage: ProductionStage | null): number {
  if (!stage || stage === 'CANCELLED' || stage === 'CLOSED_SAMPLE_ONLY') return 0
  if (stage === 'DELIVERED') return 1
  const idx = journeyMilestoneIndex(stage)
  if (idx === -1) return 0
  return (idx + 1) / CLIENT_JOURNEY.length
}
