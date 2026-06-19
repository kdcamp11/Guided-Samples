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
  folder_id?: string | null
  is_archived?: boolean
}

export type Folder = {
  id: string
  user_id: string
  name: string
  created_at: string
  updated_at: string
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
  // Best thumbnail: latest studio canvas snapshot > confirmed composite >
  // garment > logo. The studio snapshot reflects the most recent edits, so it
  // wins over a (possibly stale) confirmed composite.
  const studioThumbUrl = await persistImage(
    supabase, userId, id, 'studio_thumb', state.studioState?.thumbnailDataUrl
  )
  const thumbnail = studioThumbUrl ?? compositeUrl ?? garmentUrl ?? logoUrl

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
    .select('id, user_id, name, phase_reached, created_at, updated_at, thumbnail_url, folder_id, is_archived')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
  if (error) { console.error(error); return [] }
  return data ?? []
}

// ── Folders ──────────────────────────────────────────────────────────────────

export async function listFolders(userId: string): Promise<Folder[]> {
  const supabase = createClient()
  if (!supabase) return []
  const { data, error } = await supabase
    .from('folders')
    .select('id, user_id, name, created_at, updated_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
  if (error) { console.error(error); return [] }
  return data ?? []
}

export async function createFolder(userId: string, name: string): Promise<Folder | null> {
  const supabase = createClient()
  if (!supabase) return null
  const { data, error } = await supabase
    .from('folders')
    .insert({ user_id: userId, name })
    .select('id, user_id, name, created_at, updated_at')
    .single()
  if (error) { console.error(error); return null }
  return data
}

export async function renameFolder(folderId: string, name: string): Promise<void> {
  const supabase = createClient()
  if (!supabase) return
  await supabase.from('folders')
    .update({ name, updated_at: new Date().toISOString() })
    .eq('id', folderId)
}

// Deleting a folder leaves its projects intact — the DB's ON DELETE SET NULL
// returns them to the top level rather than cascading the delete.
export async function deleteFolder(folderId: string): Promise<void> {
  const supabase = createClient()
  if (!supabase) return
  await supabase.from('folders').delete().eq('id', folderId)
}

// Move projects into a folder (folderId) or back to the top level (null).
export async function moveProjectsToFolder(projectIds: string[], folderId: string | null): Promise<void> {
  const supabase = createClient()
  if (!supabase || projectIds.length === 0) return
  await supabase.from('projects')
    .update({ folder_id: folderId, updated_at: new Date().toISOString() })
    .in('id', projectIds)
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

// Perceptual average-hash of an image's pixels. Two visually-identical logos
// hash to the same string even if their bytes differ (re-encoded, run through a
// different background remover, stored at a different URL, etc.) — which exact
// string/path comparison can't catch. Returns null if the image can't be read
// (e.g. CORS-tainted), in which case the caller falls back to the raw URL.
async function perceptualHash(url: string): Promise<string | null> {
  return new Promise(resolve => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    let settled = false
    const done = (v: string | null) => { if (!settled) { settled = true; resolve(v) } }
    img.onload = () => {
      try {
        const N = 16
        const c = document.createElement('canvas'); c.width = N; c.height = N
        const ctx = c.getContext('2d', { willReadFrequently: true })!
        // Flatten onto white so transparent backgrounds hash consistently.
        ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, N, N)
        ctx.drawImage(img, 0, 0, N, N)
        const d = ctx.getImageData(0, 0, N, N).data
        const gray: number[] = []
        let sum = 0
        for (let i = 0; i < d.length; i += 4) {
          const g = d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114
          gray.push(g); sum += g
        }
        const avg = sum / gray.length
        done(gray.map(g => (g > avg ? '1' : '0')).join(''))
      } catch { done(null) }
    }
    img.onerror = () => done(null)
    img.src = url
    setTimeout(() => done(null), 5000)
  })
}

// Collapse a list of image URLs to visually-unique entries (first occurrence
// wins). Falls back to the raw URL as the key when an image can't be hashed.
async function dedupeByPixels(urls: string[]): Promise<string[]> {
  const hashes = await Promise.all(urls.map(u => perceptualHash(u)))
  const seen = new Set<string>()
  const out: string[] = []
  urls.forEach((u, i) => {
    const key = hashes[i] ?? `url:${u}`
    if (seen.has(key)) return
    seen.add(key)
    out.push(u)
  })
  return out
}

// Aggregate all logos, artwork, garments, and previews across every project the
// user has ever saved, deduplicated by visual content. Garments from the GRACE
// built-in library (paths starting with "/") are excluded — the user only wants
// things they uploaded or AI-generated.
export async function listAllUserAssets(userId: string): Promise<{
  logos: string[]
  artworks: string[]
  garments: string[]
  previews: string[]
}> {
  const supabase = createClient()
  if (!supabase) return { logos: [], artworks: [], garments: [], previews: [] }

  const { data } = await supabase
    .from('projects')
    .select('design_state, logo_url, garment_url, preview_urls')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })

  const rawLogos: string[] = []
  const rawArtworks: string[] = []
  const rawGarments: string[] = []
  const rawPreviews: string[] = []

  for (const row of data ?? []) {
    const ds = row.design_state as AppState | null
    const gallery = ds?.studioState?.logoGallery ?? []

    for (const url of gallery) { if (url) rawLogos.push(url) }
    // Only fall back to the dedicated logo_url column when the project has no
    // gallery (older projects) — otherwise it's a duplicate of a gallery entry.
    if (!gallery.length && row.logo_url) rawLogos.push(row.logo_url)

    for (const url of ds?.studioState?.artworkGallery ?? []) { if (url) rawArtworks.push(url) }

    const garmentUrl = ds?.garment?.dataUrl ?? row.garment_url
    if (garmentUrl && !garmentUrl.startsWith('/')) rawGarments.push(garmentUrl)

    for (const url of (row.preview_urls as string[] | null) ?? []) { if (url) rawPreviews.push(url) }
  }

  const [logos, artworks, garments, previews] = await Promise.all([
    dedupeByPixels(rawLogos),
    dedupeByPixels(rawArtworks),
    dedupeByPixels(rawGarments),
    dedupeByPixels(rawPreviews),
  ])

  return { logos, artworks, garments, previews }
}

export async function archiveProject(projectId: string, archived: boolean): Promise<void> {
  const supabase = createClient()
  if (!supabase) return
  await supabase.from('projects').update({ is_archived: archived }).eq('id', projectId)
}

export async function deleteProject(projectId: string): Promise<{ error: string | null }> {
  const supabase = createClient()
  if (!supabase) return { error: 'Not connected.' }
  const { error } = await supabase.from('projects').delete().eq('id', projectId)
  if (error) {
    // Foreign-key restrict: a production order references this project.
    if (error.code === '23503') {
      return { error: 'This project has a production order and can’t be deleted.' }
    }
    return { error: error.message }
  }
  return { error: null }
}
