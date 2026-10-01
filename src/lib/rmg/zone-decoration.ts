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
//
// Three more real-data-calibrated features, all opt-in via a 0-1 strength
// (0 = today's exact behavior): distance-to-road density decay
// (`roadDecayStrength` — issue #224, real maps show decoration thins near
// roads, thickens away from them), object-category co-occurrence
// (`coOccurrenceStrength` — issue #224, real maps show some category pairs
// cluster more, or less, than chance alone would predict), and elevation/
// climb-proximity density decay (`elevationDecayStrength` — issue #230,
// real maps show valleys get denser decoration and ramp-adjacent tiles get
// sparser). See decoration-calibration.ts for the real evidence all three
// are built from.

import type { CatalogEnvironmentBiome, CatalogMapObject } from '@/lib/catalog/types'
import type { BiomeId } from '@/lib/map-grid/terrain-colors'
import { buildFuzzyObstaclePools, buildFuzzyObstacleWeights, pickWeighted, sampleFuzzyObstacles, type FuzzyObstaclePool } from '@/lib/map-grid/fuzzy-obstacle'
import { randomInRange } from '@/lib/map-grid/squad-pool'
import { tryPlaceAt, isRotationallySymmetricFootprint, type PlacementState, type ZonePlacement } from './zone-population'
import { randomDecorRotation } from '@/lib/h3-import/scenery-clusters'
import type { ZoneSpec } from './zone-graph'
import type { ZoneCenter } from './zone-layout'
import {
  type DecorationCategory, roadDistanceDensityMultiplier, coOccurrenceBias, scaleMultiplier,
  elevationTierDensityMultiplier, climbProximityDensityMultiplier,
} from './decoration-calibration'

/** Base chance of an independent-phase (non-cluster) placement being
 *  specifically a pool WHEN a pool (or another category real evidence
 *  biases toward pools) is already nearby — the independent phase never
 *  placed pools at all before co-occurrence calibration (issue #224);
 *  `poolChance` was simply omitted, defaulting to 0. Only ever reached via
 *  `biasedChance`'s `whenNoEvidence: 0` gate (see its own doc comment) — a
 *  tile with nothing nearby yet stays at exactly 0, matching prior behavior.
 *  An earlier version of this feature applied this base UNCONDITIONALLY
 *  once `coOccurrenceStrength > 0` (no gate) and was verified to actively
 *  HURT the real signal: total pools placed roughly doubled, but the
 *  pools-near-pools rate went DOWN, because most of the new pools landed
 *  with no real nearby evidence at all — pure dilution, not clustering. */
const INDEPENDENT_PHASE_POOL_BASE_CHANCE = 0.03
/** Same reasoning as `INDEPENDENT_PHASE_POOL_BASE_CHANCE`, for the existing
 *  independent-phase `mountainChance` — see the call site: this one already
 *  has a real nonzero baseline (0.05) regardless of co-occurrence, so it's
 *  passed straight to `biasedChance` rather than gated. */
const INDEPENDENT_PHASE_MOUNTAIN_BASE_CHANCE = 0.05

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value))
}

/** Every distinct decoration category already placed within `radius` tiles
 *  of `node` (issue #224 co-occurrence calibration) — deduplicated, so one
 *  large existing cluster never outweighs a single other-category neighbor
 *  in `coOccurrenceBias`'s own averaging. */
function nearbyCategories(node: number, sizeX: number, sizeZ: number, placedCategoryByNode: Map<number, DecorationCategory>, radius: number): DecorationCategory[] {
  const x = node % sizeX
  const z = Math.floor(node / sizeX)
  const found = new Set<DecorationCategory>()
  for (let dz = -radius; dz <= radius; dz++) {
    for (let dx = -radius; dx <= radius; dx++) {
      if (dx === 0 && dz === 0) continue
      const nx = x + dx
      const nz = z + dz
      if (nx < 0 || nx >= sizeX || nz < 0 || nz >= sizeZ) continue
      const cat = placedCategoryByNode.get(nz * sizeX + nx)
      if (cat) found.add(cat)
    }
  }
  return [...found]
}

/** Applies real co-occurrence evidence to a base chance for placing `target`
 *  near whatever's already at `node`'s neighborhood. Returns `whenNoEvidence`
 *  whenever `strength` is 0, nothing is nearby yet, OR (only when
 *  `whenNoEvidence` is 0 — see below) nothing nearby is a real ATTRACTIVE
 *  signal (bias > 1) for `target`.
 *
 *  For a chance that already existed unconditionally before this feature
 *  (mountainChance), pass `whenNoEvidence === baseChance` — a real
 *  repulsive signal (bias < 1) legitimately suppresses an already-real
 *  chance, so both directions apply.
 *
 *  For a chance this feature INTRODUCES from a zero baseline (independent-
 *  phase poolChance, previously always 0), pass `whenNoEvidence: 0` AND rely
 *  on the bias > 1 gate below — verified empirically necessary, not just a
 *  nicety: an earlier version unlocked this chance whenever ANYTHING was
 *  nearby (attractive or repulsive alike), and since pools are real-rare
 *  (most nearby evidence is some OTHER category, whose bias toward pools is
 *  repulsive/neutral, not attractive), that version roughly doubled total
 *  pool placements while the pools-near-pools rate went DOWN — diluting the
 *  very signal it was meant to encode, since a chance that can only ever go
 *  UP from zero has no meaningful way to express "and here it should stay
 *  zero" once merely unlocked by proximity to anything at all. */
function biasedChance(baseChance: number, whenNoEvidence: number, node: number, sizeX: number, sizeZ: number, placedCategoryByNode: Map<number, DecorationCategory>, target: DecorationCategory, strength: number, radius: number): number {
  if (strength <= 0) return whenNoEvidence
  const nearby = nearbyCategories(node, sizeX, sizeZ, placedCategoryByNode, radius)
  if (nearby.length === 0) return whenNoEvidence
  const bias = coOccurrenceBias(nearby, target)
  if (whenNoEvidence === 0 && bias <= 1) return 0
  return clamp01(baseChance * scaleMultiplier(bias, strength))
}

/** Classifies a real, already-resolved sid into its decoration category —
 *  the same buckets `buildFuzzyObstaclePools` sorts the catalog into,
 *  reversed for a single sid within one zone's own biome pool. */
function categoryOf(sid: string, pool: FuzzyObstaclePool): DecorationCategory {
  if (pool.mountains.includes(sid)) return 'mountains'
  if (pool.pools.includes(sid)) return 'pools'
  if (pool.obstacles.includes(sid)) return 'obstacles'
  return 'clutter'
}

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
/** Chance of placing a pool as obstacle **/
const CLUSTER_POOL_CHANCE = 0.15

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

/** Same "randomize decorative rotation, never for an asymmetric footprint"
 *  rule the H3 importer applies (scenery-clusters.ts) — real environment
 *  scenery is marked `randomRotation: true` in the catalog, so leaving every
 *  RMG-placed decoration at a fixed rotation 0 is an avoidable visual tell. */
function pickRotation(sid: string, catalogById: Map<string, CatalogMapObject>, rng: () => number): number | undefined {
  return isRotationallySymmetricFootprint(sid, catalogById) ? randomDecorRotation(rng) : undefined
}

function scatterCluster(
  seedNode: number, sizeX: number, sizeZ: number, pool: FuzzyObstaclePool,
  catalogById: Map<string, CatalogMapObject>, state: PlacementState, rng: () => number,
  groupSizeWeights?: number[],
  coOccurrenceStrength = 0,
  placedCategoryByNode?: Map<number, DecorationCategory>,
  sidWeights?: Record<string, number>,
): ZonePlacement[] {
  // Both archetype-choice rolls (mountain-heavy vs obstacle-heavy, and the
  // pool sub-chance) are biased ONCE per cluster from whatever's already
  // placed near the seed — a cluster is a single archetype throughout, so
  // per-member re-biasing would just repeat the same seed-neighborhood
  // context every time for no real gain.
  const seedNearby = coOccurrenceStrength > 0 && placedCategoryByNode ? nearbyCategories(seedNode, sizeX, sizeZ, placedCategoryByNode, CLUSTER_RADIUS) : []
  const mountainHeavyChance = seedNearby.length > 0
    ? clamp01(CLUSTER_MOUNTAIN_HEAVY_CHANCE * scaleMultiplier(coOccurrenceBias(seedNearby, 'mountains'), coOccurrenceStrength))
    : CLUSTER_MOUNTAIN_HEAVY_CHANCE
  const poolChance = seedNearby.length > 0
    ? clamp01(CLUSTER_POOL_CHANCE * scaleMultiplier(coOccurrenceBias(seedNearby, 'pools'), coOccurrenceStrength))
    : CLUSTER_POOL_CHANCE

  const mountainHeavy = pool.mountains.length > 0 && rng() < mountainHeavyChance
  const primaryPool = mountainHeavy ? pool.mountains : pool.obstacles
  const accentPool = mountainHeavy ? pool.obstacles : pool.mountains
  if (primaryPool.length === 0) return []

  const pickSid = (): { sid: string; category: DecorationCategory } | null => {
    if (pool.pools.length > 0 && rng() < poolChance) {
      return { sid: pickWeighted(pool.pools, rng, sidWeights), category: 'pools' }
    }
    const roll = rng()
    const primaryCategory: DecorationCategory = mountainHeavy ? 'mountains' : 'obstacles'
    const accentCategory: DecorationCategory = mountainHeavy ? 'obstacles' : 'mountains'
    if (roll < CLUSTER_PRIMARY_CHANCE || accentPool.length === 0) {
      return { sid: pickWeighted(primaryPool, rng, sidWeights), category: primaryCategory }
    }
    if (roll < CLUSTER_PRIMARY_CHANCE + CLUSTER_ACCENT_CHANCE) {
      return { sid: pickWeighted(accentPool, rng, sidWeights), category: accentCategory }
    }
    if (pool.clutter.length > 0) return { sid: pickWeighted(pool.clutter, rng, sidWeights), category: 'clutter' }
    return { sid: pickWeighted(primaryPool, rng, sidWeights), category: primaryCategory }
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
    const picked = pickSid()
    if (!picked) continue
    if (!tryPlaceAt(picked.sid, node, sizeX, sizeZ, catalogById, state)) continue
    placements.push({ tempId: state.nextTempId++, sid: picked.sid, node, rotation: pickRotation(picked.sid, catalogById, rng) })
    placedCategoryByNode?.set(node, picked.category)
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
  /** Real per-tile distance-to-nearest-road-tile (issue #224 — the
   *  `roadAttraction`/`noise` gap this file used to flag as deferred above),
   *  same shape `computeRoadDistanceField` (zone-connections.ts) already
   *  produces from `generate-random-map.ts`'s own `roadNodes`. Combined with
   *  `roadDecayStrength` below — omitted or `roadDecayStrength <= 0` means
   *  byte-for-byte the same density roll as before this feature existed. */
  roadDistanceField?: Int32Array
  /** 0 (default) = no road-distance effect at all (today's exact behavior);
   *  1 = the full real calibrated density-vs-road-distance curve
   *  (decoration-calibration.ts); values in between blend toward it. */
  roadDecayStrength?: number
  /** 0 (default) = no co-occurrence effect at all (today's exact behavior);
   *  1 = the full real calibrated category co-occurrence table
   *  (decoration-calibration.ts); values in between blend toward it. */
  coOccurrenceStrength?: number
  /** Per-tile elevation tier (-1/0/1), same shape generate-terrain.ts
   *  already produces — needed for `elevationDecayStrength` below. */
  levelsMap?: number[]
  /** Per-tile climb/ramp marker (0 = none), same shape generate-terrain.ts
   *  already produces — needed for `elevationDecayStrength` below. */
  climbsMap?: number[]
  /** 0 (default) = no elevation/climb-proximity effect at all (today's
   *  exact behavior); 1 = the full real calibrated verticality curve
   *  (decoration-calibration.ts, issue #230 — valleys get denser
   *  decoration, climb/ramp-adjacent tiles get sparser); values in between
   *  blend toward it. No effect if `levelsMap` is omitted. */
  elevationDecayStrength?: number
  /** Real per-biome decoration/obstacle data (`generator_environment_assets
   *  .json`, `GameCatalog.rmgEnvironmentAssets` — issue #240 Phase 3) —
   *  flattened once into a real sid-weight map (`buildFuzzyObstacleWeights`)
   *  and used to bias every pick this function makes (both the independent
   *  per-tile phase and cluster members) toward the real relative
   *  frequency each sid actually has in the real game's own per-biome
   *  tileset mix, instead of a uniform pick within its bucket. Omitted
   *  falls back to today's exact uniform behavior (e.g. the static
   *  fallback catalog, or an older Core.zip with no `Core/generator/`
   *  files). */
  rmgEnvironmentAssets?: CatalogEnvironmentBiome[]
}

/** Whether any of `node`'s own tile or its 4/8-neighbors within `radius` is
 *  a climb/ramp tile — issue #230's real "decoration avoids ramps" finding
 *  was measured at radius 1, so this defaults to matching that exactly. */
function isNearClimb(node: number, sizeX: number, sizeZ: number, climbsMap: number[], radius = 1): boolean {
  const x = node % sizeX
  const z = Math.floor(node / sizeX)
  for (let dz = -radius; dz <= radius; dz++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const nx = x + dx
      const nz = z + dz
      if (nx < 0 || nx >= sizeX || nz < 0 || nz >= sizeZ) continue
      if ((climbsMap[nz * sizeX + nx] ?? 0) > 0) return true
    }
  }
  return false
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
  const {
    sizeX, sizeZ, zones, centers, tilesByZone, zoneBiome, catalogById, mapObjects, excludedNodes, state, rng,
    density = 0.35, densityByZone, ambientPickupByZone, roadDistanceField, roadDecayStrength = 0, coOccurrenceStrength = 0,
    levelsMap, climbsMap, elevationDecayStrength = 0, rmgEnvironmentAssets,
  } = options
  const pools = buildFuzzyObstaclePools(mapObjects)
  const environmentWeights = rmgEnvironmentAssets ? buildFuzzyObstacleWeights(rmgEnvironmentAssets) : undefined
  const placements: ZonePlacement[] = []
  // Shared across every zone (in generation order) — co-occurrence bias
  // looks at whatever's already been placed nearby, regardless of which
  // zone it came from, matching how a real cross-zone treeline/pond doesn't
  // stop respecting a Voronoi boundary.
  const placedCategoryByNode = new Map<number, DecorationCategory>()

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
    // Real distance-to-road density decay (issue #224) and elevation/climb-
    // proximity density decay (issue #230) — both applied as per-tile
    // multipliers on the SAME density roll every tile already went through,
    // so it's still exactly one rng() call per tile regardless of how many
    // of these are active (preserves the existing generator's seeded-RNG-
    // call-count contract). Every multiplier defaults to 1 (no effect) when
    // its own strength is 0 or its input data is omitted, so this is
    // byte-for-byte identical to the original flat roll unless a caller
    // opts in.
    let candidateTiles = freeTiles.filter((node) => {
      let multiplier = 1
      if (roadDistanceField && roadDecayStrength > 0) {
        multiplier *= scaleMultiplier(roadDistanceDensityMultiplier(roadDistanceField[node] ?? Infinity), roadDecayStrength)
      }
      if (levelsMap && elevationDecayStrength > 0) {
        multiplier *= scaleMultiplier(elevationTierDensityMultiplier(levelsMap[node] ?? 0), elevationDecayStrength)
        if (climbsMap) multiplier *= scaleMultiplier(climbProximityDensityMultiplier(isNearClimb(node, sizeX, sizeZ, climbsMap)), elevationDecayStrength)
      }
      return rng() < zoneDensity * multiplier
    })
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
      placements.push(...scatterCluster(seedNode, sizeX, sizeZ, pool, catalogById, state, rng, ambientPickup?.groupSizeWeights, coOccurrenceStrength, placedCategoryByNode, environmentWeights?.[biome]))
    }
    if (candidateTiles.length === 0) continue

    const nodeDistances = zoneNodeDistances(candidateTiles, sizeX, center, tiles.length)
    // Co-occurrence bias (issue #224): mountainChanceFor/poolChanceFor are
    // called LIVE, per node, as sampleFuzzyObstacles iterates — and
    // onDecided runs the real tryPlaceAt collision check + updates
    // placedCategoryByNode IMMEDIATELY for a real, validated placement, so
    // a later node in this SAME batch really does see an earlier one's
    // outcome. Confirmed necessary: an earlier version computed bias once
    // per zone BEFORE the batch ran (a static snapshot) and was measurably
    // weaker — see biasedChance's own doc comment for the specific
    // pools-near-pools regression that caught it.
    const mountainChanceFor = coOccurrenceStrength > 0
      ? (node: number) => biasedChance(INDEPENDENT_PHASE_MOUNTAIN_BASE_CHANCE, INDEPENDENT_PHASE_MOUNTAIN_BASE_CHANCE, node, sizeX, sizeZ, placedCategoryByNode, 'mountains', coOccurrenceStrength, CLUSTER_RADIUS)
      : undefined
    const poolChanceFor = coOccurrenceStrength > 0
      ? (node: number) => biasedChance(INDEPENDENT_PHASE_POOL_BASE_CHANCE, 0, node, sizeX, sizeZ, placedCategoryByNode, 'pools', coOccurrenceStrength, CLUSTER_RADIUS)
      : undefined
    sampleFuzzyObstacles(nodeDistances, () => biome, pools, {
      mountainChance: 0.05, rng, mountainChanceFor, poolChanceFor, weights: environmentWeights,
      onDecided: (node, addition) => {
        if (!addition) return
        if (!tryPlaceAt(addition.sid, node, sizeX, sizeZ, catalogById, state)) return
        placements.push({ tempId: state.nextTempId++, sid: addition.sid, node, rotation: pickRotation(addition.sid, catalogById, rng) })
        if (coOccurrenceStrength > 0) placedCategoryByNode.set(node, categoryOf(addition.sid, pool))
      },
    })
  }

  return placements
}
