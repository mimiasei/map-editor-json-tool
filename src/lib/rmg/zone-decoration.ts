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
//
// Four more features, all direct user design requests rather than measured
// real-map data (unlike the three above) — see each constant's own doc
// comment for the exact numbers: `scatterCluster` now has a real THIRD
// archetype, forest-heavy (drawn from this biome's own real `tree_*`/
// `pinetree_*` family via `buildTreePools`), biased to appear more often
// near an already-placed mountain-heavy cluster, with its own small-biased
// size distribution and a soft walkable-grass/flower (plus occasional
// stump/log) edge halo around the finished blob. A mountain-heavy cluster
// now also has a real big-center/small-edge size gradient (real sid
// naming — `_big_`/`_small_` — confirmed consistent across every biome
// except Desert/Sand, which has no such split in the real catalog at all).
// Any placed `rocks_*`/`hill_*` (both the independent phase and cluster
// members) gets its own halo of trees in its 8-neighborhood. `CLUSTER_SEED_
// SPACING` was also lowered so clustering happens noticeably more often
// overall, addressing a direct user report that single dispersed trees/
// rocks/hills/mountains still dominated the look.

import type { CatalogEnvironmentBiome, CatalogMapObject } from '@/lib/catalog/types'
import type { BiomeId } from '@/lib/map-grid/terrain-colors'
import { buildFuzzyObstaclePools, buildFuzzyObstacleWeights, buildTreePools, pickWeighted, sampleFuzzyObstacles, type FuzzyObstaclePool } from '@/lib/map-grid/fuzzy-obstacle'
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

/** One cluster seed per this many candidate tiles — originally tuned so a
 *  typical zone (a few hundred candidate tiles) got a handful of clumps, not
 *  dozens, keeping total coverage within the already-calibrated ~15-22%
 *  range. Lowered from the original 70 per a direct user report that the
 *  generator still read as "single trees/rocks/hills/mountains dispersed"
 *  rather than naturally clumped — more, smaller seeds spend roughly the
 *  same total decoration budget (each cluster's own member count/size is
 *  unchanged) on more INDIVIDUAL clumps instead of fewer bigger ones, which
 *  is what actually reads as "less dispersed" on screen. */
const CLUSTER_SEED_SPACING = 45
const CLUSTER_MIN_SIZE = 3
const CLUSTER_MAX_SIZE = 10
/** Tight enough that a cluster reads as one clump on screen — deliberately
 *  smaller than zone-population.ts's own `NEARBY_GUARD_RADIUS` (4),
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

const EIGHT_NEIGHBOR_OFFSETS: [number, number][] = [
  [-1, -1], [0, -1], [1, -1],
  [-1, 0], [1, 0],
  [-1, 1], [0, 1], [1, 1],
]

/** Of every cluster that ISN'T mountain-heavy (see `CLUSTER_MOUNTAIN_HEAVY_
 *  CHANCE`), how often it's forest-heavy (drawn mostly from this biome's own
 *  real `tree_*`/`pinetree_*` family, via `buildTreePools`) instead of a
 *  plain mixed-obstacle cluster (rocks/stumps/logs) — a direct user design
 *  request ("trees should come in clusters more often"), not measured real-
 *  map data. Zero real tree entries for a biome (Sand has none) makes every
 *  cluster fall through to plain obstacle-heavy regardless, same spirit as
 *  `CLUSTER_MOUNTAIN_HEAVY_CHANCE`'s own zero-mountains fallback. */
const CLUSTER_FOREST_HEAVY_CHANCE = 0.6
/** A forest cluster seeded near an already-placed mountain cluster is this
 *  much MORE likely to actually become forest-heavy — a direct user design
 *  request ("forests commonly sit next to mountain clusters"), not measured
 *  data (unlike `decoration-calibration.ts`'s own real co-occurrence table,
 *  which has no tree-specific finding — see object-variety.ts's sibling
 *  research this session). Applied as a flat multiplier on
 *  `CLUSTER_FOREST_HEAVY_CHANCE`, not blended by a 0-1 strength dial like
 *  the real-data-calibrated features above, since there is no "before this
 *  feature existed" behavior to preserve here — forest clustering is itself
 *  new. */
const FOREST_NEAR_MOUNTAIN_MULTIPLIER = 2
/** A forest cluster's own target size, in tiles — a direct user design
 *  request ("2x2 up to 5x5 tiles, rarer as size increases"), read as an
 *  approximate AREA (4-25 tiles) onto this generator's own organic blob-
 *  growth member count (never a literal square — see `shuffledClusterOffsets`'s
 *  own randomized-neighborhood growth, which every other cluster in this
 *  file already uses instead of a rigid shape). Weights fall off 2:1 per
 *  step so the smallest size is 8x as likely as the largest. */
const FOREST_CLUSTER_SIZE_WEIGHTS: { size: number; weight: number }[] = [
  { size: 4, weight: 8 },
  { size: 9, weight: 4 },
  { size: 16, weight: 2 },
  { size: 25, weight: 1 },
]
/** A forest cluster's own outer boundary ring gets walkable grass/flower
 *  clutter at this chance per tile, and (despite not being walkable) a
 *  stump/log at this lower chance — a direct user design request ("add
 *  walkables like grass, flowers and also some stumps at the edges... for a
 *  more organic, natural look"), not measured data. */
const FOREST_EDGE_GRASS_CHANCE = 0.5
const FOREST_EDGE_STUMP_CHANCE = 0.15
/** A placed rock/hill (identified by real sid naming — `rocks_*`/`hill_*`,
 *  confirmed real, distinct families from `mountain_*`/tree prefixes this
 *  session) gets a halo of trees in its own 8-neighborhood at a density
 *  randomized once per instance within this range — a direct user design
 *  request ("rocks and hills usually have trees 30-70% around them"), not
 *  measured data. Sampling a fresh density per instance (rather than one
 *  fixed percentage) gives real variety — some rocks read as nearly bare,
 *  others as almost fully treed in, both "around 30-70%" on average. */
const ROCK_HILL_TREE_HALO_MIN = 0.3
const ROCK_HILL_TREE_HALO_MAX = 0.7
const ROCK_OR_HILL_PATTERN = /(^|_)(rocks?|hill)(_|$)/i

/** Splits a biome's own `mountain_*` sids by real naming convention —
 *  confirmed this session (every mountain sid across all 7 biomes):
 *  `_big_`/`_small_` is a consistent split for Grass/Dirt/Autumn/Snow/
 *  Deathland/Lava; Desert/Sand (`mountain_desert_1..6`) is the one real
 *  exception with no size split at all, landing entirely in `other`. */
function splitMountainsBySize(mountains: string[]): { big: string[]; small: string[]; other: string[] } {
  const big: string[] = []
  const small: string[] = []
  const other: string[] = []
  for (const sid of mountains) {
    if (sid.includes('big')) big.push(sid)
    else if (sid.includes('small')) small.push(sid)
    else other.push(sid)
  }
  return { big, small, other }
}

/** User design request: "mountains should also be in clusters, where the
 *  inner part is large mountains and outer (edges) smaller ones" — picks
 *  `big` within `innerRadius` tiles of the cluster's own seed, `small`
 *  beyond it, falling back to `other` (Desert/Sand's own un-split family)
 *  and finally the full combined pool so a biome with no real size split at
 *  all still gets a mountain, just with no gradient (a disclosed real-data
 *  limitation, not a bug). */
const MOUNTAIN_CLUSTER_INNER_RADIUS = 1.5
function pickGradientMountainPool(distFromSeed: number, big: string[], small: string[], other: string[], fullPool: string[]): string[] {
  const preferred = distFromSeed <= MOUNTAIN_CLUSTER_INNER_RADIUS ? big : small
  if (preferred.length > 0) return preferred
  if (other.length > 0) return other
  return fullPool
}

function pickForestClusterSize(rng: () => number): number {
  const total = FOREST_CLUSTER_SIZE_WEIGHTS.reduce((sum, w) => sum + w.weight, 0)
  let roll = rng() * total
  for (const { size, weight } of FOREST_CLUSTER_SIZE_WEIGHTS) {
    if (roll < weight) return size
    roll -= weight
  }
  return FOREST_CLUSTER_SIZE_WEIGHTS[0].size
}

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

/** User design request: "rocks and hills usually have trees 30-70% around
 *  them" — called right after ANY real `rocks_*`/`hill_*` placement (both
 *  the independent per-tile phase and cluster members) succeeds, rolling
 *  each of its 8 neighbors independently against one density sampled fresh
 *  per instance (see `ROCK_HILL_TREE_HALO_MIN`/`MAX`'s own doc comment).
 *  No-op for a biome with no real tree entries at all (`treePool` empty —
 *  e.g. Sand). Pushes any successful placement straight into `placements`. */
function addRockHillTreeHalo(
  seedNode: number, sizeX: number, sizeZ: number, treePool: string[],
  catalogById: Map<string, CatalogMapObject>, state: PlacementState, rng: () => number, placements: ZonePlacement[],
): void {
  if (treePool.length === 0) return
  const density = ROCK_HILL_TREE_HALO_MIN + rng() * (ROCK_HILL_TREE_HALO_MAX - ROCK_HILL_TREE_HALO_MIN)
  const x = seedNode % sizeX
  const z = Math.floor(seedNode / sizeX)
  for (const [dx, dz] of EIGHT_NEIGHBOR_OFFSETS) {
    const nx = x + dx
    const nz = z + dz
    if (nx < 0 || nx >= sizeX || nz < 0 || nz >= sizeZ) continue
    if (rng() >= density) continue
    const node = nz * sizeX + nx
    const sid = treePool[Math.floor(rng() * treePool.length)]
    if (tryPlaceAt(sid, node, sizeX, sizeZ, catalogById, state)) {
      placements.push({ tempId: state.nextTempId++, sid, node, rotation: pickRotation(sid, catalogById, rng) })
    }
  }
}

/** User design request: "for forests, add walkables like grass, flowers and
 *  also some stubs (even though they're not walkable) at the edges... for a
 *  more organic, natural look" — computes `members`' own outer boundary ring
 *  (one tile out, excluding tiles the cluster itself already claimed) and,
 *  per boundary tile, rolls a walkable grass/flower clutter pick (real sids
 *  matched by name — `grass`/`flower` substrings within this biome's own
 *  clutter pool) at `FOREST_EDGE_GRASS_CHANCE`, else a stump/log pick
 *  (`stump`/`log` substrings, wherever they land in this biome's clutter/
 *  obstacle pools) at the lower `FOREST_EDGE_STUMP_CHANCE`. */
function addForestEdgeHalo(
  members: number[], sizeX: number, sizeZ: number, pool: FuzzyObstaclePool,
  catalogById: Map<string, CatalogMapObject>, state: PlacementState, rng: () => number, placements: ZonePlacement[],
): void {
  const memberSet = new Set(members)
  const boundary = new Set<number>()
  for (const node of members) {
    const x = node % sizeX
    const z = Math.floor(node / sizeX)
    for (const [dx, dz] of EIGHT_NEIGHBOR_OFFSETS) {
      const nx = x + dx
      const nz = z + dz
      if (nx < 0 || nx >= sizeX || nz < 0 || nz >= sizeZ) continue
      const n = nz * sizeX + nx
      if (!memberSet.has(n)) boundary.add(n)
    }
  }
  const grassFlower = pool.clutter.filter((sid) => /grass|flower/i.test(sid))
  const stumpOrLog = [...pool.clutter, ...pool.obstacles].filter((sid) => /stump|log/i.test(sid))
  for (const node of boundary) {
    let sid: string | null = null
    if (grassFlower.length > 0 && rng() < FOREST_EDGE_GRASS_CHANCE) {
      sid = grassFlower[Math.floor(rng() * grassFlower.length)]
    } else if (stumpOrLog.length > 0 && rng() < FOREST_EDGE_STUMP_CHANCE) {
      sid = stumpOrLog[Math.floor(rng() * stumpOrLog.length)]
    }
    if (!sid) continue
    if (tryPlaceAt(sid, node, sizeX, sizeZ, catalogById, state)) {
      placements.push({ tempId: state.nextTempId++, sid, node, rotation: pickRotation(sid, catalogById, rng) })
    }
  }
}

function scatterCluster(
  seedNode: number, sizeX: number, sizeZ: number, pool: FuzzyObstaclePool,
  catalogById: Map<string, CatalogMapObject>, state: PlacementState, rng: () => number,
  groupSizeWeights?: number[],
  coOccurrenceStrength = 0,
  placedCategoryByNode?: Map<number, DecorationCategory>,
  sidWeights?: Record<string, number>,
  treePool: string[] = [],
): ZonePlacement[] {
  // Archetype-choice rolls (mountain-heavy / forest-heavy / plain obstacle-
  // heavy, and the pool sub-chance) are decided ONCE per cluster from
  // whatever's already placed near the seed — a cluster is a single
  // archetype throughout, so per-member re-biasing would just repeat the
  // same seed-neighborhood context every time for no real gain.
  const seedNearby = (coOccurrenceStrength > 0 || treePool.length > 0) && placedCategoryByNode
    ? nearbyCategories(seedNode, sizeX, sizeZ, placedCategoryByNode, CLUSTER_RADIUS)
    : []
  const mountainHeavyChance = coOccurrenceStrength > 0 && seedNearby.length > 0
    ? clamp01(CLUSTER_MOUNTAIN_HEAVY_CHANCE * scaleMultiplier(coOccurrenceBias(seedNearby, 'mountains'), coOccurrenceStrength))
    : CLUSTER_MOUNTAIN_HEAVY_CHANCE
  const poolChance = coOccurrenceStrength > 0 && seedNearby.length > 0
    ? clamp01(CLUSTER_POOL_CHANCE * scaleMultiplier(coOccurrenceBias(seedNearby, 'pools'), coOccurrenceStrength))
    : CLUSTER_POOL_CHANCE

  const mountainHeavy = pool.mountains.length > 0 && rng() < mountainHeavyChance
  // User design request: a forest cluster seeded near an already-placed
  // mountain cluster is more likely to actually become forest-heavy (see
  // FOREST_NEAR_MOUNTAIN_MULTIPLIER's own doc comment) — checked
  // regardless of `coOccurrenceStrength` (a real-data-calibrated dial this
  // new, hand-specified rule doesn't gate on).
  const nearMountains = seedNearby.includes('mountains')
  const forestHeavyChance = clamp01(CLUSTER_FOREST_HEAVY_CHANCE * (nearMountains ? FOREST_NEAR_MOUNTAIN_MULTIPLIER : 1))
  const forestHeavy = !mountainHeavy && treePool.length > 0 && rng() < forestHeavyChance

  const primaryPool = mountainHeavy ? pool.mountains : forestHeavy ? treePool : pool.obstacles
  const accentPool = mountainHeavy ? pool.obstacles : forestHeavy ? pool.obstacles : pool.mountains
  if (primaryPool.length === 0) return []

  const { big: bigMountains, small: smallMountains, other: otherMountains } = mountainHeavy
    ? splitMountainsBySize(pool.mountains)
    : { big: [], small: [], other: [] }

  const pickSid = (distFromSeed: number): { sid: string; category: DecorationCategory } | null => {
    if (pool.pools.length > 0 && rng() < poolChance) {
      return { sid: pickWeighted(pool.pools, rng, sidWeights), category: 'pools' }
    }
    const roll = rng()
    const primaryCategory: DecorationCategory = mountainHeavy ? 'mountains' : 'obstacles'
    const accentCategory: DecorationCategory = mountainHeavy ? 'obstacles' : 'mountains'
    if (roll < CLUSTER_PRIMARY_CHANCE || accentPool.length === 0) {
      const sidPool = mountainHeavy ? pickGradientMountainPool(distFromSeed, bigMountains, smallMountains, otherMountains, primaryPool) : primaryPool
      return { sid: pickWeighted(sidPool, rng, sidWeights), category: primaryCategory }
    }
    if (roll < CLUSTER_PRIMARY_CHANCE + CLUSTER_ACCENT_CHANCE) {
      return { sid: pickWeighted(accentPool, rng, sidWeights), category: accentCategory }
    }
    if (pool.clutter.length > 0) return { sid: pickWeighted(pool.clutter, rng, sidWeights), category: 'clutter' }
    return { sid: pickWeighted(primaryPool, rng, sidWeights), category: primaryCategory }
  }

  const targetSize = forestHeavy
    ? pickForestClusterSize(rng)
    : groupSizeWeights && groupSizeWeights.length > 0
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
    const picked = pickSid(Math.hypot(dx, dz))
    if (!picked) continue
    if (!tryPlaceAt(picked.sid, node, sizeX, sizeZ, catalogById, state)) continue
    placements.push({ tempId: state.nextTempId++, sid: picked.sid, node, rotation: pickRotation(picked.sid, catalogById, rng) })
    placedCategoryByNode?.set(node, picked.category)
    if (ROCK_OR_HILL_PATTERN.test(picked.sid)) {
      addRockHillTreeHalo(node, sizeX, sizeZ, treePool, catalogById, state, rng, placements)
    }
    placed++
  }
  if (forestHeavy && placements.length > 0) {
    addForestEdgeHalo(placements.map((p) => p.node), sizeX, sizeZ, pool, catalogById, state, rng, placements)
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
  const treePools = buildTreePools(mapObjects)
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
    const treePool = treePools[biome]?.obstacles ?? []
    for (let i = 0; i < clusterSeedCount; i++) {
      const seedIndex = Math.floor(rng() * candidateTiles.length)
      const [seedNode] = candidateTiles.splice(seedIndex, 1)
      placements.push(...scatterCluster(seedNode, sizeX, sizeZ, pool, catalogById, state, rng, ambientPickup?.groupSizeWeights, coOccurrenceStrength, placedCategoryByNode, environmentWeights?.[biome], treePool))
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
        if (ROCK_OR_HILL_PATTERN.test(addition.sid)) {
          addRockHillTreeHalo(node, sizeX, sizeZ, treePool, catalogById, state, rng, placements)
        }
      },
    })
  }

  return placements
}
