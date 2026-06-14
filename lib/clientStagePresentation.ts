/**
 * Client-facing stage presentation layer
 *
 * Translates internal ProductionStage values into language and structure
 * appropriate for a brand owner tracking their order — not a factory operator.
 *
 * The underlying workflow logic and ProductionStage enum are unchanged.
 * This file is the only place manufacturing terminology should be hidden.
 */

import type { ProductionStage } from '@/types/productionStages'

// ─── Who is responsible right now ─────────────────────────────────────────────

export type Responsible = 'factory' | 'you' | 'transit' | 'grace' | 'done' | 'cancelled'

export const STAGE_RESPONSIBLE: Record<ProductionStage, Responsible> = {
  PRODUCTION_FILES_RECEIVED:  'factory',
  FIRST_PIECE_IN_PRODUCTION:  'factory',
  FIRST_PIECE_REVIEW:         'you',
  SAMPLE_SHIPPED:             'transit',
  SAMPLE_DELIVERED:           'grace',   // GRACE confirms delivery, not client
  CLIENT_SAMPLE_EVALUATION:   'you',
  REVISION_REQUIRED:          'factory',
  BULK_PRODUCTION:            'factory',
  QUALITY_CHECK:              'factory',
  PACKING:                    'factory',
  SHIPPED:                    'transit',
  DELIVERED:                  'done',
  CANCELLED:                  'cancelled',
}

// ─── Customer-friendly labels ─────────────────────────────────────────────────

export const CLIENT_STAGE_LABELS: Record<ProductionStage, string> = {
  PRODUCTION_FILES_RECEIVED:  'Order Confirmed',
  FIRST_PIECE_IN_PRODUCTION:  'Sample Being Made',
  FIRST_PIECE_REVIEW:         'Review First Sample',
  SAMPLE_SHIPPED:             'Sample in Transit',
  SAMPLE_DELIVERED:           'Sample Arrived',
  CLIENT_SAMPLE_EVALUATION:   'Review Your Sample',
  REVISION_REQUIRED:          'Changes in Progress',
  BULK_PRODUCTION:            'Your Order Being Made',
  QUALITY_CHECK:              'Your Order Being Made',
  PACKING:                    'Packing Your Order',
  SHIPPED:                    'Order in Transit',
  DELIVERED:                  'Delivered',
  CANCELLED:                  'Order Cancelled',
}

// ─── Customer-friendly status messages ────────────────────────────────────────

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
    'Your order has been delivered. Enjoy! 🎉',
  CANCELLED:
    'This order has been cancelled.',
}

// ─── Responsible party label ──────────────────────────────────────────────────

export const RESPONSIBLE_LABELS: Record<Responsible, { label: string; color: string; dot: string }> = {
  factory:   { label: 'Factory is working on this',  color: 'text-brand-green',  dot: 'bg-brand-green animate-pulse' },
  you:       { label: 'Your decision needed',         color: 'text-amber-600',    dot: 'bg-amber-500 animate-pulse' },
  transit:   { label: 'In transit',                  color: 'text-blue-500',     dot: 'bg-blue-400' },
  grace:     { label: 'GRACE is confirming delivery', color: 'text-brand-green',  dot: 'bg-brand-green' },
  done:      { label: 'Complete',                    color: 'text-green-600',    dot: 'bg-green-500' },
  cancelled: { label: 'Cancelled',                   color: 'text-red-500',      dot: 'bg-red-400' },
}

// ─── Simplified journey milestones (client-visible checkpoints) ───────────────
//
// Collapses internal factory stages into the 7 milestones a customer cares about.
// Multiple ProductionStages can map to the same milestone index.

export type JourneyMilestone = {
  id:     string
  label:  string
  stages: ProductionStage[]  // which stages count as "at or past" this milestone
}

export const CLIENT_JOURNEY: JourneyMilestone[] = [
  {
    id:     'confirmed',
    label:  'Order Confirmed',
    stages: ['PRODUCTION_FILES_RECEIVED'],
  },
  {
    id:     'sample',
    label:  'Sample Being Made',
    stages: ['FIRST_PIECE_IN_PRODUCTION'],
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
    id:     'production',
    label:  'Full Production',
    stages: ['BULK_PRODUCTION', 'QUALITY_CHECK', 'PACKING'],
  },
  {
    id:     'shipped',
    label:  'Shipped',
    stages: ['SHIPPED'],
  },
  {
    id:     'delivered',
    label:  'Delivered',
    stages: ['DELIVERED'],
  },
]

/** Returns the index (0-based) of the milestone the current stage maps to. -1 if cancelled. */
export function journeyMilestoneIndex(stage: ProductionStage | null): number {
  if (!stage || stage === 'CANCELLED') return -1
  for (let i = 0; i < CLIENT_JOURNEY.length; i++) {
    if (CLIENT_JOURNEY[i].stages.includes(stage)) return i
  }
  return 0
}

/** Returns 0–1 progress based on the simplified journey (not all 13 stages). */
export function clientProgress(stage: ProductionStage | null): number {
  if (!stage || stage === 'CANCELLED') return 0
  if (stage === 'DELIVERED') return 1
  const idx = journeyMilestoneIndex(stage)
  if (idx === -1) return 0
  return (idx + 1) / CLIENT_JOURNEY.length
}
