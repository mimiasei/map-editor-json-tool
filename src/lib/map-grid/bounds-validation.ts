// ─── Map Grid — out-of-bounds footprint validation (Bug A follow-up) ────────
// A placement's own anchor tile is always validated at Add/Move time
// (screenToNode/isNodeInBoundsForMove reject an out-of-range x/z outright),
// but a multi-tile object's FULL footprint can still extend past the map's
// edge even though its anchor tile is valid — confirmed to crash the actual
// game on load (ArgumentOutOfRangeException, ".../dbi.vve", ~"squad config
// not found ... tier: -1") via a real city-spawner placed 1 tile from an
// edge, whose footprint's back row silently fell 1 tile off the map (see
// footprint.ts's own doc comment for the full evidence trail). This runs a
// full-document sweep right before a save commits, as a backstop for
// map-wide checks Add/Move can't catch on their own (an existing map from
// before this fix, an H3 import, or a future map-resize-down feature).

import type { MapContext, PlacedObject } from '@/types/map-context'
import type { GameCatalog } from '@/lib/catalog/types'
import { computeFootprintTiles, isFootprintInBounds } from './footprint'

export interface OutOfBoundsPlacement {
  sid: string
  id: number
  x: number
  z: number
  /** `z * sizeX + x` — precomputed so a caller (e.g. `bounds-autofix.ts`)
   *  never needs to re-derive it or thread `sizeX` around separately. */
  node: number
}

/** Every type-0 (objects[]) placement whose real footprint (per its catalog
 *  template) extends past the map's edges. Markers/squads (type 1/2) have no
 *  multi-tile template — skipped here, matching `isNodeInBoundsForMove`'s
 *  own type-0-only check in MapGridDialog.tsx. Returns nothing (not a false
 *  positive) for a sid the catalog can't resolve — `computeFootprintTiles`
 *  falls back to a single already-validated anchor cell in that case, same
 *  as every other footprint consumer in this app. */
export function findOutOfBoundsPlacements(
  context: Pick<MapContext, 'sizeX' | 'sizeZ' | 'placedObjects'>,
  catalog: GameCatalog | null,
): OutOfBoundsPlacement[] {
  const violations: OutOfBoundsPlacement[] = []
  for (const placed of context.placedObjects as PlacedObject[]) {
    if (placed.type !== 0) continue
    const template = catalog?.mapObjects.find((o) => o.id === placed.sid)
    const cells = computeFootprintTiles(template, placed.x, placed.z)
    if (!isFootprintInBounds(cells, context.sizeX, context.sizeZ)) {
      violations.push({ sid: placed.sid, id: placed.id, x: placed.x, z: placed.z, node: placed.z * context.sizeX + placed.x })
    }
  }
  return violations
}
