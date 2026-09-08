// ─── RMG zone decoration — obstacle scattering (issue #210, Milestone 2) ───
// Fills each zone's own remaining free tiles with biome-appropriate scenery
// (rocks/mountains/clutter), reusing this codebase's existing Obstacles-
// brush sampler (fuzzy-obstacle.ts) rather than inventing a second scatter
// algorithm — but composed with real footprint/collision checking
// (zone-population.ts's `tryPlaceAt`), which none of this codebase's
// existing scatter tools do today (issue #210's own gap #4). Runs AFTER
// real object placement and road painting, sharing the same `PlacementState`
// so scenery only ever fills in what's left — never on top of a dwelling/
// mine/guard, and never on a road tile either.
//
// A real gap reported after studying this session's own real-map decoration
// survey (Stormlight.map/Fun_and_Graves.map/Glittering_Strait.map): real
// scenery comes in clumps (nearest-neighbor distance between decoration
// items is 0-1 tile at the 25th/50th percentile — same-family pairs like
// tree_dirt+tree_dirt/pinetree+pinetree dominate, plus real cross-family
// clumps like mountain_green_big+pinetree or grass_desert+palms), never
// the fully-independent single-tile rolls this file used to produce. A
// small slice of each zone's own already-calibrated obstacle budget is now
// spent on `CLUSTER_SEED_SPACING`-derived clumps (see `scatterCluster`)
// before the rest still goes through the original independent per-tile
// path unchanged — clusters are carved OUT of the existing budget, never
// added on top, so total coverage stays in the same ~15-22% range this
// session's prior real-map calibration already established.

import type { CatalogMapObject } from '@/lib/catalog/types'
import type { BiomeId } from '@/lib/map-grid/terrain-colors'
import { buildFuzzyObstaclePools, sampleFuzzyObstacles, type FuzzyObstaclePool } from '@/lib/map-grid/fuzzy-obstacle'
import { randomInRange } from '@/lib/map-grid/squad-pool'
import { tryPlaceAt, type PlacementState, type ZonePlacement } from './zone-population'
import type { ZoneSpec } from './zone-graph'
import type { ZoneCenter } from './zone-layout'

/** One cluster seed per this many candidate tiles — tuned so a typical
 *  zone (a few hundred candidate tiles) gets a handful of clumps, not
 *  dozens; empirically checked against a real regeneration pass (see this
 *  file's own verification notes) to keep total coverage within the
 *  already-calibrated ~15-22% range rather than inflating it. */
const CLUSTER_SEED_SPACING = 70
const CLUSTER_MIN_SIZE = 3
const CLUSTER_MAX_SIZE = 10
/** Tight enough that a cluster reads as one clump on screen — deliberately
 *  smaller than zone-guard-scatter.ts's own `NEARBY_GUARD_RADIUS` (4),
 *  which is placing a single object near another, not building a clump. */
const CLUSTER_RADIUS = 3
/** Of a mountain-capable zone's own clusters, the fraction that lean
 *  mountain-heavy rather than obstacle-heavy — real maps show both
 *  flavors, often right next to each other (a mountain range with a tree
 *  stand at its base, or vice versa). Zero real mountain entries for a
 *  biome (mirrors `sampleFuzzyObstacles`' own `mountainChance` doc comment)
 *  makes every cluster obstacle-heavy regardless of this weight. */
export const CLUSTER_MOUNTAIN_HEAVY_CHANCE = 0.4
/** Within one cluster, the split between its own dominant pool, an accent
 *  drawn from the OTHER family (the real "mountain_green_big + pinetree" /
 *  "grass_desert + palms" cross-family pattern), and plain clutter. */
export const CLUSTER_PRIMARY_CHANCE = 0.7
const CLUSTER_ACCENT_CHANCE = 0.2

function shuffledClusterOffsets(radius: number, rng: () => number): [number, number][] {
  const offsets: [number, number][] = []
  for (let dz = -radius; dz <= radius; dz++) {
    for (let dx = -radius; dx <= radius; dx++) {
      if (dx === 0 && dz === 0) continue
      offsets.push([dx, dz])
    }
  }
  for (let i = offsets.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[offsets[i], offsets[j]] = [offsets[j], offsets[i]]
  }
  return offsets
}

/** Places one small biome-appropriate clump around `seedNode` — a
 *  mountain-heavy or obstacle-heavy archetype (see `CLUSTER_MOUNTAIN_HEAVY_
 *  CHANCE`), each member drawn mostly from that archetype's own pool, with
 *  an occasional cross-family accent and a little plain clutter (the real
 *  proportions this session's own real-map survey found). Every candidate
 *  tile goes through the same `tryPlaceAt` collision check every other
 *  placement in this generator uses, so a cluster member can never land on
 *  a mine/guard/road/another cluster. */
/** Picks a cluster target size from a real template's own `zoneLayouts[].
 *  ambientPickupDistribution.groupSizeWeights` (issue #210, Stage 3c) —
 *  weighted-index pick, then that index is spread linearly across this
 *  file's own `CLUSTER_MIN_SIZE..CLUSTER_MAX_SIZE` range (index 0 → near
 *  the small end, the last index → near the large end) — a real
 *  interpretation of "groups skew small" data (a typical real value like
 *  `[4,1,1]` weights the small end 4x over the large one) onto this
 *  generator's own existing cluster-size range, not a literal unit match
 *  (the real format's own "group size" isn't confirmed to mean the same
 *  thing as this generator's own member count). */
function weightedGroupSize(weights: number[], rng: () => number): number {
  const total = weights.reduce((sum, w) => sum + w, 0)
  if (total <= 0) return CLUSTER_MIN_SIZE
  let roll = rng() * total
  let index = 0
  for (; index < weights.length; index++) {
    if (roll < weights[index]) break
    roll -= weights[index]
  }
  const t = weights.length > 1 ? index / (weights.length - 1) : 0
  return Math.round(CLUSTER_MIN_SIZE + (CLUSTER_MAX_SIZE - CLUSTER_MIN_SIZE) * t)
}

function scatterCluster(
  seedNode: number, sizeX: number, sizeZ: number, pool: FuzzyObstaclePool,
  catalogById: Map<string, CatalogMapObject>, state: PlacementState, rng: () => number,
  groupSizeWeights?: number[],
): ZonePlacement[] {
  const mountainHeavy = pool.mountains.length > 0 && rng() < CLUSTER_MOUNTAIN_HEAVY_CHANCE
  const primaryPool = mountainHeavy ? pool.mountains : pool.obstacles
  const accentPool = mountainHeavy ? pool.obstacles : pool.mountains
  if (primaryPool.length === 0) return []

  const pickSid = (): string | null => {
    const roll = rng()
    if (roll < CLUSTER_PRIMARY_CHANCE || accentPool.length === 0) {
      return primaryPool[Math.floor(rng() * primaryPool.length)]
    }
    if (roll < CLUSTER_PRIMARY_CHANCE + CLUSTER_ACCENT_CHANCE) {
      return accentPool[Math.floor(rng() * accentPool.length)]
    }
    if (pool.clutter.length > 0) return pool.clutter[Math.floor(rng() * pool.clutter.length)]
    return primaryPool[Math.floor(rng() * primaryPool.length)]
  }

  const targetSize = groupSizeWeights && groupSizeWeights.length > 0
    ? weightedGroupSize(groupSizeWeights, rng)
    : Math.round(randomInRange(CLUSTER_MIN_SIZE, CLUSTER_MAX_SIZE, rng))
  const placements: ZonePlacement[] = []
  const cx = seedNode % sizeX
  const cz = Math.floor(seedNode / sizeX)
  const offsets = shuffledClusterOffsets(CLUSTER_RADIUS, rng)
  let placed = 0
  for (const [dx, dz] of offsets) {
    if (placed >= targetSize) break
    const x = cx + dx
    const z = cz + dz
    if (x < 0 || x >= sizeX || z < 0 || z >= sizeZ) continue
    const node = z * sizeX + x
    const sid = pickSid()
    if (!sid) continue
    if (!tryPlaceAt(sid, node, sizeX, sizeZ, catalogById, state)) continue
    placements.push({ tempId: state.nextTempId++, sid, node })
    placed++
  }
  return placements
}

export interface ScatterObstaclesOptions {
  sizeX: number
  sizeZ: number
  zones: ZoneSpec[]
  centers: ZoneCenter[]
  tilesByZone: Map<number, number[]>
  zoneBiome: Map<number, BiomeId>
  catalogById: Map<string, CatalogMapObject>
  mapObjects: CatalogMapObject[]
  /** Road and river tiles painted by generate-random-map.ts's zone-
   *  connections.ts step, excluded from candidacy so scenery never covers
   *  either. */
  excludedNodes: Set<number>
  state: PlacementState
  rng: () => number
  /** Fraction of each zone's own tiles considered as a candidate obstacle
   *  site before fuzzy-obstacle.ts's own distance/biome rolls even run —
   *  its sampler was built for a UI brush stroke (a few dozen to a few
   *  hundred tiles), not a whole zone (up to thousands), so subsampling
   *  first keeps density sane at zone scale. */
  density?: number
  /** Per-zone override of the effective density (issue #210, Stage 3a — a
   *  real game template's own `zoneLayouts[].obstaclesFill`, imported
   *  per-zone via rmg-template-import.ts). A zone with no entry here still
   *  uses the flat `density`-derived default above. */
  densityByZone?: Map<number, number>
  /** Per-zone cluster tuning (Stage 3c — a template's own
   *  `zoneLayouts[].ambientPickupDistribution`, applied here as: (1)
   *  `groupSizeWeights` picks each cluster's own target size instead of a
   *  uniform random pick (see `weightedGroupSize`'s own doc comment for
   *  why this is a real, disclosed interpretation rather than a literal
   *  unit match), and (2) `obstacleAttraction`/`repulsion` scale this
   *  zone's own cluster-seed spacing — higher attraction (obstacles want
   *  to be near other obstacles) means MORE, tighter-spaced clusters;
   *  higher repulsion means fewer/more spread out. `roadAttraction`/
   *  `noise` are real fields this milestone doesn't use yet (would need a
   *  real per-tile distance-to-road field, a larger change deferred for
   *  now — not silently ignored, just not attempted). */
  ambientPickupByZone?: Map<number, { groupSizeWeights?: number[]; obstacleAttraction?: number; repulsion?: number }>
}

/** Every candidate node's distance from its own zone's center, normalized
 *  by that zone's effective radius (`sqrt(tileCount / π)`, the radius of a
 *  circle with the same area) — the zone-scale equivalent of
 *  fuzzy-obstacle.ts's own `computeFuzzyDistances`, which is defined over a
 *  UI stroke's bounding box and doesn't fit a Voronoi zone's irregular
 *  shape as well as a real center+radius does. */
function zoneNodeDistances(candidateTiles: number[], sizeX: number, center: ZoneCenter, zoneTileCount: number): Map<number, number> {
  const effectiveRadius = Math.max(1, Math.sqrt(zoneTileCount / Math.PI))
  const distances = new Map<number, number>()
  for (const node of candidateTiles) {
    const x = node % sizeX
    const z = Math.floor(node / sizeX)
    const d = Math.hypot(x - center.x, z - center.z) / effectiveRadius
    distances.set(node, Math.min(1, d))
  }
  return distances
}

export function scatterZoneObstacles(options: ScatterObstaclesOptions): ZonePlacement[] {
  const { sizeX, sizeZ, zones, centers, tilesByZone, zoneBiome, catalogById, mapObjects, excludedNodes, state, rng, density = 0.35, densityByZone, ambientPickupByZone } = options
  const pools = buildFuzzyObstaclePools(mapObjects)
  const placements: ZonePlacement[] = []

  for (const zone of zones) {
    const tiles = tilesByZone.get(zone.id) ?? []
    if (tiles.length === 0) continue
    const biome = zoneBiome.get(zone.id)
    if (biome === undefined) continue
    const center = centers[zone.id]

    // Real Olden Era RMG templates vary obstaclesFill by zone role (spawn
    // zones lower than treasure/center zones) via named zoneLayouts, not one
    // flat global value — `scatterZoneWater` already skips player zones
    // entirely for the same reason (buildability); this is the obstacle-
    // density equivalent, softer than a full skip since some scenery still
    // reads as a lived-in start.
    const zoneDensity = densityByZone?.get(zone.id) ?? (zone.kind === 'player' ? density * 0.6 : density)
    const freeTiles = tiles.filter((node) => !excludedNodes.has(node))
    if (freeTiles.length === 0) continue
    let candidateTiles = freeTiles.filter(() => rng() < zoneDensity)
    // Guaranteed floor — a real user report: islands mode (especially with
    // player-start islands enabled) can leave a zone's own free-tile pool
    // small enough — a thin Penrose slice further shrunk by an island's
    // own interior-only growth (zone-islands.ts's computeIslandZones), on
    // top of a player zone's own city/mine/guard footprints already eating
    // much of what's left — that the purely probabilistic roll above has a
    // real chance of rejecting every tile, leaving that zone with literally
    // zero decoration. Falls back to the FULL free-tile pool (not just a
    // small fixed count) so downstream's existing tryPlaceAt collision
    // check gets a real chance to find whatever room is actually left,
    // rather than risking a small fixed sample landing entirely on
    // already-blocked tiles (a city-spawner/mine footprint) and still
    // placing nothing.
    if (candidateTiles.length === 0) candidateTiles = [...freeTiles]

    // A small slice of this zone's own already-density-rolled candidates
    // seeds clusters (this file's own header comment has the real-map
    // rationale) — spliced OUT of the same list before the rest goes
    // through the original independent per-tile path below, so clusters
    // never inflate total coverage past today's calibrated budget.
    const ambientPickup = ambientPickupByZone?.get(zone.id)
    // obstacleAttraction > repulsion → more, tighter-packed clusters (spacing
    // shrinks); repulsion > obstacleAttraction → fewer, more spread out
    // (spacing grows). 1 (no override) reproduces today's flat spacing.
    const spacingScale = ambientPickup
      ? Math.max(0.25, Math.min(4, 1 + ((ambientPickup.repulsion ?? 0) - (ambientPickup.obstacleAttraction ?? 0))))
      : 1
    const clusterSeedCount = Math.floor(candidateTiles.length / (CLUSTER_SEED_SPACING * spacingScale))
    const pool = pools[biome]
    for (let i = 0; i < clusterSeedCount; i++) {
      const seedIndex = Math.floor(rng() * candidateTiles.length)
      const [seedNode] = candidateTiles.splice(seedIndex, 1)
      placements.push(...scatterCluster(seedNode, sizeX, sizeZ, pool, catalogById, state, rng, ambientPickup?.groupSizeWeights))
    }
    if (candidateTiles.length === 0) continue

    const nodeDistances = zoneNodeDistances(candidateTiles, sizeX, center, tiles.length)
    const candidates = sampleFuzzyObstacles(nodeDistances, () => biome, pools, { mountainChance: 0.05, rng })
    for (const { node, sid } of candidates) {
      if (!tryPlaceAt(sid, node, sizeX, sizeZ, catalogById, state)) continue
      placements.push({ tempId: state.nextTempId++, sid, node })
    }
  }

  return placements
}
