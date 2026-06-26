// Persist an uploaded production packet as a real project + tech pack, so it can
// flow through the SAME production-order pipeline as the do-it-yourself path
// (createProductionOrder requires an approved project with a tech pack). The
// project is tagged so the Orders view can distinguish uploaded orders.

import { saveProject, saveTechPack } from '@/lib/projects'
import type { AppState } from '@/app/page'
import type { TechPackData } from '@/components/Phase6Production'

/** Create a project (approved, phase 6) + tech pack from an uploaded packet. */
export async function mintUploadedOrder(userId: string, tp: TechPackData): Promise<string | null> {
  const garmentType = tp.styleInfo.garmentType || 'T-Shirt'
  const styleName = tp.styleInfo.styleName || garmentType

  // Minimal approved-state project so canCreateProductionOrder() passes
  // (phase_reached >= 6, tech pack present, not locked).
  const state: AppState = {
    currentPhase: 6,
    logo: null,
    garment: { svg: '', dataUrl: '', views: {}, type: garmentType, color: tp.styleInfo.colorway || '' },
    design: null,
    preview: null,
  }

  const projectId = await saveProject(userId, state, undefined, `Uploaded · ${styleName}`)
  if (!projectId) return null

  await saveTechPack(projectId, {
    style_info: { ...tp.styleInfo, source: 'upload' },
    measurements: tp.measurements,
    pantones: tp.pantones,
    placements: tp.placements,
  })

  return projectId
}
