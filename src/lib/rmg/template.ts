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

export const RMG_TEMPLATE_VERSION = 1

export interface RandomMapTemplate {
  version: typeof RMG_TEMPLATE_VERSION
  sizeX: number
  sizeZ: number
  playerCount: number
  playerSpawnerSid: 'city-spawner' | 'hero-spawner'
  /** 0-1 chance any given eligible neutral zone gets a lake (zone-water.ts). */
  waterChance: number
  /** 0-1 fraction of each zone's own tiles considered for obstacle scattering (zone-decoration.ts). */
  obstacleDensity: number
  /** Multiplier on neutral-zone treasure-pile count (zone-population.ts) — 1 = the generator's own default zone-size scaling, 2 = double, 0 = none. */
  treasureDensity: number
  /** Fixed RNG seed for reproducible generation (mulberry32 — seeded-rng.ts). Omitted = a fresh random seed every time. */
  seed?: number
}

/** Every field a template can omit and still be valid — the same defaults
 *  zone-water.ts/zone-decoration.ts/zone-population.ts themselves fall
 *  back to when a caller doesn't pass these at all. */
export const DEFAULT_TEMPLATE_OVERRIDES: Pick<RandomMapTemplate, 'waterChance' | 'obstacleDensity' | 'treasureDensity'> = {
  waterChance: 0.4,
  obstacleDensity: 0.12,
  treasureDensity: 1,
}

export function templateToOptions(template: RandomMapTemplate): GenerateRandomMapOptions {
  const { sizeX, sizeZ, playerCount, playerSpawnerSid, waterChance, obstacleDensity, treasureDensity, seed } = template
  return {
    sizeX,
    sizeZ,
    playerCount,
    playerSpawnerSid,
    waterChance,
    obstacleDensity,
    treasureDensity,
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
  return {
    version: RMG_TEMPLATE_VERSION,
    sizeX: data.sizeX,
    sizeZ: data.sizeZ,
    playerCount: data.playerCount,
    playerSpawnerSid: data.playerSpawnerSid,
    waterChance: typeof data.waterChance === 'number' ? data.waterChance : DEFAULT_TEMPLATE_OVERRIDES.waterChance,
    obstacleDensity: typeof data.obstacleDensity === 'number' ? data.obstacleDensity : DEFAULT_TEMPLATE_OVERRIDES.obstacleDensity,
    treasureDensity: typeof data.treasureDensity === 'number' ? data.treasureDensity : DEFAULT_TEMPLATE_OVERRIDES.treasureDensity,
    seed: typeof data.seed === 'number' ? data.seed : undefined,
  }
}

export function stringifyRandomMapTemplate(template: RandomMapTemplate): string {
  return JSON.stringify(template, null, 2)
}
