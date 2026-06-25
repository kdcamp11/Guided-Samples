// Persistent store for SizeProfiles — the reusable sizing source of truth.
// localStorage-backed so it works for guests and persists across projects; the
// read/write surface is small so a Supabase-backed store can replace it later.

import type { SizeProfile } from './types'

const KEY = 'grace_size_profiles'
const EVENT = 'grace-sizing-changed'

function read(): SizeProfile[] {
  if (typeof window === 'undefined') return []
  try { return JSON.parse(localStorage.getItem(KEY) || '[]') } catch { return [] }
}
function write(list: SizeProfile[]) {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(KEY, JSON.stringify(list))
    window.dispatchEvent(new Event(EVENT))
  } catch {}
}

export function listSizeProfiles(): SizeProfile[] {
  return read().sort((a, b) => (b.updatedAt > a.updatedAt ? 1 : -1))
}

export function getSizeProfile(id: string): SizeProfile | null {
  return read().find(p => p.id === id) ?? null
}

export function getDefaultSizeProfile(): SizeProfile | null {
  const all = read()
  return all.find(p => p.isDefault) ?? all[0] ?? null
}

/** Insert or update. Returns the saved profile. */
export function saveSizeProfile(profile: SizeProfile): SizeProfile {
  const list = read()
  const updated = { ...profile, updatedAt: new Date().toISOString() }
  const i = list.findIndex(p => p.id === profile.id)
  if (i >= 0) list[i] = updated
  else list.unshift(updated)
  write(list)
  return updated
}

export function deleteSizeProfile(id: string) {
  write(read().filter(p => p.id !== id))
}

export function setDefaultSizeProfile(id: string) {
  write(read().map(p => ({ ...p, isDefault: p.id === id })))
}

/** Subscribe to store changes (returns an unsubscribe fn). */
export function onSizingChange(cb: () => void): () => void {
  if (typeof window === 'undefined') return () => {}
  window.addEventListener(EVENT, cb)
  window.addEventListener('storage', cb)
  return () => { window.removeEventListener(EVENT, cb); window.removeEventListener('storage', cb) }
}
