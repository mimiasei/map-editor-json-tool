// ─── Scenery beside mines ───────────────────────────────────────────────────
// A wood mine sits at the edge of a stand of trees, an ore mine against
// rock, and a gold mine against rock about half the time, so a mine looks
// like it belongs to its surroundings. The trees / mountains touch the mine's
// footprint, but never its entrance cells or the tiles in front of them.

import type { CatalogMapObject } from '@/lib/catalog/types'
import type { BiomeId } from '@/lib/map-grid/terrain-colors'
import { buildFuzzyObstaclePools } from '@/lib/map-grid/fuzzy-obstacle'
import { applyBiomeDecorationMix, mineForestTrees, shuffledByWeight } from './biome-decoration-mix'
import { computeFootprintTiles } from '@/lib/map-grid/footprint'
import { randomDecorRotation } from '@/lib/h3-import/scenery-clusters'
import { entranceApproachTiles, isRotationallySymmetricFootprint, tryPlaceAt, type PlacementState, type ZonePlacement } from './zone-population'

/** Chance a gold mine gets mountains beside it. */
export const GOLD_MINE_MOUNTAIN_CHANCE = 0.5
const FOREST_MIN = 4
const FOREST_MAX = 7
const MOUNTAIN_SEARCH_RADIUS = 4
const MOUNTAIN_SIDS_TRIED = 8

export interface ScatterMineSurroundingsOptions {
  sizeX: number
  sizeZ: number
  /** Every mine placed on the map (other sids are ignored). */
  mines: { sid: string; node: number }[]
  zoneBiome: Map<number, BiomeId>
  zoneIdByNode: ArrayLike<number>
  catalogById: Map<string, CatalogMapObject>
  mapObjects: CatalogMapObject[]
  state: PlacementState
  rng: () => number
}

function shuffled<T>(list: T[], rng: () => number): T[] {
  const out = [...list]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

export function scatterMineSurroundings(options: ScatterMineSurroundingsOptions): ZonePlacement[] {
  const { sizeX, sizeZ, mines, zoneBiome, zoneIdByNode, catalogById, mapObjects, state, rng } = options
  // Own objects are tried in uniform random order; the decoration mix rules (biome-decoration-mix.ts)
  // only bring the borrowed ones in earlier or later by their chance.
  const basePools = buildFuzzyObstaclePools(mapObjects)
  const { pools: mountainPools, treePools, weights: mixWeights } = applyBiomeDecorationMix(basePools, undefined)
  const placements: ZonePlacement[] = []
  const inBounds = (x: number, z: number): boolean => x >= 0 && x < sizeX && z >= 0 && z < sizeZ

  const place = (sid: string, node: number): boolean => {
    if (!tryPlaceAt(sid, node, sizeX, sizeZ, catalogById, state)) return false
    placements.push({ tempId: state.nextTempId++, sid, node, rotation: isRotationallySymmetricFootprint(sid, catalogById) ? randomDecorRotation(rng) : undefined })
    return true
  }
  const solidNodes = (sid: string, node: number): number[] =>
    computeFootprintTiles(catalogById.get(sid), node % sizeX, Math.floor(node / sizeX)).filter((c) => c.value === 1).map((c) => c.z * sizeX + c.x)

  for (const mine of mines) {
    const wanted = mine.sid === 'mine_wood' ? 'forest'
      : mine.sid === 'mine_ore' ? 'mountain'
      : mine.sid === 'mine_gold' && rng() < GOLD_MINE_MOUNTAIN_CHANCE ? 'mountain'
      : null
    if (!wanted) continue
    const biome = (state.tileBiome?.[mine.node] ?? zoneBiome.get(zoneIdByNode[mine.node])) as BiomeId | undefined
    if (biome === undefined) continue

    const mineX = mine.node % sizeX
    const mineZ = Math.floor(mine.node / sizeX)
    const mineCells = computeFootprintTiles(catalogById.get(mine.sid), mineX, mineZ)
    const footprint = new Set(mineCells.filter((c) => c.value !== 0).map((c) => c.z * sizeX + c.x))
    if (footprint.size === 0) continue
    // Entrance cells and the tiles in front of them stay clear.
    const approach = entranceApproachTiles(mineCells, sizeX, sizeZ)
    const keepClear = new Set<number>([...approach.front, ...approach.sides, ...approach.diagonals])

    /** Whether an object at `node` has a solid cell next to `glue`, and none on the keep-clear tiles or the mine. */
    const fits = (sid: string, node: number, glue: Set<number>): boolean => {
      const solid = solidNodes(sid, node)
      if (solid.length === 0) return false
      let touches = false
      for (const n of solid) {
        const x = n % sizeX
        const z = Math.floor(n / sizeX)
        if (!inBounds(x, z) || keepClear.has(n) || footprint.has(n)) return false
        for (let dz = -1; dz <= 1 && !touches; dz++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (inBounds(x + dx, z + dz) && glue.has((z + dz) * sizeX + x + dx)) { touches = true; break }
          }
        }
      }
      return touches
    }

    if (wanted === 'forest') {
      // A biome with a MINE_FOREST_RULES entry uses those trees instead of its own.
      const mineTrees = mineForestTrees(biome, basePools)
      const trees = mineTrees?.trees ?? treePools[biome]?.obstacles ?? []
      if (trees.length === 0) continue
      const glue = new Set(footprint)
      const target = FOREST_MIN + Math.floor(rng() * (FOREST_MAX - FOREST_MIN + 1))
      for (let placed = 0; placed < target; placed++) {
        // Every free tile next to the mine or a tree already placed here.
        const candidates = new Set<number>()
        for (const g of glue) {
          const gx = g % sizeX
          const gz = Math.floor(g / sizeX)
          for (let dz = -1; dz <= 1; dz++) {
            for (let dx = -1; dx <= 1; dx++) {
              const n = (gz + dz) * sizeX + gx + dx
              if (inBounds(gx + dx, gz + dz) && !glue.has(n) && !keepClear.has(n)) candidates.add(n)
            }
          }
        }
        let done = false
        for (const node of shuffled([...candidates], rng)) {
          for (const sid of shuffledByWeight(trees, rng, mineTrees?.weights ?? mixWeights?.[biome]).slice(0, 3)) {
            if (!fits(sid, node, glue) || !place(sid, node)) continue
            for (const n of solidNodes(sid, node)) glue.add(n)
            done = true
            break
          }
          if (done) break
        }
        if (!done) break
      }
    } else {
      const pool = mountainPools[biome]?.mountains ?? []
      if (pool.length === 0) continue
      const count = rng() < 0.4 ? 2 : 1
      const glue = new Set(footprint)
      for (let k = 0; k < count; k++) {
        let done = false
        for (const sid of shuffledByWeight(pool, rng, mixWeights?.[biome]).slice(0, MOUNTAIN_SIDS_TRIED)) {
          for (let r = 1; r <= MOUNTAIN_SEARCH_RADIUS && !done; r++) {
            for (let dz = -r; dz <= r && !done; dz++) {
              for (let dx = -r; dx <= r; dx++) {
                if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue
                const x = mineX + dx
                const z = mineZ + dz
                if (!inBounds(x, z)) continue
                const node = z * sizeX + x
                if (!fits(sid, node, glue) || !place(sid, node)) continue
                for (const n of solidNodes(sid, node)) glue.add(n)
                done = true
                break
              }
            }
          }
          if (done) break
        }
        if (!done) break
      }
    }
  }
  return placements
}
