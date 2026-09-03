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

export const RMG_TEMPLATE_VERSION = 1

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
   *  island count/land-vs-water ratio in `'islands'` mode. */
  waterChance: number
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
}

/** Every field a template can omit and still be valid — the same defaults
 *  zone-water.ts/zone-decoration.ts/zone-population.ts themselves fall
 *  back to when a caller doesn't pass these at all. */
export const DEFAULT_TEMPLATE_OVERRIDES: Pick<RandomMapTemplate, 'waterContent' | 'waterChance' | 'obstacleDensity' | 'treasureDensity' | 'objectVariety' | 'usePortals' | 'zoneJaggedness' | 'zoneSpread' | 'boundaryGuardStrength' | 'squadDensity' | 'roadWindingAmplitude' | 'roadWindingWavelength'> = {
  waterContent: 'normal',
  waterChance: 0.4,
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
}

export function templateToOptions(template: RandomMapTemplate): GenerateRandomMapOptions {
  const { sizeX, sizeZ, playerCount, playerSpawnerSid, waterContent, waterChance, obstacleDensity, treasureDensity, objectVariety, usePortals, zoneJaggedness, zoneSpread, boundaryGuardStrength, squadDensity, roadWindingAmplitude, roadWindingWavelength, seed } = template
  return {
    sizeX,
    sizeZ,
    playerCount,
    playerSpawnerSid,
    waterContent,
    waterChance,
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
    seed: typeof data.seed === 'number' ? data.seed : undefined,
  }
}

export function stringifyRandomMapTemplate(template: RandomMapTemplate): string {
  return JSON.stringify(template, null, 2)
}
