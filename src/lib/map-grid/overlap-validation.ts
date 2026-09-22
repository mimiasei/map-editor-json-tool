// ─── Map Grid — overlapping-footprint validation ─────────────────────────────
// No existing check reports "placement A's solid footprint sits on top of
// placement B's" — during RMG generation this is normally *prevented* by
// tryPlaceAt's collision check (real objects placed first, decorations after,
// sharing one PlacementState). The one confirmed gap: `random-item`/
// `random-squad`/`random-res` are in NON_BLOCKING_SPAWNER_SIDS (passability.ts)
// — walked ONTO to interact, so their own footprint is deliberately never
// added to that shared blocked set. A decoration scattered afterward has no
// way to know that tile is spoken for, and can legally land right on top of
// it — silently making the item unreachable (its own entrance-cell tracking
// is skipped for the same NON_BLOCKING_SPAWNER_SIDS reason, so
// entrance-validation.ts doesn't catch this either). Reuses buildTileIndex
// (tile-index.ts) rather than a new footprint-collision scan — it already
// groups every placement by its own solid cells, so any node with 2+ entries
// IS an overlap.

import type { MapContext, PlacedObject } from '@/types/map-context'
import type { GameCatalog } from '@/lib/catalog/types'
import { buildTileIndex } from './tile-index'

export interface OverlappingPlacement {
  key: string
  sid: string
  id: number
  entityType: 0 | 1 | 2
  x: number
  z: number
  node: number
  overlapsWith: { key: string; sid: string; id: number; entityType: 0 | 1 | 2 }
}

type OverlapContext = Pick<MapContext, 'sizeX' | 'sizeZ' | 'placedObjects'>

export function findOverlappingPlacements(context: OverlapContext, catalog: GameCatalog | null): OverlappingPlacement[] {
  const { sizeX, sizeZ, placedObjects } = context
  if (sizeX <= 0 || sizeZ <= 0) return []

  // Zone markers (type 1) are trigger regions, not physical objects —
  // overlapping one is normal and expected, so they're excluded entirely.
  const physical = (placedObjects as PlacedObject[]).filter((o) => o.type !== 1)
  const index = buildTileIndex(physical, catalog, sizeX, sizeZ)

  const issues: OverlappingPlacement[] = []
  const seenPairs = new Set<string>()
  for (const [node, items] of index) {
    if (items.length < 2) continue
    for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) {
        const a = items[i]
        const b = items[j]
        const pairKey = a.key < b.key ? `${a.key}|${b.key}` : `${b.key}|${a.key}`
        if (seenPairs.has(pairKey)) continue
        seenPairs.add(pairKey)
        issues.push({
          key: a.key, sid: a.sid, id: a.id, entityType: a.type, x: a.x, z: a.z, node,
          overlapsWith: { key: b.key, sid: b.sid, id: b.id, entityType: b.type },
        })
      }
    }
  }
  return issues
}

export function describeOverlappingPlacement(issue: OverlappingPlacement): string {
  return `${issue.sid} (id ${issue.id}) overlaps ${issue.overlapsWith.sid} (id ${issue.overlapsWith.id}) at (${issue.x}, ${issue.z})`
}
