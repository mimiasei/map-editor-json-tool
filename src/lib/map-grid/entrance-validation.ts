// ─── Map Grid — blocked-entrance validation (Bug B root cause, 2026-09-10) ──
// Real root cause of the long-standing RMG load-freeze investigation: a
// decorative object (a pinetree) placed directly on a player city's own
// entrance tile. A placement's ANCHOR tile being free was never enough — the
// real "step here to interact" tile is its footprint's `value===2` cell(s)
// (footprint.ts's own documented convention, already relied on by
// accessibility-pass.ts's `accessNodesFor` and bounds-autofix.ts's player-
// start seeding) — an unrelated object's SOLID (`value===1`) footprint
// landing on exactly that tile leaves the object itself perfectly in-bounds
// and non-overlapping at ITS OWN anchor, so nothing previously caught this.
// Applies to every object with a real entrance, not just cities — any
// interactable/artifact/resource/spawner template that "mixes in" a
// value===2 cell (footprint.ts's own doc comment) has the exact same
// failure mode.

import type { MapContext, PlacedObject } from '@/types/map-context'
import type { GameCatalog } from '@/lib/catalog/types'
import {computeFootprintTiles, protectedNeighborNodes} from './footprint'
import { buildBlockedTileSet } from './passability'

export interface BlockedEntrancePlacement {
  sid: string
  id: number
  x: number
  z: number
  node: number
}

type EntranceValidationContext = Pick<MapContext, 'sizeX' | 'sizeZ' | 'placedObjects' | 'levelsMap' | 'climbsMap' | 'waterMap'>

/** Every type-0 placement whose real entrance (every footprint cell with
 *  `value===2`) is entirely blocked — by another object's solid footprint,
 *  water, or an unramped elevation wall (the same three-source rule
 *  `buildBlockedTileSet` already uses for the grid's own blocked-tile
 *  overlay). An object with more than one entrance cell is only flagged if
 *  any protected node (entrance + adjacent footprint cells' external neighbors)
 *  is blocked — one open side is enough to actually reach it.
 *  Objects with no `value===2` cell at all (plain decorations, mines,
 *  most environments) have no entrance concept and are never checked. */
export function findBlockedEntrancePlacements(
  context: EntranceValidationContext,
  catalog: GameCatalog | null,
): BlockedEntrancePlacement[] {
  const { sizeX, sizeZ } = context
  const catalogById = new Map((catalog?.mapObjects ?? []).map((o) => [o.id, o]))
  const blocked = buildBlockedTileSet(context, catalog)
  const violations: BlockedEntrancePlacement[] = []

  for (const placed of context.placedObjects as PlacedObject[]) {
    if (placed.type !== 0) continue
    const template = catalogById.get(placed.sid)
    const allCells = computeFootprintTiles(template, placed.x, placed.z)
    if (!allCells.some((c) => c.value === 2)) continue
    const protectedNodes = protectedNeighborNodes(allCells, sizeX, sizeZ)
    const isBlocked = [...protectedNodes].some((n) => blocked.has(n))
    if (isBlocked) {
      violations.push({ sid: placed.sid, id: placed.id, x: placed.x, z: placed.z, node: placed.node })
    }
  }

  return violations
}
