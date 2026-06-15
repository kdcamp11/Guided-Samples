// GRACE static technical flats — front view only.

import type { GarmentType } from '@/lib/fitBlocks/types'

export type FlatKind = 'tee' | 'crewneck' | 'hoodie' | 'zipuphoodie' | 'jacket' | 'pants' | 'shorts'

export const FLAT_FOR_GARMENT: Record<GarmentType, FlatKind> = {
  short_sleeve_tee: 'tee',
  long_sleeve_tee:  'tee',
  crewneck:         'crewneck',
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
  crewneck:    '/flats/crewneck.png',
  hoodie:      '/flats/hoodie.png',
  zipuphoodie: '/flats/zipuphoodie.png',
  jacket:      '/flats/jacket.png',
  pants:       '/flats/pants.png',
  shorts:      '/flats/shorts.png',
}

export function TechFlat({ kind }: { kind: FlatKind }) {
  return (
    <img
      src={FLAT_SRC[kind]}
      alt={`${kind} technical flat`}
      className="w-auto object-contain"
      style={{ maxHeight: 220 }}
    />
  )
}

