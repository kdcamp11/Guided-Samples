// GRACE Technical Drawing — supplier-facing projection.
//
// RULE: This module reads from getTechPackMeasurements(), never getConsumerSizeGuide().
// It therefore has access to the full technical spec (armhole, hood dims, neck/cuff
// openings, knee, seat, etc.) plus the consumer measurements and any user edits.
// Consumer screens must not import from here.

import { getTechPackMeasurements, fitLabel, formatInches, categoryOf, type GarmentCategory } from './sizeGuide'
import { SIZE_STEPS } from './transformRules'
import type {
  GarmentType, FitVariant, SizeKey,
  TopMeasurementSet, BottomMeasurementSet, GraphicPlacement, PlacementLocation,
} from './types'
import type { SizeGuideOverrides } from './sizeGuide'

export interface DrawingCallout {
  key: string
  label: string
  /** Whether the dimension is consumer-visible or supplier-only (technical). */
  tier: 'consumer' | 'technical'
  valueInches: number
  display: string
}

export interface DrawingPlacement {
  location: PlacementLocation
  label: string
  /** Horizontal offset from center axis (in), negative = left. */
  xOffsetInches: number
  /** Vertical offset from collar (tops) or waistband (bottoms), in inches. */
  yOffsetInches: number
  /** Max artwork width at the selected size (graded from M). */
  widthInches: number
  /** Max artwork height at the selected size. */
  heightInches: number
  notes: string
}

export interface TechnicalDrawingData {
  garmentType: GarmentType
  fit: FitVariant
  fitLabel: string
  size: SizeKey
  category: GarmentCategory
  /** Merged consumer + technical measurements for the chosen size (inches). */
  measurements: Record<string, number>
  callouts: DrawingCallout[]
  placements: DrawingPlacement[]
  /** Provenance — always the tech pack projection, never the consumer guide. */
  source: 'getTechPackMeasurements'
}

// ── Callout definitions (display order + tier) ─────────────────────────────────

const TOP_CALLOUTS: { key: string; label: string; tier: 'consumer' | 'technical' }[] = [
  { key: 'chest',         label: 'Chest (½, pit to pit)', tier: 'consumer' },
  { key: 'frontLength',   label: 'Front Length (HPS)',    tier: 'consumer' },
  { key: 'shoulderWidth', label: 'Shoulder Width',        tier: 'consumer' },
  { key: 'sleeveLength',  label: 'Sleeve Length',         tier: 'consumer' },
  { key: 'armhole',       label: 'Armhole (straight)',    tier: 'technical' },
  { key: 'bottomOpening', label: 'Bottom Opening (½)',    tier: 'technical' },
  { key: 'neckOpening',   label: 'Neck Opening',          tier: 'technical' },
  { key: 'sleeveOpening', label: 'Sleeve Opening (½)',    tier: 'technical' },
  { key: 'cuffLength',    label: 'Cuff Length',           tier: 'technical' },
  { key: 'backLength',    label: 'Back Length (HPS)',     tier: 'technical' },
  { key: 'hoodHeight',    label: 'Hood Height',           tier: 'technical' },
  { key: 'hoodOpening',   label: 'Hood Opening (½)',      tier: 'technical' },
  { key: 'hoodDepth',     label: 'Hood Depth',            tier: 'technical' },
]

const BOTTOM_CALLOUTS: { key: string; label: string; tier: 'consumer' | 'technical' }[] = [
  { key: 'waist',           label: 'Waist (½)',          tier: 'consumer' },
  { key: 'frontRise',       label: 'Front Rise',         tier: 'consumer' },
  { key: 'inseam',          label: 'Inseam',             tier: 'consumer' },
  { key: 'thigh',           label: 'Thigh (½)',          tier: 'consumer' },
  { key: 'legOpening',      label: 'Leg Opening (½)',    tier: 'consumer' },
  { key: 'backRise',        label: 'Back Rise',          tier: 'technical' },
  { key: 'kneeWidth',       label: 'Knee Width (½)',     tier: 'technical' },
  { key: 'cuffOpening',     label: 'Cuff Opening (½)',   tier: 'technical' },
  { key: 'waistbandHeight', label: 'Waistband Height',   tier: 'technical' },
  { key: 'seat',            label: 'Seat (½)',           tier: 'technical' },
]

const PLACEMENT_LABELS: Record<PlacementLocation, string> = {
  center_chest: 'Center Chest',
  left_chest:   'Left Chest',
  upper_back:   'Upper Back',
  lower_back:   'Lower Back',
  left_sleeve:  'Left Sleeve',
  right_sleeve: 'Right Sleeve',
  left_hip:     'Left Hip',
  right_hip:    'Right Hip',
  center_back:  'Center Back',
}

function scalePlacement(p: GraphicPlacement, steps: number): DrawingPlacement {
  return {
    location:      p.location,
    label:         PLACEMENT_LABELS[p.location] ?? p.location,
    xOffsetInches: p.xOffsetInches,
    yOffsetInches: p.yOffsetInches,
    widthInches:   Math.max(0, round8(p.maxWidthInches + p.widthGradePerSize * steps)),
    heightInches:  Math.max(0, round8(p.maxHeightInches + p.widthGradePerSize * steps)),
    notes:         p.notes,
  }
}

function round8(n: number): number {
  return Math.round(n * 8) / 8
}

/**
 * Assemble the full technical drawing dataset for a garment + fit + size.
 * Pulls measurements via getTechPackMeasurements (consumer + hidden technical,
 * with user overrides applied) and grades graphic placements to the chosen size.
 */
export function getTechnicalDrawingData(
  garmentType: GarmentType,
  fit: FitVariant | undefined,
  size: SizeKey,
  overrides?: SizeGuideOverrides,
): TechnicalDrawingData | null {
  const tp = getTechPackMeasurements(garmentType, fit, overrides)
  if (!tp) return null

  const set = (tp.sizeChart as Record<SizeKey, TopMeasurementSet | BottomMeasurementSet>)[size]
  const measurements: Record<string, number> = {
    ...(set.consumer as unknown as Record<string, number>),
    ...(set.technical as unknown as Record<string, number>),
  }

  const category = categoryOf(garmentType)
  const defs = category === 'top' ? TOP_CALLOUTS : BOTTOM_CALLOUTS
  const callouts: DrawingCallout[] = defs
    .filter(d => measurements[d.key] != null)
    .map(d => ({
      key: d.key,
      label: d.label,
      tier: d.tier,
      valueInches: measurements[d.key],
      display: formatInches(measurements[d.key]),
    }))

  const steps = SIZE_STEPS[size]
  const placements = tp.block.graphicPlacements.map(p => scalePlacement(p, steps))

  return {
    garmentType,
    fit: tp.fit,
    fitLabel: fitLabel(tp.fit),
    size,
    category,
    measurements,
    callouts,
    placements,
    source: 'getTechPackMeasurements',
  }
}

export { formatInches } from './sizeGuide'
