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
//
// A SECOND, narrower failure mode along the same lines (found 2026-09-11 via
// a real H3 import — Ville'de'Porte.h3m's city-spawner id 1901, owner 2):
// `entranceGroups()` computes each group's own `entranceNode` (the `2` cell
// itself) separately from `protectedNodes` (the *approach* ring around it) —
// this function used to only ever check `protectedNodes`, so another
// object's solid footprint landing directly ON the entrance cell itself
// (not the approach ring, but the literal "stand here to interact" tile)
// went undetected even though the approach ring was completely open. Real
// case: `tree_dead_3` placed exactly on city-spawner 1901's entrance cell —
// every `protectedNodes` check passed clean, so the object was never flagged
// and the auto-fix pass never touched that tree.

import type { MapContext, PlacedObject } from '@/types/map-context'
import type { GameCatalog } from '@/lib/catalog/types'
import {computeFootprintTiles, entranceGroups} from './footprint'
import { buildBlockedTileSet } from './passability'

export interface BlockedEntrancePlacement {
  sid: string
  id: number
  x: number
  z: number
  node: number
}

type EntranceValidationContext = Pick<MapContext, 'sizeX' | 'sizeZ' | 'placedObjects' | 'levelsMap' | 'climbsMap' | 'waterMap'>

/** Every type-0 placement whose real entrance is entirely blocked — by
 *  another object's solid footprint, water, or an unramped elevation wall
 *  (the same three-source rule `buildBlockedTileSet` already uses for the
 *  grid's own blocked-tile overlay). Evaluated per entrance cell
 *  (`footprint.ts`'s `entranceGroups`, one group per `value===2` cell) so an
 *  object with multiple entrance cells (e.g. `resource_dust`'s 8-cell ring
 *  around a solid center) is only flagged if EVERY group is blocked — one
 *  open side is enough to actually reach it. Objects with no `value===2`
 *  cell at all (plain decorations, mines, most environments) have no
 *  entrance concept and are never checked. */
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
    const groups = entranceGroups(allCells, sizeX, sizeZ)
    if (groups.length === 0) continue
    const allBlocked = groups.every((g) => blocked.has(g.entranceNode) || [...g.protectedNodes].some((n) => blocked.has(n)))
    if (allBlocked) {
      violations.push({ sid: placed.sid, id: placed.id, x: placed.x, z: placed.z, node: placed.node })
    }
  }

  return violations
}
