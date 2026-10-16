// ─── Catalog snapshot ────────────────────────────────────────────────────────
// A game update can add (or drop) heroes, creatures, artifacts, spells, skills
// and map objects. The ids of each kind in the last Core.zip seen are kept in
// localStorage; when a Core.zip with a different set is loaded, the difference is
// kept as "what changed", until the next change.
// A kind seen for the first time only sets its baseline: nothing is reported as
// new for it. (So does the first Core.zip ever seen, for every kind.)

import type { GameCatalog } from './types'

export const SNAPSHOT_KINDS = ['heroes', 'creatures', 'artifacts', 'spells', 'skills', 'mapObjects'] as const
export type SnapshotKind = typeof SNAPSHOT_KINDS[number]

type IdsByKind = Partial<Record<SnapshotKind, string[]>>

export interface CatalogChanges {
  /** ISO time the change was noticed. */
  detectedAt: string
  /** Ids that were not in the previous Core.zip, per kind. */
  added: IdsByKind
  /** Ids that were in the previous Core.zip and are gone, per kind. */
  removed: IdsByKind
}

interface StoredSnapshot {
  kinds: IdsByKind
  changes: CatalogChanges | null
}

const STORAGE_KEY = 'oe-map-object-snapshot'

/** Reads the stored snapshot, also the first format (map object ids only: `{ ids, changes }`). */
function readSnapshot(): StoredSnapshot | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as {
      ids?: string[]
      kinds?: IdsByKind
      changes?: { detectedAt: string; added: IdsByKind | string[]; removed: IdsByKind | string[] } | null
    }
    const asKinds = (value: IdsByKind | string[] | undefined): IdsByKind => (Array.isArray(value) ? { mapObjects: value } : value ?? {})
    const changes = parsed.changes
      ? { detectedAt: parsed.changes.detectedAt, added: asKinds(parsed.changes.added), removed: asKinds(parsed.changes.removed) }
      : null
    if (parsed.kinds) return { kinds: parsed.kinds, changes }
    if (Array.isArray(parsed.ids)) return { kinds: { mapObjects: parsed.ids }, changes }
    return null
  } catch {
    return null
  }
}

function writeSnapshot(snapshot: StoredSnapshot): void {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot)) } catch { /* ignore */ }
}

/** The ids of each kind in the catalog. */
function catalogIds(catalog: GameCatalog): IdsByKind {
  return {
    heroes: catalog.heroes.map((o) => o.id),
    creatures: catalog.creatures.map((o) => o.id),
    artifacts: catalog.artifacts.map((o) => o.id),
    spells: catalog.spells.map((o) => o.id),
    skills: catalog.skills.map((o) => o.id),
    mapObjects: catalog.mapObjects.map((o) => o.id),
  }
}

/** Ids in `ids` but not in `previous`. Pure. */
export function idsAdded(previous: readonly string[], ids: readonly string[]): string[] {
  const before = new Set(previous)
  return [...new Set(ids)].filter((id) => !before.has(id)).sort()
}

/** The difference between the stored ids and the current ones, per kind; null when they are equal. A kind with no stored ids is skipped. Pure. */
export function diffCatalogIds(previous: IdsByKind, current: IdsByKind, detectedAt: string): CatalogChanges | null {
  const added: IdsByKind = {}
  const removed: IdsByKind = {}
  let any = false
  for (const kind of SNAPSHOT_KINDS) {
    const before = previous[kind]
    const now = current[kind]
    if (!before || !now || now.length === 0) continue
    const plus = idsAdded(before, now)
    const minus = idsAdded(now, before)
    if (plus.length > 0) { added[kind] = plus; any = true }
    if (minus.length > 0) { removed[kind] = minus; any = true }
  }
  return any ? { detectedAt, added, removed } : null
}

/** How many ids were added across all kinds. */
export function countAdded(changes: CatalogChanges | null): number {
  return SNAPSHOT_KINDS.reduce((sum, kind) => sum + (changes?.added[kind]?.length ?? 0), 0)
}

/** How many ids were removed across all kinds. */
export function countRemoved(changes: CatalogChanges | null): number {
  return SNAPSHOT_KINDS.reduce((sum, kind) => sum + (changes?.removed[kind]?.length ?? 0), 0)
}

/**
 * Compares the catalog with the stored snapshot and stores the new one. Returns
 * what changed since the Core.zip before (kept until the sets change again), or
 * null when nothing has, or when this is the first Core.zip seen.
 */
export function trackCatalogChanges(catalog: GameCatalog): CatalogChanges | null {
  const current = catalogIds(catalog)
  if (current.mapObjects?.length === 0) return readSnapshot()?.changes ?? null
  const stored = readSnapshot()
  if (!stored) {
    writeSnapshot({ kinds: current, changes: null })
    return null
  }
  const changes = diffCatalogIds(stored.kinds, current, new Date().toISOString()) ?? stored.changes
  // A kind that came back empty (e.g. an incomplete load) keeps its stored ids.
  const kinds: IdsByKind = { ...stored.kinds }
  for (const kind of SNAPSHOT_KINDS) if ((current[kind]?.length ?? 0) > 0) kinds[kind] = current[kind]
  writeSnapshot({ kinds, changes })
  return changes
}
