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
// - issue #195 follow-up: restricted to actual nature decorations only (see
//   isNatureDecoration below) — no interactables (already excluded, a
//   different catalog category) and no construction/building-like
//   `environments` entries either (a real, if smaller, category within
//   `environments` itself — bridges, fences, ruins, gallows/coffins, and
//   every campaign_*-prefixed scripted prop, confirmed by reading every one
//   of the catalog's 296 real environments entries; there's no structural
//   field to key off, only the sid itself, so this is a curated denylist
//   like PLAYER_START_SPAWNER_DEFAULTS/RANDOM_SPAWNER_TABLE_DEFAULTS
//   elsewhere in this codebase, not a name-pattern heuristic).
// - issue #195 follow-up: pool_* entries (real, water-filled decorative
//   pools, distinct from the Water tool's own tile-level water) are pulled
//   into their own bucket and only offered when the stroke's own bounding
//   box is at least 4x4 tiles — a small brush scattering a big pool reads
//   as a mistake, not a feature.

import type { BiomeId } from './terrain-colors'
import type { CatalogMapObject } from '@/lib/catalog/types'

/** catalog.mapObjects' own `biome` string differs from tile-side BIOME_NAMES
 *  only at id 2 ("Desert" vs "Sand") — see CatalogMapObject.biome's doc
 *  comment in catalog/types.ts. */
const BIOME_ID_TO_CATALOG_BIOME: Record<BiomeId, string> = {
  1: 'Grass', 2: 'Desert', 3: 'Deathland', 4: 'Snow', 5: 'Autumn', 6: 'Lava', 7: 'Dirt',
}
const ALL_BIOME_IDS: BiomeId[] = [1, 2, 3, 4, 5, 6, 7]

/** Every non-campaign `environments` entry that reads as man-made rather
 *  than natural, confirmed by reading the full real catalog list (Core/DB/
 *  map/objects/1_environments.json) — bridges, a fence, a gallows,
 *  coffins, and building ruins. Every `campaign_*`-prefixed entry (22 in
 *  the real catalog — altars, corpses, scripted props, an invisible
 *  "FX_block") is excluded separately below by prefix, not listed here. */
const NON_NATURE_ENVIRONMENT_IDS = new Set([
  'field_fence', 'bridge_wood', 'bridge_stone', 'gallows_dead',
  'coffins_1', 'coffins_2', 'coffins_3', 'coffins_4',
  'ruins_desert_1', 'ruins_desert_2', 'ruins_desert_3',
])

function isNatureDecoration(id: string): boolean {
  return !id.startsWith('campaign_') && !NON_NATURE_ENVIRONMENT_IDS.has(id)
}

export interface FuzzyObstaclePool {
  obstacles: string[]
  clutter: string[]
  /** pool_* entries — a real decorative water pool, only sampled when the
   *  stroke is large enough (see FuzzyObstacleOptions.poolsAllowed). */
  pools: string[]
}

/** Buckets every real, nature `environments` catalog entry by biome and by
 *  obstacle/clutter/pool, once per catalog (cheap to memoize by the caller). */
export function buildFuzzyObstaclePools(mapObjects: CatalogMapObject[]): Record<BiomeId, FuzzyObstaclePool> {
  const pools = Object.fromEntries(
    ALL_BIOME_IDS.map((id) => [id, { obstacles: [], clutter: [], pools: [] } as FuzzyObstaclePool]),
  ) as Record<BiomeId, FuzzyObstaclePool>
  const biomeIdByCatalogName = new Map<string, BiomeId>(
    ALL_BIOME_IDS.map((id) => [BIOME_ID_TO_CATALOG_BIOME[id], id]),
  )
  for (const obj of mapObjects) {
    if (obj.category !== 'environments' || !obj.biome) continue
    if (!isNatureDecoration(obj.id)) continue
    const biomeId = biomeIdByCatalogName.get(obj.biome)
    if (!biomeId) continue
    if (obj.id.startsWith('pool_')) pools[biomeId].pools.push(obj.id)
    else if ((obj.nodes ?? []).includes(1)) pools[biomeId].obstacles.push(obj.id)
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

/** The stroke's own enclosing bounding box in tiles — used to gate pool_*
 *  eligibility (see FuzzyObstacleOptions.poolsAllowed). Same node set
 *  computeFuzzyDistances derives its center/extent from, kept as a
 *  separate small helper rather than folded into that function's return
 *  shape so callers that don't care about pool gating are unaffected. */
export function computeStrokeBoundingSize(nodes: number[], sizeX: number): { width: number; height: number } {
  if (nodes.length === 0) return { width: 0, height: 0 }
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity
  for (const n of nodes) {
    const x = n % sizeX
    const z = Math.floor(n / sizeX)
    if (x < minX) minX = x
    if (x > maxX) maxX = x
    if (z < minZ) minZ = z
    if (z > maxZ) maxZ = z
  }
  return { width: maxX - minX + 1, height: maxZ - minZ + 1 }
}

export interface FuzzyObstacleOptions {
  /** How strongly obstacle probability drops with distance (0-1). Default
   *  0.7 — even at the furthest edge, a ~15% floor chance of a full
   *  obstacle remains (see pObstacleFloor), matching "not a hard rule." */
  edgeFalloff?: number
  /** Chance any given node pulls from a different biome than its own tile. */
  crossBiomeChance?: number
  /** Whether pool_* entries are eligible this stroke — the caller decides
   *  based on the stroke's own bounding box (issue #195 follow-up:
   *  user-requested — pools only look right at 4x4 tiles or larger).
   *  Defaults to false (the conservative choice: a caller that doesn't
   *  measure its stroke gets no pools rather than always getting them). */
  poolsAllowed?: boolean
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
  const { edgeFalloff = 0.7, crossBiomeChance = 0.1, poolsAllowed = false, rng = Math.random } = options
  const pObstacleFloor = 0.15
  const additions: { node: number; sid: string }[] = []
  // Obstacles + pools (when allowed) merge into one weighted pick list per
  // biome, computed once rather than per node — pools stay a small share of
  // the combined list even when eligible (real catalog data: 1-3 pool_*
  // entries per biome against a much larger obstacle pool), so this doesn't
  // need its own separate probability, just inclusion.
  const obstacleCandidatesByBiome = new Map<BiomeId, string[]>(
    ALL_BIOME_IDS.map((id) => [id, poolsAllowed ? [...pools[id].obstacles, ...pools[id].pools] : pools[id].obstacles]),
  )

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
    const obstacleCandidates = obstacleCandidatesByBiome.get(biomeId) ?? []

    const pObstacle = Math.max(pObstacleFloor, 1 - distance * edgeFalloff)
    if (obstacleCandidates.length > 0 && rng() < pObstacle) {
      additions.push({ node, sid: obstacleCandidates[Math.floor(rng() * obstacleCandidates.length)] })
      continue
    }

    // Not an obstacle this pass — a distance-scaled chance of clutter
    // instead of leaving the tile untouched (the "soft taper" toward edges).
    const pClutter = 0.2 + distance * 0.3
    if (pool.clutter.length > 0 && rng() < pClutter) {
      additions.push({ node, sid: pool.clutter[Math.floor(rng() * pool.clutter.length)] })
    } else if (pool.clutter.length === 0 && obstacleCandidates.length > 0) {
      // Dirt biome's real, sparse case (2 clutter entries in real catalog
      // data) — documented fallback, not a silent degrade: a thin/absent
      // clutter pool still gets an obstacle-only edge at a lower rate
      // rather than nothing at all.
      if (rng() < pObstacle * 0.5) {
        additions.push({ node, sid: obstacleCandidates[Math.floor(rng() * obstacleCandidates.length)] })
      }
    }
    // else: nothing placed at this node this pass — a real, expected outcome
    // for a fuzzy edge, not a bug.
  }
  return additions
}
