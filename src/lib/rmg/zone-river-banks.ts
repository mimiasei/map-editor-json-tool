// ─── RMG river banks ─────────────────────────────────────────────────────────
// A river with bare ground right up to its edge looks cut out with a ruler.
// This pass scatters walkable ground clutter on the land next to every river
// tile: stones, a biome-matching tuft or flower, and the odd reed. Objects in
// nature collect where the terrain changes, so the clutter comes in clumps —
// each 4×4-tile block gets its own random density, so some stretches of bank
// are crowded and others bare.
//
// Runs late (after beaches, before the guard pass): the clutter is walkable
// (no solid footprint), so it never blocks a road, an entrance or a guard
// tile. Tiles that hold roads, rivers, water or a reserved guard tile are
// skipped.

import { computeRoadDistanceField } from './zone-connections'
import { tryPlaceAt, isRotationallySymmetricFootprint, type PlacementState, type ZonePlacement } from './zone-population'
import { randomDecorRotation } from '@/lib/h3-import/scenery-clusters'
import type { CatalogMapObject } from '@/lib/catalog/types'
import type { BiomeId } from '@/lib/map-grid/terrain-colors'
import { sidBiome, violatesIsolation } from './biome-isolation'

/** Walkable stones per biome (the game's own `*_stones_1` ground clutter). */
const STONE_SIDS: Partial<Record<BiomeId, string[]>> = {
  1: ['grass_stones_1'], 2: ['desert_stones_1'], 3: ['dead_stones_1'], 4: ['snow_stones_1'],
  5: ['grass_stones_1'], 6: ['lava_stones_1'], 7: ['dirt_stones_1'],
}
/** Walkable tufts and flowers per biome (the mapping's own "shrub" picks). */
const TUFT_SIDS: Partial<Record<BiomeId, string[]>> = {
  1: ['grass_1'], 2: ['grass_desert_1', 'grass_desert_2'], 3: ['grass_death_1'], 4: ['grass_snow_1'],
  5: ['grass_1'], 7: ['dirt_strange_flower'],
}
const REED_SIDS = ['water_reed_1']

/** Of the bank clutter, the shares that are stones / tufts (the rest is reeds). */
const STONE_SHARE = 0.5
const TUFT_SHARE = 0.4
/** How far from a river tile (4-neighbour steps) clutter may go. */
const BANK_REACH = 2
/** Side of the blocks that share one random density. */
const CLUMP_BLOCK = 4

export interface ScatterRiverBanksOptions {
  sizeX: number
  sizeZ: number
  riverNodes: Set<number>
  /** Tiles that must stay clear (roads, water). */
  excludedNodes: Set<number>
  zoneIdByNode: number[]
  zoneBiome: Map<number, BiomeId>
  catalogById: Map<string, CatalogMapObject>
  state: PlacementState
  rng: () => number
  /** Average chance per bank tile (0 = none); clumping moves it between 0 and ~2×. */
  density: number
}

export function scatterRiverBanks(options: ScatterRiverBanksOptions): ZonePlacement[] {
  const { sizeX, sizeZ, riverNodes, excludedNodes, zoneIdByNode, zoneBiome, catalogById, state, rng, density } = options
  const placements: ZonePlacement[] = []
  if (density <= 0 || riverNodes.size === 0) return placements

  const dist = computeRoadDistanceField(riverNodes, sizeX, sizeZ, BANK_REACH)
  const blockWeight = new Map<number, number>()
  const weightAt = (node: number): number => {
    const key = Math.floor(Math.floor(node / sizeX) / CLUMP_BLOCK) * 4096 + Math.floor((node % sizeX) / CLUMP_BLOCK)
    let w = blockWeight.get(key)
    if (w === undefined) { w = rng() * 2; blockWeight.set(key, w) }
    return w
  }
  const usable = (sids: string[] | undefined): string[] => (sids ?? []).filter((sid) => catalogById.has(sid))
  const pick = (list: string[]): string => list[Math.floor(rng() * list.length)]

  for (let node = 0; node < dist.length; node++) {
    if (dist[node] < 1 || dist[node] > BANK_REACH || riverNodes.has(node) || excludedNodes.has(node)) continue
    // The second row is sparser than the first.
    const reach = dist[node] === 1 ? 1 : 0.5
    if (rng() >= density * weightAt(node) * reach) continue
    const biome = zoneBiome.get(zoneIdByNode[node])
    if (biome === undefined) continue
    const roll = rng()
    const stones = usable(STONE_SIDS[biome])
    const tufts = usable(TUFT_SIDS[biome])
    const reeds = usable(REED_SIDS)
    const list = roll < STONE_SHARE && stones.length > 0 ? stones
      : roll < STONE_SHARE + TUFT_SHARE && tufts.length > 0 ? tufts
        : reeds.length > 0 ? reeds : stones.length > 0 ? stones : tufts
    if (list.length === 0) continue
    const sid = pick(list)
    // A reed (Grass-tagged) never goes to Sand, Snow or Lava ground.
    if (violatesIsolation(sidBiome(sid, catalogById), biome)) continue
    if (tryPlaceAt(sid, node, sizeX, sizeZ, catalogById, state)) {
      const rotation = isRotationallySymmetricFootprint(sid, catalogById) ? randomDecorRotation(rng) : undefined
      placements.push({ tempId: state.nextTempId++, sid, node, rotation })
    }
  }
  return placements
}
