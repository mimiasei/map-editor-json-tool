// ─── Map Grid — overlapping-footprint auto-fix ───────────────────────────────
// Relocates one side of each overlap found by overlap-validation.ts to the
// nearest in-bounds, non-colliding, reachable tile — same search shape as
// bounds-autofix.ts's own fix, via the shared relocate.ts helpers.

import type { MapContext, PlacedObject } from '@/types/map-context'
import type { GameCatalog } from '@/lib/catalog/types'
import { computeFootprintTiles, isFootprintInBounds } from './footprint'
import { buildBlockedTileSet } from './passability'
import { groupOf } from './tile-index'
import { findOverlappingPlacements, type OverlappingPlacement } from './overlap-validation'
import { findNearestValidPosition, floodFillReachable } from './relocate'

export interface OverlapAutoFixRelocation {
  entityType: 0 | 1 | 2
  id: number
  sid: string
  fromNode: number
  toNode: number
}

export interface OverlapAutoFixResult {
  relocations: OverlapAutoFixRelocation[]
  /** No valid destination found anywhere — real, not silently dropped. */
  unresolved: OverlappingPlacement[]
}

const PLAYER_START_SIDS = new Set(['city-spawner', 'hero-spawner'])

type OverlapAutoFixContext = Pick<MapContext, 'sizeX' | 'sizeZ' | 'placedObjects' | 'levelsMap' | 'climbsMap' | 'waterMap'>

/** Decides which of an overlapping pair relocates. Decorations stay put —
 *  RMG scatters them for visual density, so deleting/moving one to fix an
 *  unrelated overlap is a worse outcome than nudging the smaller placement
 *  that landed on it (the concrete case this fixer exists for: a random-item
 *  spawned on top of an already-placed obstacle). A real player start never
 *  moves either — load-bearing for zone layout, same rule entrance-autofix.ts
 *  already applies. Otherwise (both real, non-start placements — expected to
 *  be rare, since tryPlaceAt already prevents most such overlaps during
 *  generation) the higher id moves: a stable, arbitrary tiebreak. */
function pickMover(a: PlacedObject, b: PlacedObject, catalog: GameCatalog | null): PlacedObject {
  const groupA = groupOf(a, catalog)
  const groupB = groupOf(b, catalog)
  if (groupA === 'decorations' && groupB !== 'decorations') return b
  if (groupB === 'decorations' && groupA !== 'decorations') return a
  const aIsStart = a.type === 0 && PLAYER_START_SIDS.has(a.sid)
  const bIsStart = b.type === 0 && PLAYER_START_SIDS.has(b.sid)
  if (aIsStart && !bIsStart) return b
  if (bIsStart && !aIsStart) return a
  return a.id >= b.id ? a : b
}

export function computeOverlapAutoFix(context: OverlapAutoFixContext, catalog: GameCatalog | null): OverlapAutoFixResult {
  const { sizeX, sizeZ, placedObjects } = context
  const overlaps = findOverlappingPlacements(context, catalog)
  if (overlaps.length === 0) return { relocations: [], unresolved: [] }

  const catalogById = new Map((catalog?.mapObjects ?? []).map((o) => [o.id, o]))
  const placedByKey = new Map((placedObjects as PlacedObject[]).map((o) => [o.key, o]))
  const blocked = buildBlockedTileSet(context, catalog)
  // Cells claimed by a relocation decided earlier in this same pass — merged
  // into each mover's own freshly-recomputed blocked set below, so two
  // movers never pick the same destination.
  const claimedDestinations = new Set<number>()

  // Seed from each player start's own walkable access cell (value===2 — "step
  // here to use it"), never its solid anchor tile — the anchor is itself in
  // `blocked`, so seeding from it would make floodFillReachable drop the seed
  // immediately and return an empty reachable set. Same rule bounds-autofix.ts
  // already applies for the identical reason.
  const seeds: number[] = []
  for (const obj of placedObjects as PlacedObject[]) {
    if (obj.type !== 0 || !PLAYER_START_SIDS.has(obj.sid)) continue
    const startTemplate = catalogById.get(obj.sid)
    const accessCells = computeFootprintTiles(startTemplate, obj.x, obj.z).filter((c) => c.value === 2)
    if (accessCells.length > 0) {
      for (const c of accessCells) seeds.push(c.z * sizeX + c.x)
    } else {
      seeds.push(obj.node)
    }
  }
  const reachable = seeds.length > 0 ? floodFillReachable(seeds, blocked, sizeX, sizeZ) : null

  const relocations: OverlapAutoFixRelocation[] = []
  const unresolved: OverlappingPlacement[] = []
  const alreadyMoved = new Set<string>()

  for (const overlap of overlaps) {
    if (alreadyMoved.has(overlap.key) || alreadyMoved.has(overlap.overlapsWith.key)) continue
    const a = placedByKey.get(overlap.key)
    const b = placedByKey.get(overlap.overlapsWith.key)
    if (!a || !b) continue
    const mover = pickMover(a, b, catalog)
    const template = mover.type === 0 ? catalogById.get(mover.sid) : undefined

    // Recomputed excluding only the mover — not a delete of its cells from
    // the shared `blocked` set, which would also incorrectly un-block a cell
    // the OTHER (staying) side of this same overlap still legitimately
    // occupies, since both share at least one cell by definition. Mirrors
    // reachability-validation.ts's findFreeTileForBlocker for the identical
    // reason.
    const moverBlocked = buildBlockedTileSet(
      { ...context, placedObjects: (placedObjects as PlacedObject[]).filter((o) => o.key !== mover.key) },
      catalog,
    )
    for (const node of claimedDestinations) moverBlocked.add(node)

    const isValidCandidate = (x: number, z: number): boolean => {
      if (mover.type !== 0) {
        if (x < 0 || x >= sizeX || z < 0 || z >= sizeZ) return false
        const node = z * sizeX + x
        if (moverBlocked.has(node)) return false
        return !reachable || reachable.has(node)
      }
      const cells = computeFootprintTiles(template, x, z)
      if (!isFootprintInBounds(cells, sizeX, sizeZ)) return false
      let anyReachable = !reachable
      for (const cell of cells) {
        const n = cell.z * sizeX + cell.x
        if (cell.value === 1 && moverBlocked.has(n)) return false
        if (reachable?.has(n)) anyReachable = true
      }
      return anyReachable
    }

    const found = findNearestValidPosition(mover.x, mover.z, sizeX, sizeZ, isValidCandidate)
    if (!found) {
      unresolved.push(overlap)
      continue
    }

    const toNode = found.z * sizeX + found.x
    relocations.push({ entityType: mover.type, id: mover.id, sid: mover.sid, fromNode: mover.node, toNode })
    alreadyMoved.add(mover.key)

    const newCells = mover.type === 0
      ? computeFootprintTiles(template, found.x, found.z).filter((c) => c.value === 1)
      : [{ x: found.x, z: found.z, value: 1 }]
    for (const cell of newCells) claimedDestinations.add(cell.z * sizeX + cell.x)
  }

  return { relocations, unresolved }
}
