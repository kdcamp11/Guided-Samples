// AI fix-action registry. Each entry resolves a production issue and returns the
// human-readable outcome shown in the report. These are deliberately decoupled
// from the checks so real backends (mockup generation, tech-pack builder, vector
// tracing, CMYK/Pantone conversion, …) can replace the simulated resolvers
// without touching the UI or the check pipeline.

import { buildSizeSpec, sizeSpecToCsv, sizeSpecSummary } from './sizeSpec'
import { generateTechPack } from './techPack'
import { getDefaultSizeProfile } from '@/lib/sizing/store'
import { profileToCsv } from '@/lib/sizing/sources'

export interface FixOutcome {
  /** Message shown on the now-resolved check row. */
  message: string
  /** Optional artifact the AI produced (e.g. a generated file name). */
  artifact?: string
  /** Optional real file the caller should offer for download. */
  download?: { filename: string; content: string; mime: string }
}

type Resolver = { delay: number; resolve: () => FixOutcome }

const REGISTRY: Record<string, Resolver> = {
  vectorize: { delay: 2200, resolve: () => ({ message: 'Recreated artwork as clean, scalable vector paths.', artifact: 'artwork-vector.svg' }) },
  upscale: { delay: 1900, resolve: () => ({ message: 'Upscaled raster artwork to 300 DPI print resolution.', artifact: 'artwork@300dpi.png' }) },
  'outline-fonts': { delay: 1500, resolve: () => ({ message: 'Converted all live text to outlines.', artifact: 'artwork-outlined.pdf' }) },
  'convert-cmyk': { delay: 1400, resolve: () => ({ message: 'Converted color profile from RGB to CMYK for print.' }) },
  'convert-pantone': { delay: 1600, resolve: () => ({ message: 'Mapped artwork colors to nearest Pantone spot references.', artifact: 'pantone-spec.pdf' }) },
  'set-dimensions': { delay: 1500, resolve: () => ({ message: 'Generated print dimensions and scale for each placement.' }) },
  'add-bleed': { delay: 1300, resolve: () => ({ message: 'Added 0.125" bleed and safe-area margins.' }) },
  'generate-sizechart': { delay: 2000, resolve: () => ({ message: 'Generated a graded size chart (XS–3XL).', artifact: 'size-chart.pdf' }) },
  'generate-placement': { delay: 1800, resolve: () => ({ message: 'Generated placement specs (offset, width, alignment) per location.', artifact: 'placement-spec.pdf' }) },
  'generate-techpack': { delay: 2600, resolve: () => ({ message: 'Generated a full production tech pack from your files.', artifact: 'tech-pack.pdf' }) },
  'specify-decoration': { delay: 1400, resolve: () => ({ message: 'Recommended decoration method based on artwork and fabric.' }) },
  'specify-fabric': { delay: 1500, resolve: () => ({ message: 'Filled in fabric composition and weight recommendations.' }) },
  'generate-mockups': { delay: 2400, resolve: () => ({ message: 'Generated front and back garment mockups.', artifact: 'mockups.zip' }) },
  'create-print-files': { delay: 2200, resolve: () => ({ message: 'Exported print-ready, separated production files.', artifact: 'print-ready.zip' }) },
}

/** Run an AI fix. Replace the simulated body with a real API call per id. */
export async function runFix(id: string, garmentHint?: string): Promise<FixOutcome> {
  // Real implementation: generate a graded size chart from the fitBlocks engine.
  if (id === 'generate-sizechart') {
    await new Promise(res => setTimeout(res, 1400))
    const spec = buildSizeSpec(garmentHint)
    if (spec) {
      return {
        message: sizeSpecSummary(spec),
        artifact: 'size-chart.csv',
        download: { filename: 'grace-size-chart.csv', content: sizeSpecToCsv(spec), mime: 'text/csv' },
      }
    }
  }
  // Real implementation: attach the user's saved sizing source of truth.
  if (id === 'attach-sizechart') {
    await new Promise(res => setTimeout(res, 900))
    const profile = getDefaultSizeProfile()
    if (profile) {
      return {
        message: `Attached your saved size profile “${profile.name}” (${profile.rows.length} measurements, graded ${profile.sizes.join('/')}).`,
        artifact: 'size-chart.csv',
        download: { filename: 'grace-size-chart.csv', content: profileToCsv(profile), mime: 'text/csv' },
      }
    }
    // No saved profile after all — fall through to generating one.
    const spec = buildSizeSpec(garmentHint)
    if (spec) return {
      message: sizeSpecSummary(spec),
      artifact: 'size-chart.csv',
      download: { filename: 'grace-size-chart.csv', content: sizeSpecToCsv(spec), mime: 'text/csv' },
    }
  }
  // Real implementation: assemble a full production tech pack.
  if (id === 'generate-techpack') {
    await new Promise(res => setTimeout(res, 2200))
    const tp = generateTechPack(garmentHint)
    if (tp) {
      return {
        message: tp.summary,
        artifact: tp.filename,
        download: { filename: tp.filename, content: tp.content, mime: tp.mime },
      }
    }
  }

  const r = REGISTRY[id]
  if (!r) return { message: 'Resolved by GRACE AI.' }
  await new Promise(res => setTimeout(res, r.delay))
  return r.resolve()
}
