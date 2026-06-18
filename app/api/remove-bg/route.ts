import { NextRequest, NextResponse } from 'next/server'
import { removeBackground } from '@/lib/removeBackground'

export const runtime = 'nodejs'
export const maxDuration = 120

// Cleanup pipeline for uploaded logos/artwork — runs the same rembg model used
// for generated logos so every asset in the Design Studio is a transparent PNG.
export async function POST(req: NextRequest) {
  try {
    const { image } = await req.json()
    if (!image || typeof image !== 'string') {
      return NextResponse.json({ error: 'image required' }, { status: 400 })
    }
    const cleaned = await removeBackground(image)
    // Fall back to the original when removal is unavailable; client still has its
    // own flood-fill remover as a second layer of defense.
    return NextResponse.json({ image: cleaned ?? image, removed: !!cleaned })
  } catch (err) {
    console.error('remove-bg route error', err)
    return NextResponse.json({ error: 'failed' }, { status: 500 })
  }
}
