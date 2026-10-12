// ─── RMG river banks ─────────────────────────────────────────────────────────
// A river with bare ground right up to its edge looks cut out with a ruler.
// This pass scatters walkable ground clutter on the land next to every river
// tile: stones, a biome-matching tuft or flower, and the odd reed. Objects in
// nature collect where the terrain changes, so the clutter comes in clumps —
// each 4×4-tile block gets its own random density, so some stretches of bank
// are crowded and others bare.
//
// A river that ends in a lake or the sea gets a marshy mouth too: reeds and
// water weed are thickest at the last tile and thin out over four tiles
// (the game has no river-delta object, so this stands in for one).
//
// Runs late (after beaches, before the guard pass): the clutter is walkable
// (no solid footprint), so it never blocks a road, an entrance or a guard
// tile. Tiles that hold roads, rivers, water or a reserved guard tile are
// skipped.

import { computeRoadDistanceField } from './zone-connections'
import { DEFAULT_RIVER_BANK_DENSITY } from './rmg-tuning'
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
/** Marsh plants at a river mouth (all walkable 1×1 decorations). */
const MARSH_REED_SIDS = ['water_reed_1', 'water_reed_2']
const MARSH_WEED_SIDS = ['water_weed_1', 'water_weed_2']
/** How far (steps) from the mouth tile the marsh reaches, and its chance per
 *  tile at 1 to 4 steps (at the default bank density; the tuning's bank
 *  density scales it, 0 turns it off). */
const MOUTH_REACH = 4
const MOUTH_CHANCE = [0, 0.9, 0.75, 0.55, 0.35]

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
  /** Last tile of every river; the ones touching `waterNodes` get a marsh. */
  mouthNodes?: number[]
  waterNodes?: Set<number>
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

  // Marsh at the mouths first, so it isn't thinned out by the bank clutter.
  const water = options.waterNodes
  const marshReeds = usable(MARSH_REED_SIDS)
  const marshWeeds = usable(MARSH_WEED_SIDS)
  const marshScale = density / DEFAULT_RIVER_BANK_DENSITY
  if (water && (marshReeds.length > 0 || marshWeeds.length > 0)) {
    const touchesWater = (node: number): boolean => [-1, 1, -sizeX, sizeX].some((d) => {
      const m = node + d
      // Stay on the same row for the sideways steps.
      return m >= 0 && m < sizeX * sizeZ && Math.abs((m % sizeX) - (node % sizeX)) <= 1 && water.has(m)
    })
    for (const mouth of options.mouthNodes ?? []) {
      if (!touchesWater(mouth)) continue
      const mx = mouth % sizeX
      const mz = Math.floor(mouth / sizeX)
      for (let dz = -MOUTH_REACH; dz <= MOUTH_REACH; dz++) {
        for (let dx = -MOUTH_REACH; dx <= MOUTH_REACH; dx++) {
          const steps = Math.abs(dx) + Math.abs(dz)
          if (steps < 1 || steps > MOUTH_REACH) continue
          const x = mx + dx
          const z = mz + dz
          if (x < 0 || x >= sizeX || z < 0 || z >= sizeZ) continue
          const node = z * sizeX + x
          if (riverNodes.has(node) || excludedNodes.has(node) || water.has(node)) continue
          if (rng() >= marshScale * MOUTH_CHANCE[steps]) continue
          const biome = zoneBiome.get(zoneIdByNode[node])
          if (biome === undefined) continue
          // Weed at the water's edge, reeds a little further in.
          const preferred = touchesWater(node) ? marshWeeds : marshReeds
          const list = preferred.length > 0 ? preferred : [...marshReeds, ...marshWeeds]
          const sid = pick(list)
          if (violatesIsolation(sidBiome(sid, catalogById), biome)) continue
          if (tryPlaceAt(sid, node, sizeX, sizeZ, catalogById, state)) {
            const rotation = isRotationallySymmetricFootprint(sid, catalogById) ? randomDecorRotation(rng) : undefined
            placements.push({ tempId: state.nextTempId++, sid, node, rotation })
          }
        }
      }
    }
  }

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
