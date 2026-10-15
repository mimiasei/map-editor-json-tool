// ─── RMG road bridges ─────────────────────────────────────────────────────────
// A road that crosses a river on a straight stretch gets a bridge object there:
// bridge_wood on the dirt road (road id 1), bridge_stone on the stone road (id 2).
// Both bridges are Grass-tagged in the catalog but are used on every biome
// (biome-isolation.ts treats them as universal).
//
// Confirmed against the game's own maps (ascension_to_the_throne, Broken_Alliance,
// Fun_and_Graves, Glittering_Strait, Thirst_for_Power, ...): a bridge always sits on a
// STRAIGHT river tile (shape code 12 = river runs north-south, 3 = east-west) with the
// road crossing it at a right angle, and rotation 0 is the bridge running east-west
// (over a north-south river), rotation 1 north-south (over an east-west river).

import type { CatalogMapObject } from '@/lib/catalog/types'
import { type PlacementState, type ZonePlacement } from './zone-population'

/** River shape codes (river-shape.ts: E=1, W=2, N=4, S=8) of a straight river. */
const RIVER_NORTH_SOUTH = 12
const RIVER_EAST_WEST = 3

const BRIDGE_BY_ROAD_ID: Record<number, string> = { 1: 'bridge_wood', 2: 'bridge_stone' }

export interface PlaceRoadBridgesOptions {
  sizeX: number
  sizeZ: number
  roadNodes: ReadonlySet<number>
  roadIdByNode: ReadonlyMap<number, number>
  /** Painted river shape code per river tile; waterfall tiles must not be in it. */
  riverShapeByNode: ReadonlyMap<number, number>
  waterNodes: ReadonlySet<number>
  catalogById: Map<string, CatalogMapObject>
  state: PlacementState
}

export function placeRoadBridges(options: PlaceRoadBridgesOptions): ZonePlacement[] {
  const { sizeX, sizeZ, roadNodes, roadIdByNode, riverShapeByNode, waterNodes, catalogById, state } = options
  const placements: ZonePlacement[] = []
  const hasRoad = (x: number, z: number): boolean => x >= 0 && x < sizeX && z >= 0 && z < sizeZ && roadNodes.has(z * sizeX + x)
  for (const node of roadNodes) {
    const shape = riverShapeByNode.get(node)
    if (shape !== RIVER_NORTH_SOUTH && shape !== RIVER_EAST_WEST) continue
    if (waterNodes.has(node) || state.usedAnchors.has(node)) continue
    const sid = BRIDGE_BY_ROAD_ID[roadIdByNode.get(node) ?? 1] ?? BRIDGE_BY_ROAD_ID[1]
    if (!catalogById.has(sid)) continue
    const x = node % sizeX
    const z = Math.floor(node / sizeX)
    // The road must cross the river at a right angle: continue on both banks, and not run along it.
    const crossing = shape === RIVER_NORTH_SOUTH
      ? hasRoad(x - 1, z) && hasRoad(x + 1, z) && !hasRoad(x, z - 1) && !hasRoad(x, z + 1)
      : hasRoad(x, z - 1) && hasRoad(x, z + 1) && !hasRoad(x - 1, z) && !hasRoad(x + 1, z)
    if (!crossing) continue
    state.usedAnchors.add(node)
    placements.push({ tempId: state.nextTempId++, sid, node, rotation: shape === RIVER_NORTH_SOUTH ? 0 : 1 })
  }
  return placements
}
