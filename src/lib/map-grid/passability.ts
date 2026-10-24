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
// 2. Elevation "wall": `levelsMap` (-1 lowered / 0 ground / 1 heightened).
//    The blocked tiles are the LOWER tiles next to a higher one, diagonals
//    included (the cliff pieces stand there); the higher tiles themselves,
//    edge or interior, stay walkable. Verified in the game on a test map
//    (cliff_test_block): a 10x3 raised block had all 30 of its tiles walkable
//    and the 30 tiles of the ring around it (12x5 minus the block, corners
//    too) blocked. A tile with a `climbsMap` ramp as a 4-neighbour is not
//    blocked, and a ramp is never blocked: every real `climbsMap === 1` tile
//    sits on the lower side of a height boundary, directly bordering the
//    higher side (4-neighbor checks against `Gorges_of_Discord.map`/
//    `Fun_and_Graves.map`/`Glittering_Strait.map`). Only the raised-block
//    case was checked in the game; lowered areas use the same rule (assumed).
// 3. Water: `waterMap !== 0` blocks independently of the wall rule — a hero
//    can't stand on water anywhere in a basin, edge or middle alike, unlike
//    a dry elevation change where only the transition itself is impassable
//    (confirmed: plenty of real level-`-1` area has no water at all, so it
//    isn't redundant with the elevation check).

import type { MapContext } from '@/types/map-context'
import type { GameCatalog } from '@/lib/catalog/types'
import { computeFootprintTiles } from '@/lib/map-grid/footprint'

const NEIGHBOR_OFFSETS: [number, number][] = [[-1, 0], [1, 0], [0, -1], [0, 1]]
const NEIGHBOR_OFFSETS_8: [number, number][] = [...NEIGHBOR_OFFSETS, [-1, -1], [1, -1], [-1, 1], [1, 1]]

/** These spawn-placeholder sids (Core/DB/map/objects/7_spawns.json) are
 *  walked ONTO to interact — collecting a resource pile, engaging a guard
 *  squad, picking up an item — unlike every other object here, where the
 *  footprint's `1` cells are solid mesh you can't walk through. Confirmed by
 *  the user's own domain knowledge, so their footprint never contributes to
 *  the blocked set regardless of node value. city-spawner/hero-spawner are
 *  deliberately NOT included — a spawned city/hero building genuinely
 *  blocks. */
export const NON_BLOCKING_SPAWNER_SIDS = new Set(['random-res', 'random-squad', 'random-item'])

/**
 * Whether `node` is an elevation "wall" tile: a tile lower than at least one of its 8 neighbours (the cliff stands on the low side, see
 * the header), unless it is a ramp or has a ramp as a 4-neighbour. A ramp tile itself is never a wall — confirmed against every real
 * sample map with any climbsMap data: level -1 ramp tiles are common (Fun_and_Graves 11 of 28, Glittering_Strait 78 of 171,
 * Gorges_of_Discord 11 of 21, ...) and most of them (e.g. 52 of 78 on Glittering_Strait) have no OTHER ramp neighbor, so without this
 * exemption the ramp itself — the one tile whose whole purpose is to be walked across — read as impassable.
 */
export function isElevationWallTile(
  node: number,
  sizeX: number,
  sizeZ: number,
  levelsMap: number[],
  climbsMap: number[],
): boolean {
  const level = levelsMap[node] ?? 0
  if (climbsMap[node] === 1) return false
  const x = node % sizeX
  const z = Math.floor(node / sizeX)
  let lowerThanNeighbour = false
  for (const [dx, dz] of NEIGHBOR_OFFSETS_8) {
    const nx = x + dx
    const nz = z + dz
    if (nx < 0 || nx >= sizeX || nz < 0 || nz >= sizeZ) continue
    if ((levelsMap[nz * sizeX + nx] ?? 0) > level) lowerThanNeighbour = true
  }
  if (!lowerThanNeighbour) return false
  for (const [dx, dz] of NEIGHBOR_OFFSETS) {
    const nx = x + dx
    const nz = z + dz
    if (nx >= 0 && nx < sizeX && nz >= 0 && nz < sizeZ && climbsMap[nz * sizeX + nx] === 1) return false
  }
  return true
}

type PassabilityContext = Pick<MapContext, 'sizeX' | 'sizeZ' | 'placedObjects' | 'levelsMap' | 'climbsMap' | 'waterMap'>
type EntranceContext = Pick<MapContext, 'sizeX' | 'sizeZ' | 'placedObjects'>

/** A single `objects[]` (type 0) instance's own solid (`value === 1`)
 *  footprint cells in world space — the same per-object rule
 *  `buildBlockedTileSet` sweeps over every placed instance, factored out so
 *  the object-paint tool (map-grid painter, generalized from terrain to any
 *  object) can ask "would placing THIS sid HERE block anything" for a
 *  candidate that isn't placed yet. Spawn-placeholder sids never block, per
 *  the walked-onto-to-interact rule above.
 *
 *  `entranceCells` (default false) returns the object's entrance cells
 *  (`value === 2`) instead of its solid cells — used to check whether an
 *  object's own entrance is blocked, or to display entrance cells on the
 *  map (see `buildEntranceTileSet` below). */
export function objectBlockedCells(sid: string, x: number, z: number, catalog: GameCatalog | null, entranceCells?: boolean, rotation?: number): { x: number; z: number }[] {
  if (NON_BLOCKING_SPAWNER_SIDS.has(sid)) return []
  const valueToFind = entranceCells ? 2 : 1
  const template = catalog?.mapObjects.find((o) => o.id === sid)
  return computeFootprintTiles(template, x, z, rotation).filter((cell) => cell.value === valueToFind)
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
    for (const cell of objectBlockedCells(obj.sid, obj.x, obj.z, catalog, false, obj.rotation)) {
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

export function buildEntranceTileSet(context: EntranceContext, catalog: GameCatalog | null): Set<number> {
    const entrances = new Set<number>()
    const { sizeX, sizeZ, placedObjects } = context

    if (sizeX <= 0 || sizeZ <= 0) return entrances

    // Source 1: object footprints. Only objects[] (type 0) — squads/markers
    // aren't physical terrain and have no footprint template in the catalog.
    for (const object of placedObjects) {
        if (object.type !== 0) continue
        for (const cell of objectBlockedCells(object.sid, object.x, object.z, catalog, true, object.rotation)) {
            if (cell.x < 0 || cell.x >= sizeX || cell.z < 0 || cell.z >= sizeZ) continue
            entrances.add(cell.z * sizeX + cell.x)
        }
    }

    return entrances
}
