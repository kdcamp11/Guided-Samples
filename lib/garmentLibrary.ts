// GRACE blank garment library — curated static assets in public/grace-garments.

export type GarmentView = 'front' | 'back' | 'side'

export interface LibraryGarment {
  id: string
  name: string
  views: Partial<Record<GarmentView, string>>
}

const asset = (file: string) => `/grace-garments/${file}`

export const GARMENT_LIBRARY: LibraryGarment[] = [
  {
    id: 'crew-neck',
    name: 'Crew Neck',
    views: {
      front: asset('Crew Neck Front.png'),
      back:  asset('Crew Neck Back.png'),
      side:  asset('Crew Neck Side.png'),
    },
  },
  {
    id: 'hoodie',
    name: 'Hoodie',
    views: {
      front: asset('Hoodie Front.png'),
      back:  asset('Zip Up Hoodie Back.png'),
      side:  asset('Zip Up Hoodie Side.png'),
    },
  },
  {
    id: 'long-sleeve-tee',
    name: 'Long Sleeve T-Shirt',
    views: {
      front: asset('Long Sleeve T Shirt Front.png'),
      back:  asset('Long Sleeve T Shirt Back.png'),
      side:  asset('Long Sleeve T Shirt Side.png'),
    },
  },
  {
    id: 't-shirt',
    name: 'T-Shirt',
    views: {
      front: asset('T Shirt Front.png'),
      back:  asset('T Shirt Back.png'),
      side:  asset('T Shirt Side.png'),
    },
  },
  {
    id: 'sweat-pants',
    name: 'Sweat Pants',
    views: {
      front: asset('Sweat Pants Front.png'),
      back:  asset('Sweat Pants Back.png'),
      side:  asset('Sweat Pants Sides.png'),
    },
  },
  {
    id: 'sweats-open-bottom',
    name: 'Sweats (Open Bottom)',
    views: {
      front: asset('Sweats Open Bottom Front.png'),
      back:  asset('Sweats Open Bottom Back.png'),
      side:  asset('Sweats Open Bottom Side.png'),
    },
  },
  {
    id: 'track-jacket',
    name: 'Track Jacket',
    views: {
      front: asset('Track Jacket Front.png'),
      back:  asset('Track Jacket Back.png'),
      side:  asset('Track Jacket Side.png'),
    },
  },
  {
    id: 'zip-up-hoodie',
    name: 'Zip-Up Hoodie',
    views: {
      front: asset('Zip Up Hoodie Front.png'),
      back:  asset('Zip Up Hoodie Back.png'),
      side:  asset('Zip Up Hoodie Side.png'),
    },
  },
]
