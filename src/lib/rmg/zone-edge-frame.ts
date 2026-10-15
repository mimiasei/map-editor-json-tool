// ─── RMG map-edge frame ──────────────────────────────────────────────────────
// The game's handcrafted maps all fence in their edge: measured over its 42
// maps, 90% of the outermost row of tiles is blocked (water, a tree, a
// mountain, another solid object), 83% of the second, 73% of the third and 64%
// of the fourth, against ~58% in the interior. The rest of the outer row is
// 1-2 tile gaps. The blocked part is trees and mountains of the biome, so the
// edge reads as a forest or range that no one can walk past. A generated map
// used to stop at the edge with bare ground (13-26% of the outer row blocked).
//
// This pass fills the four outer rows up to those shares, with trees and
// mountains from the biome's own pools, and runs before the density-based
// obstacle scatter so its tiles are claimed first. It only uses free tiles
// (never a road, river, object or reserved approach tile) and never a tile
// that would cut the walkable ground around it into pieces.

import type { CatalogEnvironmentBiome, CatalogMapObject } from '@/lib/catalog/types'
import type { BiomeId } from '@/lib/map-grid/terrain-colors'
import { buildFuzzyObstaclePools, buildFuzzyObstacleWeights, pickWeighted } from '@/lib/map-grid/fuzzy-obstacle'
import { applyBiomeDecorationMix } from './biome-decoration-mix'
import { computeFootprintTiles } from '@/lib/map-grid/footprint'
import { randomDecorRotation } from '@/lib/h3-import/scenery-clusters'
import { tryPlaceAt, isRotationallySymmetricFootprint, type PlacementState, type ZonePlacement } from './zone-population'
import { splitsWalkableGround } from './zone-decoration'

/** Share of each outer row (0 = the outermost) that ends up blocked, at strength 1. */
const BAND_TARGET = [0.9, 0.8, 0.7, 0.62]
/** Chance per placed object in each row that it is a mountain rather than a tree. */
const BAND_MOUNTAIN_CHANCE = [0.7, 0.55, 0.35, 0.28]
/** Side of the blocks that share one random mountain affinity (ranges clump). */
const CLUMP_BLOCK = 6
/** Sids tried per tile before it is left free. */
const TRIES_PER_TILE = 3

export interface ScatterEdgeFrameOptions {
  sizeX: number
  sizeZ: number
  zoneIdByNode: number[]
  zoneBiome: Map<number, BiomeId>
  catalogById: Map<string, CatalogMapObject>
  mapObjects: CatalogMapObject[]
  state: PlacementState
  /** Water tiles: count as blocked, and are never built on. */
  waterNodes: Set<number>
  /** Blocked tiles that are still walkable (roads, rivers). */
  walkableNodes: Set<number>
  rng: () => number
  /** 0 = no frame, 1 = as dense as the handcrafted maps (the default). */
  strength: number
  rmgEnvironmentAssets?: CatalogEnvironmentBiome[]
}

export function scatterEdgeFrame(options: ScatterEdgeFrameOptions): ZonePlacement[] {
  const { sizeX, sizeZ, zoneIdByNode, zoneBiome, catalogById, mapObjects, state, waterNodes, walkableNodes, rng, strength, rmgEnvironmentAssets } = options
  const placements: ZonePlacement[] = []
  if (strength <= 0 || sizeX < 16 || sizeZ < 16) return placements

  // The biome decoration mix rules (biome-decoration-mix.ts) apply here as in the main scatter.
  const { pools, treePools, weights } = applyBiomeDecorationMix(
    buildFuzzyObstaclePools(mapObjects),
    rmgEnvironmentAssets ? buildFuzzyObstacleWeights(rmgEnvironmentAssets) : undefined,
  )
  const isBlocked = (n: number): boolean => waterNodes.has(n) || (state.blocked.has(n) && !walkableNodes.has(n))
  const clumpWeight = new Map<number, number>()
  const affinity = (x: number, z: number): number => {
    const key = Math.floor(z / CLUMP_BLOCK) * 4096 + Math.floor(x / CLUMP_BLOCK)
    let w = clumpWeight.get(key)
    if (w === undefined) { w = rng() * 2; clumpWeight.set(key, w) }
    return w
  }
  const solidCells = (sid: string, x: number, z: number): number[] =>
    computeFootprintTiles(catalogById.get(sid), x, z).filter((c) => c.value === 1 && c.x >= 0 && c.x < sizeX && c.z >= 0 && c.z < sizeZ).map((c) => c.z * sizeX + c.x)

  const bands: number[][] = BAND_TARGET.map(() => [])
  for (let z = 0; z < sizeZ; z++) {
    for (let x = 0; x < sizeX; x++) {
      const d = Math.min(x, z, sizeX - 1 - x, sizeZ - 1 - z)
      if (d < bands.length) bands[d].push(z * sizeX + x)
    }
  }

  for (let d = 0; d < bands.length; d++) {
    const tiles = bands[d]
    const target = Math.round(tiles.length * Math.min(1, BAND_TARGET[d] * strength))
    let blocked = tiles.filter(isBlocked).length
    const order = tiles.filter((n) => !isBlocked(n))
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1))
      ;[order[i], order[j]] = [order[j], order[i]]
    }
    for (const node of order) {
      if (blocked >= target) break
      if (isBlocked(node) || state.usedAnchors.has(node)) continue
      const x = node % sizeX
      const z = Math.floor(node / sizeX)
      const biome = zoneBiome.get(zoneIdByNode[node])
      if (biome === undefined) continue
      const treeList = treePools[biome].obstacles.length > 0 ? treePools[biome].obstacles : pools[biome].obstacles
      const mountainList = pools[biome].mountains
      for (let attempt = 0; attempt < TRIES_PER_TILE; attempt++) {
        const wantMountain = attempt < TRIES_PER_TILE - 1 && mountainList.length > 0 && rng() < BAND_MOUNTAIN_CHANCE[d] * affinity(x, z)
        const list = wantMountain ? mountainList : treeList
        if (list.length === 0) break
        const sid = pickWeighted(list, rng, weights?.[biome])
        const solid = solidCells(sid, x, z)
        if (solid.length === 0 || solid.some((n) => isBlocked(n) || walkableNodes.has(n))) continue
        if (splitsWalkableGround(new Set(solid), x, z, sizeX, sizeZ, isBlocked)) continue
        if (!tryPlaceAt(sid, node, sizeX, sizeZ, catalogById, state)) continue
        const rotation = isRotationallySymmetricFootprint(sid, catalogById) ? randomDecorRotation(rng) : undefined
        placements.push({ tempId: state.nextTempId++, sid, node, rotation })
        // The footprint may cover tiles of other rows too: recount this row.
        blocked = tiles.filter(isBlocked).length
        break
      }
    }
  }
  return placements
}
