// ─── Map grid — fuzzy obstacle brush ──────────────────────────────────────────
// Pure sampler for issue #193 Phase 5, no file I/O, no React. Output is
// exactly `{node, sid}[]` — the same shape `paintObjects`'s `additions`
// already expects (map-write.ts) — so this needs no new write path at all,
// just a new way to compute what to paint before handing off to the
// existing paintObjects MapSaveEdit.
//
// Design (from issue #193's Fuzzy obstacle brush section, including both
// user-requested refinements):
// - Obstacle vs clutter is classified by whether a real `environments`
//   catalog entry's `nodes[]` contains a solid `1` — the same rule
//   footprint.ts/passability.ts use, NOT sid-name pattern matching
//   (confirmed ~18% unreliable on real data per this issue's research).
// - Probability of a full obstacle decreases with distance from the
//   stroke's center, but is NEVER driven to zero at the edge — a random,
//   weighted lean toward non-blockers, not a hard rule (there's no such
//   strict rule in the original HoMM3 tool either).
// - Each node usually pulls from its own tile's biome, but has a small
//   random chance of pulling from a different one instead — deliberate
//   cross-biome mixing for visual diversity.

import type { BiomeId } from './terrain-colors'
import type { CatalogMapObject } from '@/lib/catalog/types'

/** catalog.mapObjects' own `biome` string differs from tile-side BIOME_NAMES
 *  only at id 2 ("Desert" vs "Sand") — see CatalogMapObject.biome's doc
 *  comment in catalog/types.ts. */
const BIOME_ID_TO_CATALOG_BIOME: Record<BiomeId, string> = {
  1: 'Grass', 2: 'Desert', 3: 'Deathland', 4: 'Snow', 5: 'Autumn', 6: 'Lava', 7: 'Dirt',
}
const ALL_BIOME_IDS: BiomeId[] = [1, 2, 3, 4, 5, 6, 7]

export interface FuzzyObstaclePool {
  obstacles: string[]
  clutter: string[]
}

/** Buckets every real `environments`-category catalog entry by biome and by
 *  obstacle-vs-clutter, once per catalog (cheap to memoize by the caller). */
export function buildFuzzyObstaclePools(mapObjects: CatalogMapObject[]): Record<BiomeId, FuzzyObstaclePool> {
  const pools = Object.fromEntries(
    ALL_BIOME_IDS.map((id) => [id, { obstacles: [], clutter: [] } as FuzzyObstaclePool]),
  ) as Record<BiomeId, FuzzyObstaclePool>
  const biomeIdByCatalogName = new Map<string, BiomeId>(
    ALL_BIOME_IDS.map((id) => [BIOME_ID_TO_CATALOG_BIOME[id], id]),
  )
  for (const obj of mapObjects) {
    if (obj.category !== 'environments' || !obj.biome) continue
    const biomeId = biomeIdByCatalogName.get(obj.biome)
    if (!biomeId) continue
    if ((obj.nodes ?? []).includes(1)) pools[biomeId].obstacles.push(obj.id)
    else pools[biomeId].clutter.push(obj.id)
  }
  return pools
}

/**
 * Normalized (0 = stroke center, ~1 = stroke edge) distance for every node
 * in `nodes`, based on the set's own enclosing bounding box — applies
 * uniformly whether `nodes` came from a freehand drag or a Rectangle-mode
 * selection (issue #193 Phase 4), since both are just "a set of nodes" by
 * the time they reach here.
 */
export function computeFuzzyDistances(nodes: number[], sizeX: number): Map<number, number> {
  const distances = new Map<number, number>()
  if (nodes.length === 0) return distances
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity
  const coords = nodes.map((n) => {
    const x = n % sizeX
    const z = Math.floor(n / sizeX)
    if (x < minX) minX = x
    if (x > maxX) maxX = x
    if (z < minZ) minZ = z
    if (z > maxZ) maxZ = z
    return { n, x, z }
  })
  const centerX = (minX + maxX) / 2
  const centerZ = (minZ + maxZ) / 2
  const halfExtent = Math.max(1, (maxX - minX) / 2, (maxZ - minZ) / 2)
  for (const { n, x, z } of coords) {
    const d = Math.hypot(x - centerX, z - centerZ) / (halfExtent * Math.SQRT2)
    distances.set(n, Math.min(1, d))
  }
  return distances
}

export interface FuzzyObstacleOptions {
  /** How strongly obstacle probability drops with distance (0-1). Default
   *  0.7 — even at the furthest edge, a ~15% floor chance of a full
   *  obstacle remains (see pObstacleFloor), matching "not a hard rule." */
  edgeFalloff?: number
  /** Chance any given node pulls from a different biome than its own tile. */
  crossBiomeChance?: number
  /** Injectable for deterministic tests; defaults to Math.random. */
  rng?: () => number
}

/**
 * Samples one addition (or none) per node in `nodeDistances`. `tileBiome`
 * resolves a node's own committed biome (undefined nodes are skipped — e.g.
 * out-of-bounds or a map with no tilesMap loaded).
 */
export function sampleFuzzyObstacles(
  nodeDistances: Map<number, number>,
  tileBiome: (node: number) => BiomeId | undefined,
  pools: Record<BiomeId, FuzzyObstaclePool>,
  options: FuzzyObstacleOptions = {},
): { node: number; sid: string }[] {
  const { edgeFalloff = 0.7, crossBiomeChance = 0.1, rng = Math.random } = options
  const pObstacleFloor = 0.15
  const additions: { node: number; sid: string }[] = []

  for (const [node, distance] of nodeDistances) {
    const ownBiome = tileBiome(node)
    if (ownBiome === undefined) continue

    let biomeId = ownBiome
    if (rng() < crossBiomeChance) {
      const candidates = ALL_BIOME_IDS.filter(
        (id) => id !== ownBiome && (pools[id].obstacles.length > 0 || pools[id].clutter.length > 0),
      )
      if (candidates.length > 0) biomeId = candidates[Math.floor(rng() * candidates.length)]
    }
    const pool = pools[biomeId]

    const pObstacle = Math.max(pObstacleFloor, 1 - distance * edgeFalloff)
    if (pool.obstacles.length > 0 && rng() < pObstacle) {
      additions.push({ node, sid: pool.obstacles[Math.floor(rng() * pool.obstacles.length)] })
      continue
    }

    // Not an obstacle this pass — a distance-scaled chance of clutter
    // instead of leaving the tile untouched (the "soft taper" toward edges).
    const pClutter = 0.2 + distance * 0.3
    if (pool.clutter.length > 0 && rng() < pClutter) {
      additions.push({ node, sid: pool.clutter[Math.floor(rng() * pool.clutter.length)] })
    } else if (pool.clutter.length === 0 && pool.obstacles.length > 0) {
      // Dirt biome's real, sparse case (2 clutter entries in real catalog
      // data) — documented fallback, not a silent degrade: a thin/absent
      // clutter pool still gets an obstacle-only edge at a lower rate
      // rather than nothing at all.
      if (rng() < pObstacle * 0.5) {
        additions.push({ node, sid: pool.obstacles[Math.floor(rng() * pool.obstacles.length)] })
      }
    }
    // else: nothing placed at this node this pass — a real, expected outcome
    // for a fuzzy edge, not a bug.
  }
  return additions
}
