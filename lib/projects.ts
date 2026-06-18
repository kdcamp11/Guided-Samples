import { createClient } from './supabase'
import type { AppState } from '@/app/page'

export type Project = {
  id: string
  user_id: string
  name: string
  phase_reached: number
  created_at: string
  updated_at: string
  thumbnail_url?: string | null
}

export type ProjectDetail = Project & {
  logo_url?: string | null
  garment_url?: string | null
  composite_url?: string | null
  preview_urls?: string[]
  garment_type?: string
  garment_color?: string
  // Full restorable snapshot of AppState with images stored as public URLs.
  design_state?: AppState | null
  tech_pack?: {
    style_info: Record<string, string>
    measurements: Record<string, number[]>
    pantones: { color: string; name: string }[]
    placements: { location: string; description: string }[]
  } | null
}

const BUCKET = 'grace-assets'

async function uploadImage(supabase: ReturnType<typeof createClient>, userId: string, projectId: string, type: string, dataUrl: string): Promise<string | null> {
  try {
    const base64 = dataUrl.split(',')[1]
    if (!base64) return null
    const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0))
    const path = `${userId}/${projectId}/${type}.png`
    const { error } = await supabase.storage.from(BUCKET).upload(path, bytes, {
      contentType: 'image/png',
      upsert: true,
    })
    if (error) { console.error('Upload error', type, error); return null }
    const { data } = supabase.storage.from(BUCKET).getPublicUrl(path)
    return data.publicUrl
  } catch (e) {
    console.error('uploadImage failed', e)
    return null
  }
}

// Persist an image, returning its public URL. Images already stored (http URLs,
// e.g. from a restored project) are passed through untouched rather than being
// re-uploaded as if they were base64 — which would fail and drop the image.
async function persistImage(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  projectId: string,
  type: string,
  img: string | null | undefined,
): Promise<string | null> {
  if (!img) return null
  if (/^https?:\/\//.test(img)) return img
  // Built-in library garments are static public assets (e.g. /grace-garments/…).
  // They live in the app bundle, so store the path as-is rather than uploading.
  if (img.startsWith('/')) return img
  return uploadImage(supabase, userId, projectId, type, img)
}

export async function saveProject(
  userId: string,
  state: AppState,
  projectId?: string,
  projectName?: string,
): Promise<string | null> {
  const supabase = createClient()
  if (!supabase) return null

  // Upsert project row. Only set `name` when an explicit name is given or when
  // creating a new project — otherwise an autosave would clobber a custom name
  // that the user set via rename.
  const id = projectId ?? crypto.randomUUID()
  const row: Record<string, unknown> = {
    id,
    user_id: userId,
    phase_reached: state.currentPhase,
    updated_at: new Date().toISOString(),
  }
  if (projectName) row.name = projectName
  else if (!projectId) row.name = `Design ${new Date().toLocaleDateString()}`
  const { error: projErr } = await supabase.from('projects').upsert(row, { onConflict: 'id' })
  if (projErr) { console.error('Project upsert error', projErr); return null }

  // Upload images in parallel
  const uploads = await Promise.all([
    persistImage(supabase, userId, id, 'logo', state.logo?.dataUrl),
    persistImage(supabase, userId, id, 'garment', state.garment?.dataUrl),
    persistImage(supabase, userId, id, 'composite', state.design?.previewDataUrl),
    ...(state.preview?.images ?? []).map((img, i) => persistImage(supabase, userId, id, `preview_${i}`, img)),
    ...(state.preview?.techImages ?? []).map((img, i) => persistImage(supabase, userId, id, `tech_${i}`, img)),
  ])

  const realCount = (state.preview?.images ?? []).length
  const techCount = (state.preview?.techImages ?? []).length
  const [logoUrl, garmentUrl, compositeUrl, ...rest] = uploads
  const previews = rest.slice(0, realCount).filter((u): u is string => !!u)
  const techPreviews = rest.slice(realCount, realCount + techCount).filter((u): u is string => !!u)
  const thumbnail = compositeUrl ?? garmentUrl ?? logoUrl

  // Per-view garment images (front/back/side) — uploaded so a restored project
  // keeps every angle, not just the primary view.
  const viewKeys = ['front', 'back', 'side'] as const
  const viewUploads = await Promise.all(
    viewKeys.map(k => persistImage(supabase, userId, id, `view_${k}`, state.garment?.views?.[k])),
  )
  const viewUrls: { front?: string; back?: string; side?: string } = {}
  viewKeys.forEach((k, i) => { if (viewUploads[i]) viewUrls[k] = viewUploads[i]! })

  // Self-contained snapshot for restore-on-open. Image fields hold storage URLs.
  const designState: AppState = {
    currentPhase: state.currentPhase,
    logo: state.logo ? { svg: state.logo.svg, dataUrl: logoUrl ?? '', style: state.logo.style, color: state.logo.color } : null,
    garment: state.garment ? {
      svg: state.garment.svg, dataUrl: garmentUrl ?? '', views: viewUrls,
      type: state.garment.type, color: state.garment.color,
      mode: state.garment.mode, sport: state.garment.sport, uniformType: state.garment.uniformType,
    } : null,
    design: state.design ? { confirmed: state.design.confirmed, previewDataUrl: compositeUrl ?? '' } : null,
    preview: (previews.length || techPreviews.length) ? { images: previews, techImages: techPreviews.length ? techPreviews : undefined } : null,
    // Design Studio snapshot — layer positions/transforms per view, garment color,
    // text layers, and the logo/artwork galleries. Persisted verbatim so reopening
    // a project restores the canvas exactly as the user left it.
    studioState: state.studioState,
  }

  // Update project with urls
  await supabase.from('projects').update({
    thumbnail_url: thumbnail,
    garment_type: state.garment?.type ?? null,
    garment_color: state.garment?.color ?? null,
    logo_url: logoUrl,
    garment_url: garmentUrl,
    composite_url: compositeUrl,
    preview_urls: previews,
    design_state: designState,
  }).eq('id', id)

  return id
}

export async function saveTechPack(
  projectId: string,
  techPack: ProjectDetail['tech_pack'],
): Promise<void> {
  const supabase = createClient()
  if (!supabase) return
  await supabase.from('tech_packs').upsert({
    project_id: projectId,
    ...techPack,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'project_id' })
}

export async function renameProject(projectId: string, name: string): Promise<void> {
  const supabase = createClient()
  if (!supabase) return
  await supabase.from('projects')
    .update({ name, updated_at: new Date().toISOString() })
    .eq('id', projectId)
}

export async function listProjects(userId: string): Promise<Project[]> {
  const supabase = createClient()
  if (!supabase) return []
  const { data, error } = await supabase
    .from('projects')
    .select('id, user_id, name, phase_reached, created_at, updated_at, thumbnail_url')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
  if (error) { console.error(error); return [] }
  return data ?? []
}

export async function loadProject(projectId: string): Promise<ProjectDetail | null> {
  const supabase = createClient()
  if (!supabase) return null
  const { data, error } = await supabase
    .from('projects')
    .select('*, tech_packs(*)')
    .eq('id', projectId)
    .single()
  if (error || !data) return null
  const tp = data.tech_packs?.[0]
  return {
    ...data,
    tech_pack: tp ? {
      style_info: tp.style_info,
      measurements: tp.measurements,
      pantones: tp.pantones,
      placements: tp.placements,
    } : null,
  }
}

export async function deleteProject(projectId: string): Promise<void> {
  const supabase = createClient()
  if (!supabase) return
  await supabase.from('projects').delete().eq('id', projectId)
}
