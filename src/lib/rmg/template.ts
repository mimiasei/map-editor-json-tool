// ─── RMG template format (issue #210, Milestone 3) ──────────────────────────
// A real, savable/loadable JSON format for this generator's own tunable
// parameters — deliberately scoped down from VCMI's own `Random_Map_Template`
// (per-zone terrain/faction allow-lists, treasure tiers, a full zone/
// connection editor — see issue #210's own research notes) to the
// parameters this generator's architecture actually supports today. A
// genuinely richer per-zone template format is a natural extension once
// zone-graph topology itself is user-configurable (today it's always
// `buildZoneGraph`'s own fixed ring) — tracked as a future milestone item,
// not attempted here.

import { createSeededRng } from './seeded-rng'
import type { GenerateRandomMapOptions } from './generate-random-map'
import type { BoundaryGuardStrength } from './zone-boundary'
import type { BiomeId } from '@/lib/map-grid/terrain-colors'

export const RMG_TEMPLATE_VERSION = 1

/** All 7 real biomes, in `BiomeId` order — the default `enabledBiomes`
 *  (every biome on). */
export const ALL_TEMPLATE_BIOMES: BiomeId[] = [1, 2, 3, 4, 5, 6, 7]

export interface RandomMapTemplate {
  version: typeof RMG_TEMPLATE_VERSION
  sizeX: number
  sizeZ: number
  playerCount: number
  playerSpawnerSid: 'city-spawner' | 'hero-spawner'
  /** Overall water geography — VCMI's own `allowedWaterContent` concept.
   *  `'none'`: no water at all. `'normal'`: in-zone lakes (zone-water.ts).
   *  `'islands'`: some neutral zones fully water-locked, reconnected by a
   *  portal pair instead of a boat (zone-islands.ts — no naval-travel
   *  mechanic exists in Olden Era). */
  waterContent: 'none' | 'normal' | 'islands'
  /** Overall water amount, 0-1 — lake prevalence/size in `'normal'` mode,
   *  ISLAND COUNT (not size — see `islandLandRatio`) in `'islands'` mode. */
  waterChance: number
  /** `'islands'` mode only: let a player's own start be one of the islands
   *  too, instead of every player always staying land-connected
   *  (zone-islands.ts's own original default) — a real user request. At
   *  higher `waterChance` with this on, the whole map can end up looking
   *  like it was flooded and then scattered with islands, rather than a
   *  mostly-solid mainland with a few carved-out neutral ones. Defaults to
   *  false. No effect for `'none'`/`'normal'` water content. */
  islandsIncludePlayerZones: boolean
  /** `'islands'` mode only — a real user request to decouple "how many
   *  islands" (`waterChance`) from "how big is each one": 0 = mostly
   *  water, each island small (this mode's original, still-default look);
   *  1 = mostly land, each island large. Defaults to 0.4. */
  islandLandRatio: number
  /** 0-1 fraction of each zone's own tiles considered for obstacle scattering
   *  (zone-decoration.ts). 0.35 default — real hand-crafted maps run 17-40%
   *  actual decoration tile coverage; this isn't a 1:1 proxy for that (candidates
   *  go through fuzzy-obstacle.ts's own probabilistic falloff), so the default
   *  was tuned empirically (a real regeneration/stats pass) to land around
   *  21% actual coverage — the middle of that range — rather than porting the
   *  percentage directly. */
  obstacleDensity: number
  /** Multiplier on neutral-zone treasure-pile count (zone-population.ts) — 1 = the generator's own default zone-size scaling, 2 = double, 0 = none. */
  treasureDensity: number
  /** 0-1 chance a given treasure/guard slot places a real, concrete object
   *  (a resource pile/artifact, or a real pre-composed `squads[]` army)
   *  instead of a `random-item`/`random-squad` placeholder
   *  (zone-population.ts/object-variety.ts). */
  objectVariety: number
  /** Adds one bonus portal-pair shortcut across the map's most graph-distant
   *  zone pair, on top of every normal road/river connection (VCMI's own
   *  `forcePortal` concept — generate-random-map.ts's own doc comment has
   *  the full rationale). Independent of `waterContent`. */
  usePortals: boolean
  /** 0-1 — Penrose-tiling zone-boundary jaggedness (generate-random-map.ts's
   *  own doc comment has the exact scale mapping). 0.5 (the default)
   *  reproduces this generator's original hardcoded shape exactly. */
  zoneJaggedness: number
  /** Multiplier on zone spread/spacing (generate-random-map.ts's own doc
   *  comment). 1 (the default) reproduces prior behavior exactly. */
  zoneSpread: number
  /** VCMI-style zone-to-zone guarded chokepoints (issue #210 Milestone 6 —
   *  generate-random-map.ts's own doc comment has the full design).
   *  `'none'` (the default) skips it entirely. */
  boundaryGuardStrength: BoundaryGuardStrength
  /** 0-1 chance a real mine/dwelling/resource/artifact gets an extra nearby
   *  guard (zone-guard-scatter.ts's own doc comment). 0.45 default —
   *  real hand-crafted maps show 64-100% of guardable objects within 6
   *  tiles of some guard (this pass is only one of several contributors to
   *  that coverage, so it doesn't need to hit those percentages alone). */
  squadDensity: number
  /** Road/river winding amplitude in tiles (generate-random-map.ts's own doc
   *  comment). 3 is the default, tuned default. */
  roadWindingAmplitude: number
  /** Road/river winding wavelength, tiles per curve cycle (generate-random-
   *  map.ts's own doc comment — pushed too low this reproduces the "ladder"
   *  artifact a real prior fix addressed). 50 is the tuned default. */
  roadWindingWavelength: number
  /** Fixed RNG seed for reproducible generation (mulberry32 — seeded-rng.ts). Omitted = a fresh random seed every time. */
  seed?: number
  /** Which of the 7 real biomes the generator is allowed to use at all —
   *  a real user request ("how many terrain types the RMG will use").
   *  Filters BOTH the player-zone deterministic biome cycle and the
   *  neutral-zone random pick (zone-population.ts's `ZONE_BIOMES`/
   *  `NEUTRAL_ZONE_BIOMES`). Defaults to all 7 (`ALL_TEMPLATE_BIOMES`) —
   *  must never be empty (at least one biome is required to generate
   *  anything; callers are responsible for not letting the UI empty it). */
  enabledBiomes: BiomeId[]
  /** Total `random-city` (neutral, non-player-owned) placements scattered
   *  across neutral zones map-wide — a real gap this generator never had
   *  (confirmed: zero references anywhere in src/lib/rmg/ before this).
   *  Defaults to 1. */
  randomCityCount: number
  /** Map-wide caps on specific object sids, mirroring the real game's own
   *  RMG template format (`maps/templates/*.rmg.json`'s own generic
   *  `contentCountLimits: [{sid, maxCount}]` shape — e.g. `Shamrock.rmg.json`
   *  caps `university` at 2) rather than one hardcoded field per notable
   *  sid. Applied as a single whole-map total (the real format applies it
   *  per named zone role — `spawn`/`treasure`/etc. — which this generator's
   *  simpler player/neutral-only zone model has no equivalent of yet).
   *  Defaults to a small starter list capping `university` at 1. */
  contentCountLimits: { sid: string; maxCount: number }[]
  /** Of every road segment (a zone-graph edge, or an intra-island road),
   *  the chance it's painted Stone (`roadId: 2`) instead of Dirt
   *  (`roadId: 1`, this generator's only material before this option) —
   *  confirmed real: `Fun_and_Graves.map` uses both ids. Defaults to 0.35. */
  stoneRoadChance: number
  /** When a road edge's neutral-zone side has a real mine/interactable/
   *  random-city node in it, the chance the road targets that node
   *  instead of the zone's own abstract anchor tile — a real user
   *  request, confirmed as the real game's own template design too
   *  (`mainObjects`/`roads` reference real objects, not arbitrary points).
   *  Defaults to 0.8 (high — "a higher chance" per the user's own
   *  wording, not a guarantee, since sometimes reading as the zone's own
   *  center still looks right). */
  roadPointOfInterestChance: number
  /** Independent per-edge chance a road is painted at all — a real user
   *  request that full player-to-player paved connectivity become
   *  progressively less certain over distance (each edge on a longer
   *  ring path independently rolls, so the odds compound) while each
   *  player's own immediate edge(s) stay reliably painted. Roads are
   *  purely cosmetic (never gate walkability), so skipping some is a
   *  style choice, not a connectivity risk. Defaults to 0.8. */
  roadFullConnectivityChance: number
}

/** Every field a template can omit and still be valid — the same defaults
 *  zone-water.ts/zone-decoration.ts/zone-population.ts themselves fall
 *  back to when a caller doesn't pass these at all. */
export const DEFAULT_TEMPLATE_OVERRIDES: Pick<RandomMapTemplate, 'waterContent' | 'waterChance' | 'islandsIncludePlayerZones' | 'islandLandRatio' | 'obstacleDensity' | 'treasureDensity' | 'objectVariety' | 'usePortals' | 'zoneJaggedness' | 'zoneSpread' | 'boundaryGuardStrength' | 'squadDensity' | 'roadWindingAmplitude' | 'roadWindingWavelength' | 'enabledBiomes' | 'randomCityCount' | 'contentCountLimits' | 'stoneRoadChance' | 'roadPointOfInterestChance' | 'roadFullConnectivityChance'> = {
  waterContent: 'normal',
  waterChance: 0.4,
  islandsIncludePlayerZones: false,
  islandLandRatio: 0.4,
  obstacleDensity: 0.35,
  treasureDensity: 1,
  objectVariety: 0.4,
  usePortals: false,
  zoneJaggedness: 0.5,
  zoneSpread: 1,
  boundaryGuardStrength: 'strong',
  squadDensity: 0.45,
  roadWindingAmplitude: 3,
  roadWindingWavelength: 50,
  enabledBiomes: ALL_TEMPLATE_BIOMES,
  randomCityCount: 1,
  contentCountLimits: [{ sid: 'university', maxCount: 1 }],
  stoneRoadChance: 0.35,
  roadPointOfInterestChance: 0.8,
  roadFullConnectivityChance: 0.8,
}

export function templateToOptions(template: RandomMapTemplate): GenerateRandomMapOptions {
  const { sizeX, sizeZ, playerCount, playerSpawnerSid, waterContent, waterChance, islandsIncludePlayerZones, islandLandRatio, obstacleDensity, treasureDensity, objectVariety, usePortals, zoneJaggedness, zoneSpread, boundaryGuardStrength, squadDensity, roadWindingAmplitude, roadWindingWavelength, enabledBiomes, randomCityCount, contentCountLimits, stoneRoadChance, roadPointOfInterestChance, roadFullConnectivityChance, seed } = template
  return {
    sizeX,
    sizeZ,
    playerCount,
    playerSpawnerSid,
    waterContent,
    waterChance,
    islandsIncludePlayerZones,
    islandLandRatio,
    obstacleDensity,
    treasureDensity,
    objectVariety,
    usePortals,
    zoneJaggedness,
    zoneSpread,
    boundaryGuardStrength,
    squadDensity,
    roadWindingAmplitude,
    roadWindingWavelength,
    enabledBiomes,
    randomCityCount,
    contentCountLimits,
    stoneRoadChance,
    roadPointOfInterestChance,
    roadFullConnectivityChance,
    rng: seed !== undefined ? createSeededRng(seed) : undefined,
  }
}

/** Parses and validates a template JSON string (from `openFile()` —
 *  native-fs.ts). Throws with a real, specific message on anything
 *  malformed rather than silently substituting defaults for a required
 *  field — a template a user opens should either load as exactly what it
 *  says, or fail loudly. */
export function parseRandomMapTemplate(json: string): RandomMapTemplate {
  const data = JSON.parse(json) as Partial<RandomMapTemplate>
  if (data.version !== RMG_TEMPLATE_VERSION) {
    throw new Error(`Unsupported RMG template version: ${JSON.stringify(data.version)} (expected ${RMG_TEMPLATE_VERSION})`)
  }
  if (typeof data.sizeX !== 'number' || typeof data.sizeZ !== 'number' || typeof data.playerCount !== 'number') {
    throw new Error('RMG template is missing required fields (sizeX/sizeZ/playerCount)')
  }
  if (data.playerSpawnerSid !== 'city-spawner' && data.playerSpawnerSid !== 'hero-spawner') {
    throw new Error('RMG template playerSpawnerSid must be "city-spawner" or "hero-spawner"')
  }
  if (data.waterContent !== undefined && data.waterContent !== 'none' && data.waterContent !== 'normal' && data.waterContent !== 'islands') {
    throw new Error('RMG template waterContent must be "none", "normal", or "islands"')
  }
  if (data.boundaryGuardStrength !== undefined && !['none', 'normal', 'strong', 'very strong'].includes(data.boundaryGuardStrength)) {
    throw new Error('RMG template boundaryGuardStrength must be "none", "normal", "strong", or "very strong"')
  }
  return {
    version: RMG_TEMPLATE_VERSION,
    sizeX: data.sizeX,
    sizeZ: data.sizeZ,
    playerCount: data.playerCount,
    playerSpawnerSid: data.playerSpawnerSid,
    waterContent: data.waterContent ?? DEFAULT_TEMPLATE_OVERRIDES.waterContent,
    waterChance: typeof data.waterChance === 'number' ? data.waterChance : DEFAULT_TEMPLATE_OVERRIDES.waterChance,
    islandsIncludePlayerZones: typeof data.islandsIncludePlayerZones === 'boolean' ? data.islandsIncludePlayerZones : DEFAULT_TEMPLATE_OVERRIDES.islandsIncludePlayerZones,
    islandLandRatio: typeof data.islandLandRatio === 'number' ? data.islandLandRatio : DEFAULT_TEMPLATE_OVERRIDES.islandLandRatio,
    obstacleDensity: typeof data.obstacleDensity === 'number' ? data.obstacleDensity : DEFAULT_TEMPLATE_OVERRIDES.obstacleDensity,
    treasureDensity: typeof data.treasureDensity === 'number' ? data.treasureDensity : DEFAULT_TEMPLATE_OVERRIDES.treasureDensity,
    objectVariety: typeof data.objectVariety === 'number' ? data.objectVariety : DEFAULT_TEMPLATE_OVERRIDES.objectVariety,
    usePortals: typeof data.usePortals === 'boolean' ? data.usePortals : DEFAULT_TEMPLATE_OVERRIDES.usePortals,
    zoneJaggedness: typeof data.zoneJaggedness === 'number' ? data.zoneJaggedness : DEFAULT_TEMPLATE_OVERRIDES.zoneJaggedness,
    zoneSpread: typeof data.zoneSpread === 'number' ? data.zoneSpread : DEFAULT_TEMPLATE_OVERRIDES.zoneSpread,
    boundaryGuardStrength: data.boundaryGuardStrength ?? DEFAULT_TEMPLATE_OVERRIDES.boundaryGuardStrength,
    squadDensity: typeof data.squadDensity === 'number' ? data.squadDensity : DEFAULT_TEMPLATE_OVERRIDES.squadDensity,
    roadWindingAmplitude: typeof data.roadWindingAmplitude === 'number' ? data.roadWindingAmplitude : DEFAULT_TEMPLATE_OVERRIDES.roadWindingAmplitude,
    roadWindingWavelength: typeof data.roadWindingWavelength === 'number' ? data.roadWindingWavelength : DEFAULT_TEMPLATE_OVERRIDES.roadWindingWavelength,
    enabledBiomes: Array.isArray(data.enabledBiomes) && data.enabledBiomes.length > 0 ? data.enabledBiomes : DEFAULT_TEMPLATE_OVERRIDES.enabledBiomes,
    randomCityCount: typeof data.randomCityCount === 'number' ? data.randomCityCount : DEFAULT_TEMPLATE_OVERRIDES.randomCityCount,
    contentCountLimits: Array.isArray(data.contentCountLimits) ? data.contentCountLimits : DEFAULT_TEMPLATE_OVERRIDES.contentCountLimits,
    stoneRoadChance: typeof data.stoneRoadChance === 'number' ? data.stoneRoadChance : DEFAULT_TEMPLATE_OVERRIDES.stoneRoadChance,
    roadPointOfInterestChance: typeof data.roadPointOfInterestChance === 'number' ? data.roadPointOfInterestChance : DEFAULT_TEMPLATE_OVERRIDES.roadPointOfInterestChance,
    roadFullConnectivityChance: typeof data.roadFullConnectivityChance === 'number' ? data.roadFullConnectivityChance : DEFAULT_TEMPLATE_OVERRIDES.roadFullConnectivityChance,
    seed: typeof data.seed === 'number' ? data.seed : undefined,
  }
}

export function stringifyRandomMapTemplate(template: RandomMapTemplate): string {
  return JSON.stringify(template, null, 2)
}
