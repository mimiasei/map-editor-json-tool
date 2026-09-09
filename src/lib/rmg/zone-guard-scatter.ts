// ─── RMG proximity guards (issue #210, user-reported) ───────────────────────
// A real user request: a random chance of a guard squad next to a real
// resource/artifact/mine/dwelling/interactable — on top of each zone's own
// single mine/treasure guard (zone-population.ts) and each zone-boundary
// gate's own guard (zone-boundary.ts). Runs as its own pass AFTER `populateZones` (the
// user's own explicit ordering: "add squads as a pass after resources and
// artifacts have been placed"), scanning its real placements for candidates
// rather than re-deriving what got placed where.
//
// Difficulty also scales with how close the candidate's own zone is to the
// nearest player start (a real user request: a mine/resource right next to
// a player's own city shouldn't roll a brutal guard) — zones 0-1 hops from
// a player start are restricted to Easy/Normal only; anything 2+ hops out
// gets the full weighted difficulty spread `squad-pool.ts` already defines.

import type { CatalogMapObject, GameCatalog } from '@/lib/catalog/types'
import {
  pickSquadRange,
  randomInRange,
  sampleFraction,
} from '@/lib/map-grid/squad-pool'
import type { BiomeId } from '@/lib/map-grid/terrain-colors'
import { GUARD_CONCRETE_SQUAD_CHANCE_SCALE, GUARD_VALUE_CUTOFF, RMG_GUARD_DIFFICULTY_RANGES, RMG_GUARD_RANDOM_WEIGHTS } from './guard-value-bands'
import {
  STORAGE_SIDS,
  RESOURCE_SIDS,
  INTERACTABLE_COMMON_SIDS,
  INTERACTABLE_UNCOMMON_SIDS,
  INTERACTABLE_RARE_SIDS,
  collectArtifactSids,
  pickSquadTemplate,
} from './object-variety'
import {
  tryPlaceAt,
  ZONE_BIOMES,
  type ConcreteSquadPlacement,
  type PlacementState,
  type ZonePlacement,
} from './zone-population'

const MINE_SIDS = new Set(['mine_wood', 'mine_ore', 'mine_gold', 'mine_gemstones', 'mine_crystals', 'mine_mercury'])

/** Every interactable sid `object-variety.ts`'s `pickInteractableSid` can
 *  place (issue #210 follow-up) — these were never guard candidates at all
 *  before, so most of them ended up unguarded regardless of `squadDensity`,
 *  same gap `RESOURCE_SIDS` had (real resource pickups, as opposed to
 *  `STORAGE_SIDS`'s storage piles, which were already covered). */
const INTERACTABLE_SIDS = new Set([...INTERACTABLE_COMMON_SIDS, ...INTERACTABLE_UNCOMMON_SIDS, ...INTERACTABLE_RARE_SIDS])

/** Whether `sid` is a real "worth guarding" candidate — mine, dwelling
 *  (`barracks_*`), resource pile/pickup, interactable building, or
 *  artifact. `random-item`/`random-squad` placeholders are deliberately
 *  excluded (nothing real to stand guard over yet at generation time). */
export function isGuardCandidate(sid: string, artifactSids: Set<string>): boolean {
  return MINE_SIDS.has(sid) || sid.startsWith('barracks_') || STORAGE_SIDS.includes(sid) ||
    (RESOURCE_SIDS as readonly string[]).includes(sid) || INTERACTABLE_SIDS.has(sid) || artifactSids.has(sid)
}

/** A free tile within a small radius of `node` — the candidate's own
 *  footprint is already claimed, so the guard stands just outside it
 *  rather than on top. Radius 4 (was 2) — real maps show guard-to-object
 *  distance typically 3-6 tiles, and a tighter radius silently suppressed
 *  placements (no free tile found) even on a successful `squadDensity`
 *  roll. */
export const NEARBY_GUARD_RADIUS = 4

function nearbyFreeTile(node: number, sizeX: number, sizeZ: number, state: PlacementState, rng: () => number): number | null {
  const cx = node % sizeX
  const cz = Math.floor(node / sizeX)
  const offsets: [number, number][] = []
  for (let dz = -NEARBY_GUARD_RADIUS; dz <= NEARBY_GUARD_RADIUS; dz++) {
    for (let dx = -NEARBY_GUARD_RADIUS; dx <= NEARBY_GUARD_RADIUS; dx++) {
      if (dx === 0 && dz === 0) continue
      offsets.push([dx, dz])
    }
  }
  for (let i = offsets.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[offsets[i], offsets[j]] = [offsets[j], offsets[i]]
  }
  for (const [dx, dz] of offsets) {
    const x = cx + dx
    const z = cz + dz
    if (x < 0 || x >= sizeX || z < 0 || z >= sizeZ) continue
    const n = z * sizeX + x
    if (state.blocked.has(n) || state.usedAnchors.has(n)) continue
    return n
  }
  return null
}

function difficultyLabelsForDepth(depth: number): string[] {
  if (depth <= 0) return ['Easy']
  if (depth === 1) return ['Easy', 'Normal']
  return ['Random']
}

export interface ScatterProximityGuardsOptions {
  sizeX: number
  sizeZ: number
  /** `populateZones`' own return value — the real resources/mines/
   *  dwellings/artifacts this pass scans for candidates. */
  placements: ZonePlacement[]
  zoneIdByNode: number[]
  zoneBiome: Map<number, BiomeId>
  /** All-pairs zone-graph hop distance (`zoneDistanceMatrix`), for the
   *  distance-scaled difficulty above. */
  zoneDistances: number[][]
  playerZoneIds: number[]
  catalogById: Map<string, CatalogMapObject>
  catalog?: GameCatalog
  objectVariety?: number
  /** 0-1 chance a given candidate gets a nearby guard. 0 = none (this
   *  pass is fully opt-in via the default). */
  squadDensity: number
  state: PlacementState
  rng: () => number
}

export interface ScatterProximityGuardsResult {
  guardPlacements: ZonePlacement[]
  concreteSquads: ConcreteSquadPlacement[]
}

export function scatterProximityGuards(options: ScatterProximityGuardsOptions): ScatterProximityGuardsResult {
  const guardPlacements: ZonePlacement[] = []
  const concreteSquads: ConcreteSquadPlacement[] = []
  if (options.squadDensity <= 0) return { guardPlacements, concreteSquads }

  const { sizeX, sizeZ, placements, zoneIdByNode, zoneBiome, zoneDistances, playerZoneIds, catalogById, catalog, objectVariety, squadDensity, state, rng } = options
  const artifactSids = new Set(catalog ? collectArtifactSids(catalog) : [])

  const depthByZone = new Map<number, number>()
  const depthOf = (zoneId: number): number => {
    let cached = depthByZone.get(zoneId)
    if (cached !== undefined) return cached
    let best = Infinity
    for (const playerId of playerZoneIds) best = Math.min(best, zoneDistances[zoneId][playerId])
    cached = Number.isFinite(best) ? best : 0
    depthByZone.set(zoneId, cached)
    return cached
  }

  for (const candidate of placements) {
    if (!isGuardCandidate(candidate.sid, artifactSids)) continue
    if (rng() >= squadDensity) continue

    const guardNode = nearbyFreeTile(candidate.node, sizeX, sizeZ, state, rng)
    if (guardNode === null) continue

    const zoneId = zoneIdByNode[candidate.node]
    const depth = depthOf(zoneId)
    const labels = difficultyLabelsForDepth(depth)
    const range = pickSquadRange(labels, RMG_GUARD_DIFFICULTY_RANGES, RMG_GUARD_RANDOM_WEIGHTS, rng)
    const requestedValue = randomInRange(range.min, range.max, rng)
    if (requestedValue < GUARD_VALUE_CUTOFF) continue
    const biome = zoneBiome.get(zoneId) ?? ZONE_BIOMES[0]
    const fraction = sampleFraction(biome, 0.7, rng)

    if (catalog && objectVariety !== undefined && rng() < objectVariety * GUARD_CONCRETE_SQUAD_CHANCE_SCALE) {
      const template = pickSquadTemplate(catalog, fraction, requestedValue, rng)
      if (template) {
        state.usedAnchors.add(guardNode)
        concreteSquads.push({ tempId: state.nextTempId++, sid: template.id, node: guardNode })
        continue
      }
    }
    if (tryPlaceAt('random-squad', guardNode, sizeX, sizeZ, catalogById, state)) {
      guardPlacements.push({ tempId: state.nextTempId++, sid: 'random-squad', node: guardNode, randomSquadOverrides: { requestedValue, fraction } })
    }
  }

  return { guardPlacements, concreteSquads }
}
