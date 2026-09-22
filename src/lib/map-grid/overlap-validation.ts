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
// entrance-validation.ts doesn't catch this either).
//
// Deliberately does NOT reuse buildTileIndex (tile-index.ts) — a real bug
// found this session via a real 256×256 RMG-generated map
// (maps/256x256_rmg_test.map): buildTileIndex falls back to registering an
// object at its own anchor node when its resolved footprint has no genuine
// `value === 1` cell at all (e.g. `grass_stones_2`/every fx_* effect/every
// ground-clutter prop with no `nodes[]` in its catalog template whatsoever —
// footprint.ts returns a `value: 0` cell for exactly this case) — a fallback
// that only exists so a purely-decorative, non-blocking prop is still
// click-to-selectable in the Map Grid UI, never meant to imply a real
// physical collision. Reusing that same index here misclassified 357 of 358
// "overlaps" on that real map as genuine — every one of them two non-solid
// decorations (or a non-solid decoration on top of the ONE real placement
// that mattered) sharing a tile, which is cosmetically redundant at worst,
// never a reachability/gameplay problem — while the fixer's own `alreadyMoved`
// same-pass collision-avoidance (overlap-autofix.ts) meant the single
// genuinely-blocking overlap on that map (a `random-item` placed directly on
// a solid 2×2 `dirt_rock_4`) could lose its turn to one of the 357 fake
// pairings sharing an id with it and never get fixed within
// MAX_OVERLAP_AUTOFIX_PASSES. Building a strictly-solid-only index here (an
// object with zero real `value === 1` cells never participates at all,
// matching its real non-blocking nature) both fixes correctness and cuts the
// fixer's real workload from ~358 pointless passes to the 1 that matters.

import type { MapContext, PlacedObject } from '@/types/map-context'
import type { GameCatalog } from '@/lib/catalog/types'
import { resolveFootprintCells } from './tile-index'

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
  // A strictly-solid-cells index, built locally rather than via
  // buildTileIndex — see this file's own header comment for why that
  // function's anchor-node fallback (for a UI-selectability need this
  // detector doesn't share) must NOT be reused here.
  const physical = (placedObjects as PlacedObject[]).filter((o) => o.type !== 1)
  const index = new Map<number, PlacedObject[]>()
  for (const obj of physical) {
    const solidCells = resolveFootprintCells(obj, catalog).filter((cell) => cell.value === 1)
    for (const cell of solidCells) {
      if (cell.x < 0 || cell.x >= sizeX || cell.z < 0 || cell.z >= sizeZ) continue
      const node = cell.z * sizeX + cell.x
      const list = index.get(node)
      if (list) list.push(obj)
      else index.set(node, [obj])
    }
  }

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
