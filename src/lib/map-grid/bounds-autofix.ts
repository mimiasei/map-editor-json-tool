// ─── Map Grid — out-of-bounds auto-fix (Bug A follow-up) ────────────────────
// Computes where each `bounds-validation.ts` violation should move to:
// somewhere in-bounds, not colliding with a real object/wall/water, and
// actually reachable by a player (not walled in) — a real user request, not
// just "clamp it and hope." Pure function, no React/store dependency, same
// convention as bounds-validation.ts itself; `useMapDocumentStore` is the
// one that turns its output into real `moveObject` edits.
//
// Reachability has no existing live-document primitive elsewhere in this
// codebase (`buildBlockedTileSet` is purely per-tile, no connectivity) — the
// multi-source flood fill here is a small, live-doc-native reimplementation
// of the same idea `accessibility-pass.ts` already uses for RMG/H3 output,
// scoped down deliberately: 4-neighbor only, no portal hops. A violator
// stuck specifically on a portal-only island won't be resolved by this pass
// (falls into `unresolved`) — a real, disclosed gap, not a silent one; the
// common case (an object nudged off a plain map edge) doesn't need it.

import type { MapContext, PlacedObject } from '@/types/map-context'
import type { GameCatalog } from '@/lib/catalog/types'
import { computeFootprintTiles, isFootprintInBounds, clampAnchorToFootprintBounds } from './footprint'
import { buildBlockedTileSet } from './passability'
import { findOutOfBoundsPlacements, type OutOfBoundsPlacement } from './bounds-validation'

export interface BoundsAutoFix {
  id: number
  sid: string
  fromNode: number
  toNode: number
}

export interface BoundsAutoFixResult {
  fixes: BoundsAutoFix[]
  /** Violations no in-bounds, non-colliding, reachable tile could be found
   *  for anywhere on the map — real, not silently dropped. */
  unresolved: OutOfBoundsPlacement[]
}

const NEIGHBOR_OFFSETS: [number, number][] = [[-1, 0], [1, 0], [0, -1], [0, 1]]

/** Multi-source 4-neighbor flood fill over every node NOT in `blocked`,
 *  seeded from `seeds`. Mirrors `accessibility-pass.ts`'s own `floodFill`
 *  shape (minus portal hops — see this file's own header comment). */
function floodFillReachable(seeds: number[], blocked: Set<number>, sizeX: number, sizeZ: number): Set<number> {
  const visited = new Set<number>()
  const queue: number[] = []
  for (const seed of seeds) {
    if (visited.has(seed) || blocked.has(seed)) continue
    visited.add(seed)
    queue.push(seed)
  }
  while (queue.length > 0) {
    const node = queue.pop() as number
    const x = node % sizeX
    const z = Math.floor(node / sizeX)
    for (const [dx, dz] of NEIGHBOR_OFFSETS) {
      const nx = x + dx
      const nz = z + dz
      if (nx < 0 || nx >= sizeX || nz < 0 || nz >= sizeZ) continue
      const n = nz * sizeX + nx
      if (visited.has(n) || blocked.has(n)) continue
      visited.add(n)
      queue.push(n)
    }
  }
  return visited
}

/** Every integer cell at exact Chebyshev distance `radius` from `(cx, cz)` —
 *  same shape as `accessibility-pass.ts`'s own `ringOffsets`. */
function* ringOffsets(cx: number, cz: number, radius: number): Generator<[number, number]> {
  for (let x = cx - radius; x <= cx + radius; x++) {
    yield [x, cz - radius]
    yield [x, cz + radius]
  }
  for (let z = cz - radius + 1; z <= cz + radius - 1; z++) {
    yield [cx - radius, z]
    yield [cx + radius, z]
  }
}

export function computeBoundsAutoFix(
  context: Pick<MapContext, 'sizeX' | 'sizeZ' | 'placedObjects' | 'levelsMap' | 'climbsMap' | 'waterMap'>,
  catalog: GameCatalog | null,
): BoundsAutoFixResult {
  const { sizeX, sizeZ, placedObjects } = context
  const violations = findOutOfBoundsPlacements(context, catalog)
  if (violations.length === 0) return { fixes: [], unresolved: [] }

  const catalogById = new Map((catalog?.mapObjects ?? []).map((o) => [o.id, o]))
  // Working copy — grows as fixes are chosen so two violators never land on
  // (or overlap) each other.
  const blocked = buildBlockedTileSet(context, catalog)

  // Every violator is about to be relocated away from its current spot, so
  // its OWN current (partially out-of-bounds) footprint must never count as
  // an obstacle for finding its (or, via a clamp landing nearby, another
  // violator's) new home — real bug found via a live test against this
  // feature's own historical repro file: a violator's clamped candidate
  // position overlaps its own stale in-bounds cells (`buildBlockedTileSet`
  // built `blocked` from the ORIGINAL, still-violating positions), so it
  // collided with itself and `isValidCandidate` rejected every candidate.
  // Cleared for ALL violators upfront, before seeding too — a violator that
  // is also the map's only player start must not have its own stale cells
  // block its own (clamped) seed either.
  for (const violation of violations) {
    const template = catalogById.get(violation.sid)
    for (const cell of computeFootprintTiles(template, violation.x, violation.z)) {
      if (cell.x < 0 || cell.x >= sizeX || cell.z < 0 || cell.z >= sizeZ) continue
      blocked.delete(cell.z * sizeX + cell.x)
    }
  }

  // Multi-source seeds: every real player start's own walkable access
  // cell(s) (value===2 — the real "step here to use it" tile, never the
  // spawner's own solid anchor), matching accessNodesFor's convention in
  // accessibility-pass.ts. Falls back to the anchor node if the template
  // can't be resolved or has no value-2 cell, rather than dropping the seed.
  //
  // Always seeds from the CLAMPED-to-bounds position, not the spawner's raw
  // (possibly-violating) one: real bug found via a live test against this
  // feature's own historical repro file (both its city-spawners sit right at
  // the edge) — when the only player starts on the map are themselves
  // out-of-bounds, seeding from their broken footprint produces garbage/out-
  // of-range node indices, so `reachable` ends up empty and every candidate
  // everywhere fails the reachability check, even a perfectly good one.
  // Clamping first costs nothing when a spawner is already in-bounds (no-op)
  // and makes seeding correct exactly when it matters most.
  const seeds: number[] = []
  for (const obj of placedObjects as PlacedObject[]) {
    if (obj.type !== 0 || !obj.spawnerInfo || (obj.spawnerInfo.spawnPointType !== 0 && obj.spawnerInfo.spawnPointType !== 1)) continue
    const template = catalogById.get(obj.sid)
    const clamp = clampAnchorToFootprintBounds(template, obj.x, obj.z, sizeX, sizeZ)
    const cells = computeFootprintTiles(template, clamp.x, clamp.z).filter((c) => c.value === 2)
    if (cells.length > 0) {
      for (const c of cells) seeds.push(c.z * sizeX + c.x)
    } else {
      seeds.push(clamp.z * sizeX + clamp.x)
    }
  }
  const reachable = floodFillReachable(seeds, blocked, sizeX, sizeZ)

  const isValidCandidate = (template: ReturnType<typeof catalogById.get>, x: number, z: number): boolean => {
    const cells = computeFootprintTiles(template, x, z)
    if (!isFootprintInBounds(cells, sizeX, sizeZ)) return false
    let anyReachable = false
    for (const cell of cells) {
      const n = cell.z * sizeX + cell.x
      if (cell.value === 1 && blocked.has(n)) return false
      if (reachable.has(n)) anyReachable = true
    }
    return anyReachable
  }

  const fixes: BoundsAutoFix[] = []
  const unresolved: OutOfBoundsPlacement[] = []
  for (const violation of [...violations].sort((a, b) => a.id - b.id)) {
    const template = catalogById.get(violation.sid)
    const clamp = clampAnchorToFootprintBounds(template, violation.x, violation.z, sizeX, sizeZ)

    let found: { x: number; z: number } | null = isValidCandidate(template, clamp.x, clamp.z) ? clamp : null
    const maxRadius = Math.max(sizeX, sizeZ)
    for (let radius = 1; !found && radius <= maxRadius; radius++) {
      for (const [x, z] of ringOffsets(clamp.x, clamp.z, radius)) {
        if (x < 0 || x >= sizeX || z < 0 || z >= sizeZ) continue
        if (isValidCandidate(template, x, z)) { found = { x, z }; break }
      }
    }

    if (!found) { unresolved.push(violation); continue }
    const toNode = found.z * sizeX + found.x
    fixes.push({ id: violation.id, sid: violation.sid, fromNode: violation.node, toNode })
    for (const cell of computeFootprintTiles(template, found.x, found.z)) {
      if (cell.value === 1) blocked.add(cell.z * sizeX + cell.x)
    }
  }

  return { fixes, unresolved }
}
