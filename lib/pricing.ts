/**
 * GRACE — central pricing source of truth (all values in cents)
 *
 * Every checkout route, the Stripe webhook, and the production service layer
 * import from here so prices never drift between code paths.
 *
 * Pricing model:
 *   • Production (bulk) price is the per-piece price for a full run.
 *   • Sample price is exactly 2× the per-piece production price (one sample).
 *   • A flat activation fee is charged once per order.
 *   • Each additional logo placement is a flat per-piece fee.
 */

// One-time activation fee charged per production order.
export const ACTIVATION_FEE_CENTS = 2_500 // $25.00

// Flat fee per additional logo placement (beyond the first, which is included).
export const EXTRA_LOGO_FEE_CENTS = 400 // $4.00

// Per-piece production (bulk) pricing by garment type.
export const PRODUCTION_PRICE_CENTS: Record<string, number> = {
  'T-Shirt':            2_500, // $25
  'Hoodie':             4_500, // $45
  'Zip Hoodie':         5_000, // $50
  'Crewneck':           3_500, // $35
  'Track Jacket':       3_500, // $35
  'Track Pants':        3_500, // $35
  'Windbreaker':        4_000, // $40
  'Basketball Jersey':  2_000, // $20
  'Basketball Shorts':  2_500, // $25
  'Sweatpants':         3_500, // $35
}

// Fallback used when a garment type isn't in the table above.
const DEFAULT_PRODUCTION_PRICE_CENTS = 3_500 // $35

// Bulk production quantity bounds. MOQ (minimum order quantity) is 15 pieces.
export const MIN_PRODUCTION_QUANTITY = 15
export const MAX_PRODUCTION_QUANTITY = 100_000

/** Per-piece production (bulk) price for a garment type. */
export function productionPriceCents(garmentType: string): number {
  return PRODUCTION_PRICE_CENTS[garmentType] ?? DEFAULT_PRODUCTION_PRICE_CENTS
}

/** Sample price for a garment type — double the per-piece production price. */
export function samplePriceCents(garmentType: string): number {
  return productionPriceCents(garmentType) * 2
}

/** Clamp/normalise a client-supplied quantity to a safe integer in range. */
export function clampQuantity(quantity: unknown): number {
  const n = Number(quantity)
  if (!Number.isFinite(n)) return MIN_PRODUCTION_QUANTITY
  return Math.min(MAX_PRODUCTION_QUANTITY, Math.max(MIN_PRODUCTION_QUANTITY, Math.floor(n)))
}

/**
 * Full bulk production subtotal (cents) for a run:
 *   (per-piece price + per-piece extra-logo fee) × quantity
 */
export function bulkSubtotalCents(
  unitPriceCents: number,
  extraLogoFeeCents: number,
  quantity: number,
): number {
  const qty = clampQuantity(quantity)
  return (unitPriceCents + extraLogoFeeCents) * qty
}

/** 50% deposit (cents), rounded to the nearest cent. */
export function depositCents(subtotalCents: number): number {
  return Math.round(subtotalCents / 2)
}

/** Remaining balance (cents) after the deposit — the two halves sum to subtotal. */
export function finalBalanceCents(subtotalCents: number): number {
  return subtotalCents - depositCents(subtotalCents)
}
