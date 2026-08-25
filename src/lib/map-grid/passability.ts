// ─── Map grid — blocked-tile ("passability") computation ────────────────────
// Confirmed against real sample maps during the blocked-tile-overlay
// feasibility research: no dedicated "passability" field exists anywhere in
// the `.map` format, so this combines three independently-confirmed sources.
//
// 1. Object footprint: a placed object's footprint cells with value `1` are
//    blocked (solid mesh); `2` cells are walkable interaction cells (a hero
//    must be able to stand there to interact); `0` cells are plain walkable
//    ground. Only `objects[]` (type 0) carries a real footprint template —
//    squads (armies, type 2) and markers (zones, type 1) aren't terrain.
// 2. Elevation "wall": `levelsMap` (-1 lowered / 0 ground / 1 heightened) —
//    a level-≠0 tile is only blocked at its *boundary* with a different
//    level, and only when no adjacent tile is a `climbsMap` ramp. This is
//    symmetric for both directions (0↔-1 and 0↔1) — the interior of either
//    tier, once past a ramp, is normal walkable ground. Confirmed empirically
//    (4-neighbor checks against `Gorges_of_Discord.map`/`Fun_and_Graves.map`/
//    `Glittering_Strait.map`): every real `climbsMap === 1` tile sits on the
//    lower side of a height boundary, directly bordering the higher side —
//    it's the ramp, not a blocker itself.
// 3. Water: `waterMap !== 0` blocks independently of the wall rule — a hero
//    can't stand on water anywhere in a basin, edge or middle alike, unlike
//    a dry elevation change where only the transition itself is impassable
//    (confirmed: plenty of real level-`-1` area has no water at all, so it
//    isn't redundant with the elevation check).

import type { MapContext } from '@/types/map-context'
import type { GameCatalog } from '@/lib/catalog/types'
import { computeFootprintTiles } from '@/lib/map-grid/footprint'

const NEIGHBOR_OFFSETS: [number, number][] = [[-1, 0], [1, 0], [0, -1], [0, 1]]

/** These spawn-placeholder sids (Core/DB/map/objects/7_spawns.json) are
 *  walked ONTO to interact — collecting a resource pile, engaging a guard
 *  squad, picking up an item — unlike every other object here, where the
 *  footprint's `1` cells are solid mesh you can't walk through. Confirmed by
 *  the user's own domain knowledge, so their footprint never contributes to
 *  the blocked set regardless of node value. city-spawner/hero-spawner are
 *  deliberately NOT included — a spawned city/hero building genuinely
 *  blocks. */
const NON_BLOCKING_SPAWNER_SIDS = new Set(['random-res', 'random-squad', 'random-item'])

/**
 * Whether `node` is an elevation "wall" tile: its own level is not 0, at
 * least one 4-neighbor is a *different* level, and no 4-neighbor is a ramp.
 */
function isElevationWallTile(
  node: number,
  sizeX: number,
  sizeZ: number,
  levelsMap: number[],
  climbsMap: number[],
): boolean {
  const level = levelsMap[node]
  if (!level) return false // 0 or undefined — ground itself is never a wall
  const x = node % sizeX
  const z = Math.floor(node / sizeX)
  let isWall = false
  let nearRamp = false
  for (const [dx, dz] of NEIGHBOR_OFFSETS) {
    const nx = x + dx
    const nz = z + dz
    if (nx < 0 || nx >= sizeX || nz < 0 || nz >= sizeZ) continue
    const nNode = nz * sizeX + nx
    if (levelsMap[nNode] !== level) isWall = true
    if (climbsMap[nNode] === 1) nearRamp = true
  }
  return isWall && !nearRamp
}

type PassabilityContext = Pick<MapContext, 'sizeX' | 'sizeZ' | 'placedObjects' | 'levelsMap' | 'climbsMap' | 'waterMap'>

/** A single `objects[]` (type 0) instance's own solid (`value === 1`)
 *  footprint cells in world space — the same per-object rule
 *  `buildBlockedTileSet` sweeps over every placed instance, factored out so
 *  the object-paint tool (map-grid painter, generalized from terrain to any
 *  object) can ask "would placing THIS sid HERE block anything" for a
 *  candidate that isn't placed yet. Spawn-placeholder sids never block, per
 *  the walked-onto-to-interact rule above. */
export function objectBlockedCells(sid: string, x: number, z: number, catalog: GameCatalog | null): { x: number; z: number }[] {
  if (NON_BLOCKING_SPAWNER_SIDS.has(sid)) return []
  const template = catalog?.mapObjects.find((o) => o.id === sid)
  return computeFootprintTiles(template, x, z, sid).filter((cell) => cell.value === 1)
}

/** Every blocked tile (node index) on the current map, per the three-source
 *  rule above. Returns an empty set for a sizeless/unloaded map. */
export function buildBlockedTileSet(context: PassabilityContext, catalog: GameCatalog | null): Set<number> {
  const blocked = new Set<number>()
  const { sizeX, sizeZ, placedObjects, levelsMap, climbsMap, waterMap } = context
  if (sizeX <= 0 || sizeZ <= 0) return blocked

  // Source 1: object footprints. Only objects[] (type 0) — squads/markers
  // aren't physical terrain and have no footprint template in the catalog.
  for (const obj of placedObjects) {
    if (obj.type !== 0) continue
    for (const cell of objectBlockedCells(obj.sid, obj.x, obj.z, catalog)) {
      if (cell.x < 0 || cell.x >= sizeX || cell.z < 0 || cell.z >= sizeZ) continue
      blocked.add(cell.z * sizeX + cell.x)
    }
  }

  // Sources 2 + 3: elevation wall + water, one pass over every tile.
  const tileCount = sizeX * sizeZ
  const hasLevels = levelsMap.length === tileCount
  const hasWater = waterMap.length === tileCount
  const climbs = climbsMap.length === tileCount ? climbsMap : []
  if (hasLevels || hasWater) {
    for (let node = 0; node < tileCount; node++) {
      if (hasWater && waterMap[node] !== 0) {
        blocked.add(node)
        continue
      }
      if (hasLevels && isElevationWallTile(node, sizeX, sizeZ, levelsMap, climbs)) {
        blocked.add(node)
      }
    }
  }

  return blocked
}
