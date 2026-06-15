// GRACE static technical flats.
//
// Front view uses the uploaded illustration PNGs (public/flats/).
// Back view uses the same image at reduced opacity — the callout annotations
// on the front already communicate where measurements are taken.
//
// Garments without a dedicated image map to the closest silhouette.

import type { GarmentType } from '@/lib/fitBlocks/types'

export type FlatKind = 'tee' | 'hoodie' | 'zipuphoodie' | 'jacket' | 'pants' | 'shorts'

export const FLAT_FOR_GARMENT: Record<GarmentType, FlatKind> = {
  short_sleeve_tee: 'tee',
  long_sleeve_tee:  'tee',
  crewneck:         'tee',
  hoodie:           'hoodie',
  zip_hoodie:       'zipuphoodie',
  track_jacket:     'jacket',
  windbreaker:      'jacket',
  sweatpants:       'pants',
  track_pants:      'pants',
  shorts:           'shorts',
}

const FLAT_SRC: Record<FlatKind, string> = {
  tee:         '/flats/tee.png',
  hoodie:      '/flats/hoodie.png',
  zipuphoodie: '/flats/zipuphoodie.png',
  jacket:      '/flats/jacket.png',
  pants:       '/flats/pants.png',
  shorts:      '/flats/shorts.png',
}

export function TechFlat({ kind, view }: { kind: FlatKind; view: 'front' | 'back' }) {
  return (
    <img
      src={FLAT_SRC[kind]}
      alt={`${kind} ${view} flat`}
      className="w-full h-auto object-contain"
      style={{ opacity: view === 'back' ? 0.45 : 1 }}
    />
  )
}
