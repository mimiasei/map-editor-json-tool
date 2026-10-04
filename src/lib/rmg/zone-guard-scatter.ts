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
import { createSeededRng } from './seeded-rng'
import type { BiomeId } from '@/lib/map-grid/terrain-colors'
import { GUARD_CONCRETE_SQUAD_CHANCE_SCALE, GUARD_VALUE_CUTOFF, RMG_GUARD_DIFFICULTY_RANGES, RMG_GUARD_RANDOM_WEIGHTS } from './guard-value-bands'
import type { RmgDifficultyValues } from './rmg-schema'
import type { GuardCategory, RmgTuning } from './rmg-tuning'
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

/** Whether `sid` is a real "worth guarding" candidate — mine, dwelling
 *  (`barracks_*`), resource pile/pickup, interactable building, or
 *  artifact. `random-item`/`random-squad` placeholders are deliberately
 *  excluded (nothing real to stand guard over yet at generation time). */
export function isGuardCandidate(sid: string, artifactSids: Set<string>): boolean {
  return guardCategoryOf(sid, artifactSids) !== null
}

/** The tuning category (rmg-tuning.ts `guards.chance`) of a guard candidate,
 *  or null when `sid` isn't one. Every interactable `object-variety.ts`'s
 *  `pickInteractableSid` can place is a candidate (issue #210 follow-up), as
 *  are resource pickups besides storage piles. */
export function guardCategoryOf(sid: string, artifactSids: Set<string>): GuardCategory | null {
  if (MINE_SIDS.has(sid)) return 'mine'
  if (sid.startsWith('barracks_')) return 'dwelling'
  if (STORAGE_SIDS.includes(sid) || (RESOURCE_SIDS as readonly string[]).includes(sid)) return 'resource'
  if ((INTERACTABLE_COMMON_SIDS as readonly string[]).includes(sid)) return 'interactableCommon'
  if ((INTERACTABLE_UNCOMMON_SIDS as readonly string[]).includes(sid)) return 'interactableUncommon'
  if ((INTERACTABLE_RARE_SIDS as readonly string[]).includes(sid)) return 'interactableRare'
  if (artifactSids.has(sid)) return 'artifact'
  return null
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
  /** Built-in ring layout (no imported template): every player zone — and
   *  separately every neutral zone — replays the same roll sequence, in
   *  candidate order, so equivalent mines/dwellings get equivalent guards
   *  (issue #254: random per-candidate rolls left one player's start with no
   *  proximity guards at all and another's with 68k worth). Tile positions
   *  stay independent. */
  symmetricZones?: boolean
  /** Classic mode's difficulty (game RMG schema values): zone guard
   *  multiplier and weekly growth. Omitted: values unchanged. */
  difficulty?: RmgDifficultyValues
  /** Tuning-file guard chances (rmg-tuning.ts): per object sid, else per
   *  category; unset ones use `squadDensity`. */
  guardTuning?: RmgTuning['guards']
}

export interface ScatterProximityGuardsResult {
  guardPlacements: ZonePlacement[]
  concreteSquads: ConcreteSquadPlacement[]
}

export function scatterProximityGuards(options: ScatterProximityGuardsOptions): ScatterProximityGuardsResult {
  const guardPlacements: ZonePlacement[] = []
  const concreteSquads: ConcreteSquadPlacement[] = []
  const { sizeX, sizeZ, placements, zoneIdByNode, zoneBiome, zoneDistances, playerZoneIds, catalogById, catalog, objectVariety, squadDensity, state, rng: posRng, symmetricZones = false, difficulty, guardTuning } = options
  const tunedChances = guardTuning ? [...Object.values(guardTuning.chance), ...Object.values(guardTuning.chanceBySid)] : []
  if (squadDensity <= 0 && !tunedChances.some((c) => c !== undefined && c > 0)) return { guardPlacements, concreteSquads }
  const playerZoneSet = new Set(playerZoneIds)
  const kindSeed = { player: Math.floor(posRng() * 0x7fffffff), neutral: Math.floor(posRng() * 0x7fffffff) }
  const zoneRolls = new Map<number, () => number>()
  const rollsFor = (zoneId: number): (() => number) => {
    if (!symmetricZones) return posRng
    let r = zoneRolls.get(zoneId)
    if (!r) { r = createSeededRng(playerZoneSet.has(zoneId) ? kindSeed.player : kindSeed.neutral); zoneRolls.set(zoneId, r) }
    return r
  }
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
    const category = guardCategoryOf(candidate.sid, artifactSids)
    if (category === null) continue
    const guardChance = guardTuning?.chanceBySid[candidate.sid] ?? guardTuning?.chance[category] ?? squadDensity
    const zoneId = zoneIdByNode[candidate.node]
    const rng = rollsFor(zoneId)
    // Every roll happens BEFORE the (non-deterministic) position search, so a
    // failed position can never desync a zone's replayed roll sequence.
    if (rng() >= guardChance) continue
    const depth = depthOf(zoneId)
    const labels = difficultyLabelsForDepth(depth)
    const range = pickSquadRange(labels, RMG_GUARD_DIFFICULTY_RANGES, RMG_GUARD_RANDOM_WEIGHTS, rng)
    const baseValue = randomInRange(range.min, range.max, rng)
    const requestedValue = difficulty ? Math.round(baseValue * difficulty.zoneGuardMultiplier) : baseValue
    const biome = zoneBiome.get(zoneId) ?? ZONE_BIOMES[0]
    const fraction = sampleFraction(biome, 0.7, rng)
    const wantsConcrete = !!catalog && objectVariety !== undefined && rng() < objectVariety * GUARD_CONCRETE_SQUAD_CHANCE_SCALE
    if (requestedValue < GUARD_VALUE_CUTOFF) continue

    const guardNode = nearbyFreeTile(candidate.node, sizeX, sizeZ, state, posRng)
    if (guardNode === null) continue

    if (wantsConcrete && catalog) {
      const template = pickSquadTemplate(catalog, fraction, requestedValue, rng)
      if (template) {
        state.usedAnchors.add(guardNode)
        concreteSquads.push({ tempId: state.nextTempId++, sid: template.id, node: guardNode })
        continue
      }
    }
    if (tryPlaceAt('random-squad', guardNode, sizeX, sizeZ, catalogById, state)) {
      guardPlacements.push({ tempId: state.nextTempId++, sid: 'random-squad', node: guardNode, randomSquadOverrides: { requestedValue, fraction, weeklyIncrementBonus: difficulty?.zoneGuardWeeklyIncrement } })
    }
  }

  return { guardPlacements, concreteSquads }
}
