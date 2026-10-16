// ─── Map object snapshot ─────────────────────────────────────────────────────
// A game update can add (or drop) map objects. The ids of the map objects in the
// last Core.zip seen are kept in localStorage; when a Core.zip with a different
// set is loaded, the difference is kept as "what changed", until the next change.
// The first Core.zip ever seen only sets the baseline: nothing is reported as new.

import type { GameCatalog } from './types'

export interface ObjectChanges {
  /** ISO time the change was noticed. */
  detectedAt: string
  /** Map object ids that were not in the previous Core.zip. */
  added: string[]
  /** Map object ids that were in the previous Core.zip and are gone. */
  removed: string[]
}

interface StoredSnapshot {
  ids: string[]
  changes: ObjectChanges | null
}

const STORAGE_KEY = 'oe-map-object-snapshot'

function readSnapshot(): StoredSnapshot | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as StoredSnapshot
    return Array.isArray(parsed.ids) ? parsed : null
  } catch {
    return null
  }
}

function writeSnapshot(snapshot: StoredSnapshot): void {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot)) } catch { /* ignore */ }
}

/** The difference between the stored map object ids and `ids`; null when they are equal. Pure. */
export function diffObjectIds(previous: readonly string[], ids: readonly string[], detectedAt: string): ObjectChanges | null {
  const before = new Set(previous)
  const now = new Set(ids)
  const added = [...now].filter((id) => !before.has(id)).sort()
  const removed = [...before].filter((id) => !now.has(id)).sort()
  return added.length === 0 && removed.length === 0 ? null : { detectedAt, added, removed }
}

/**
 * Compares the catalog's map objects with the stored snapshot and stores the new
 * one. Returns what changed since the Core.zip before (kept until the set changes
 * again), or null when nothing has, or when this is the first Core.zip seen.
 */
export function trackObjectChanges(catalog: GameCatalog): ObjectChanges | null {
  const ids = catalog.mapObjects.map((o) => o.id)
  if (ids.length === 0) return readSnapshot()?.changes ?? null
  const stored = readSnapshot()
  if (!stored) {
    writeSnapshot({ ids, changes: null })
    return null
  }
  const changes = diffObjectIds(stored.ids, ids, new Date().toISOString())
  if (!changes) return stored.changes
  writeSnapshot({ ids, changes })
  return changes
}
