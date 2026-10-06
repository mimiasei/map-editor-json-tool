// ─── RMG zone population (issue #210, Milestones 1-2) ───────────────────────
// Collision-aware object scattering per zone — the composition issue #210
// flagged as missing entirely: none of this codebase's existing scatter
// samplers (fuzzy-obstacle.ts, interactable-pool.ts) consult a real
// footprint/blocked-tile model before proposing a placement. This module
// does: every candidate anchor is checked against the same `nodes[]`
// footprint data footprint.ts/passability.ts already use for real placed
// objects, and accepted only if its solid (`value===1`) cells don't overlap
// anything already placed this generation pass. `PlacementState`/
// `tryPlaceAt` are exported so zone-decoration.ts's obstacle scattering
// (Milestone 2) shares the exact same running collision state.
//
// Each player zone gets a starting dwelling (its own faction's tier-1
// creature) + a home resource mine (wood/ore, alternating) + one light
// guard. Each neutral zone gets a resource mine (cycling through all 6 real
// resource types) + a size-scaled number of random-item treasure piles +
// one guard sized from that mine's own real guard-value data
// (value-model.ts) rather than a flat difficulty pick — the "treasure zone"
// VCMI's own template format calls this same role.

import { sidBiome, violatesIsolation } from './biome-isolation'
import { createSeededRng } from './seeded-rng'
import type { CatalogMapObject, CatalogObjectLogic, GameCatalog } from '@/lib/catalog/types'
import type { BiomeId } from '@/lib/map-grid/terrain-colors'
import { computeFootprintTiles, protectedNeighborNodes, type FootprintCell } from '@/lib/map-grid/footprint'
import { NON_BLOCKING_SPAWNER_SIDS } from '@/lib/map-grid/passability'
import {
  BIOME_FACTION,
  pickSquadRange,
  randomInRange,
  sampleFraction,
} from '@/lib/map-grid/squad-pool'
import { GUARD_CONCRETE_SQUAD_CHANCE_SCALE, GUARD_VALUE_CUTOFF, PLAYER_ZONE_GUARD_MULTIPLIER, RMG_GUARD_DIFFICULTY_RANGES, RMG_GUARD_RANDOM_WEIGHTS } from './guard-value-bands'
import { isRmgIneligibleInteractableSid, pickSquadTemplate, resolveContentPoolPick, resolveGoodsValue, rollContentPool, UNSUPPORTED_CONTENT_POOL_SIDS } from './object-variety'
import { scaleMultiplier } from './decoration-calibration'
import { mineGuardValue } from './value-model'
import { NEUTRAL_ROLES, type NeutralZoneRole, type ZoneSpec } from './zone-graph'
import type { RmgDifficultyValues } from './rmg-schema'
import { DEFAULT_MINE_DISTRIBUTION, MINE_TYPES, type MineDistribution, type MineType, type RmgTuning } from './rmg-tuning'

/** Dwelling sids use `necropolis`, not `undead`, as undead's faction token
 *  (CLAUDE.md's own documented sid/id mismatch: dwelling files are named
 *  `barracks_necropolis_N` even though the faction's real id is `undead`).
 *  Falls back to a generic neutral dwelling for any biome with no native
 *  faction — never actually hit today since `ZONE_BIOMES` below excludes
 *  Sand (biome 2), the only biome with no native faction, but kept so this
 *  function has a real answer for every `BiomeId` rather than assuming its
 *  caller's own zone-biome choices forever. */
function dwellingFactionToken(biome: BiomeId): string {
  const faction = BIOME_FACTION[biome]
  if (faction === 'undead') return 'necropolis'
  return faction ?? 'neutral'
}


/** Share of treasure slots that become guarded treasure: the game's
 *  guarded/unguarded encounter density ratio (default_zone_layouts.json,
 *  1.4/(1.4+1) ≈ 0.58), or 0.35 without it — see populateZones. */
export function defaultTreasureGuardShare(catalog: GameCatalog | undefined): number {
  const guarded = catalog?.rmgZoneLayout?.guardedEncounterDencity
  const unguarded = catalog?.rmgZoneLayout?.unguardedEncounterDencity
  return guarded !== undefined && unguarded !== undefined && guarded + unguarded > 0 ? guarded / (guarded + unguarded) : 0.35
}

/** Sand's own biome id (terrain-colors.ts's BiomeId). */
const SAND_BIOME_ID: BiomeId = 2

/** Real enrichment factor (issue #230, scripts/analyze-map-aesthetics.ts,
 *  18 maps): of every real `mine_gold` placement, 28% (53/190) sit on a
 *  Sand tile, vs. Sand's own ~13.9% share of total real map area (164848 of
 *  1,188,182 tiles, from the same script's biome-adjacency self-counts) —
 *  gold mines are ~2.02x as concentrated in Sand as land-area alone would
 *  predict (28.0/13.9), the same observed/expected-under-uniform-null shape
 *  this codebase already uses for decoration co-occurrence
 *  (decoration-calibration.ts). No other mine type showed a comparable
 *  biome enrichment in that analysis. */
const SAND_GOLD_MINE_ENRICHMENT = 2.02

/** A weighted random pick among the types with weight > 0, or null if none. */
function pickWeightedMine(weights: Partial<Record<MineType, number>>, rng: () => number): MineType | null {
  const options = MINE_TYPES.filter((t) => (weights[t] ?? 0) > 0)
  const total = options.reduce((s, t) => s + (weights[t] ?? 0), 0)
  if (total <= 0) return null
  let roll = rng() * total
  for (const t of options) {
    roll -= weights[t] ?? 0
    if (roll < 0) return t
  }
  return options[options.length - 1]
}

/** `count` weighted mine types, without repeating a type until every type
 *  with weight > 0 was used once (so a 4-mine zone isn't 4× wood). */
function drawMineTypes(count: number, weights: Partial<Record<MineType, number>>, rng: () => number): MineType[] {
  const out: MineType[] = []
  let bag: Partial<Record<MineType, number>> = {}
  for (let i = 0; i < count; i++) {
    if (!MINE_TYPES.some((t) => (bag[t] ?? 0) > 0)) bag = { ...weights }
    const t = pickWeightedMine(bag, rng)
    if (t === null) break
    out.push(t)
    bag[t] = 0
  }
  return out
}

/** Neutral-zone mines are kept at least this many tiles apart (when the zone
 *  has room) so they spread out instead of clumping. */
const MINE_SPACING = 6

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value))
}

/** Player zones only ever cycle through these 6 real faction biomes — never
 *  Sand (biome 2), which CLAUDE.md confirms no faction natively occupies, so
 *  `dwellingFactionToken` always resolves a zone's own real faction rather
 *  than the neutral-dwelling fallback. */
export const ZONE_BIOMES: BiomeId[] = [1, 3, 4, 5, 6, 7]

/** Neutral zones have no faction to protect, so unlike `ZONE_BIOMES` they
 *  draw from all 7 real biomes including Sand — real, released maps use it
 *  freely for neutral terrain (confirmed: `Stormlight.map`'s own tile
 *  histogram has 385 Sand tiles alongside its other biomes). */
const NEUTRAL_ZONE_BIOMES: BiomeId[] = [1, 2, 3, 4, 5, 6, 7]

/** Player zones still cycle deterministically through `ZONE_BIOMES` with
 *  their own counter, not a single `zone.id % 6` — `buildZoneGraph`'s ring
 *  gives every player zone an even id and every neutral zone an odd one,
 *  and since 6 is itself even, `id % 6` on a strictly-even sequence only
 *  ever lands on 3 of the 6 residues (confirmed the hard way: an earlier
 *  version of this function used `zone.id % 6` directly and every
 *  generated map's player zones only ever got human/unfrozen/demon
 *  dwellings — 3 of 6 factions, never necropolis/nature/dungeon, no matter
 *  the player count).
 *
 *  Neutral zones instead get an independent random pick per zone from
 *  `NEUTRAL_ZONE_BIOMES` — a real, reported gap: cycling neutral zones
 *  through the same small deterministic list as player zones (the
 *  previous behavior) meant total biome variety on the whole map was
 *  capped at `playerCount` (and always the same biomes in the same order
 *  run after run), and Sand never appeared at all since it was excluded
 *  from that shared list entirely.
 *
 *  `enabledBiomes` (a real user request — "how many terrain types the RMG
 *  will use") filters BOTH lists down to their intersection with it before
 *  cycling/picking; omitted or empty (nothing usefully enabled) falls back
 *  to the full unfiltered list, same as this function's own pre-existing
 *  behavior — callers are responsible for not letting a UI empty this
 *  down to zero in the first place. */
/**
 * @param templateBiomeByZoneId Real per-zone biome constraints from a
 *   picked game template (`rmg-template-import.ts`'s `biomeIdByZoneId` —
 *   issue #210 second follow-up milestone), applied as a direct override
 *   before falling back to this function's own pool-cycling logic. Only
 *   ever populated for neutral zones in every real sample checked (Spawn
 *   zones use a self-referential `MatchMainObject` constraint instead,
 *   already effectively what this function's own per-player cycling
 *   achieves) — so a player zone's own `playerIndex` cycling is never
 *   skipped/disturbed by this override.
 */
export function assignZoneBiomes(zones: ZoneSpec[], rng: () => number, enabledBiomes?: BiomeId[], templateBiomeByZoneId?: Map<number, BiomeId>): Map<number, BiomeId> {
  const enabledSet = enabledBiomes && enabledBiomes.length > 0 ? new Set(enabledBiomes) : null
  const playerBiomes = enabledSet ? ZONE_BIOMES.filter((b) => enabledSet.has(b)) : ZONE_BIOMES
  const neutralBiomes = enabledSet ? NEUTRAL_ZONE_BIOMES.filter((b) => enabledSet.has(b)) : NEUTRAL_ZONE_BIOMES
  const playerPool = playerBiomes.length > 0 ? playerBiomes : ZONE_BIOMES
  const neutralPool = neutralBiomes.length > 0 ? neutralBiomes : NEUTRAL_ZONE_BIOMES
  const biomeByZone = new Map<number, BiomeId>()
  let playerIndex = 0
  for (const zone of zones) {
    const templateBiome = templateBiomeByZoneId?.get(zone.id)
    if (zone.kind === 'player') {
      // `playerIndex` must advance every player zone regardless of whether
      // this specific one has a template override, so a later un-
      // overridden player zone still lands on the pool's own next color —
      // deliberately NOT `templateBiome ?? playerPool[playerIndex++ ...]`,
      // which would skip the increment whenever a template DID provide one.
      const cycled = playerPool[playerIndex++ % playerPool.length]
      biomeByZone.set(zone.id, templateBiome ?? cycled)
    } else {
      biomeByZone.set(zone.id, templateBiome ?? neutralPool[Math.floor(rng() * neutralPool.length)])
    }
  }
  return biomeByZone
}

export interface ZonePlacement {
  tempId: number
  sid: string
  node: number
  /** 0-3 quadrant enum (0/90/180/270°) — see `isRotationallySymmetricFootprint`
   *  below for why this is only ever set on a footprint-safe placement. */
  rotation?: number
  randomSquadOverrides?: { requestedValue: number; fraction: string; weeklyIncrementBonus?: number }
  /** See `map-write.ts`'s own doc comment on `addObjectInstances`'
   *  `randomItemOverrides` param — real maps vary `propRandomItems.rarity`
   *  (0-3), unlike this generator's old flat 0. */
  randomItemOverrides?: { rarity: number }
  /** `random-city` (neutral, non-player-owned) placements only — a real
   *  faction is required at placement time (CLAUDE.md's documented
   *  "unconfigured random-city never verified in-game" trap), never left
   *  for later configuration the way a manually-added one is. */
  randomCityOverrides?: { factionSid: string; spawnHero: boolean }
  /** `random-hire` (mercenary guild) placements only — issue #240 Phase 1's
   *  real tier (1-7), replacing the previous flat always-tier-1 default
   *  (`map-write.ts`'s `RANDOM_SPAWNER_TABLE_DEFAULTS`). See
   *  `object-variety.ts`'s `pickRandomHireTier` for the real weight/value
   *  data this comes from. */
  randomHireOverrides?: { tier: number }
}

/** A concrete, pre-composed army (`squads[]`, entityType 2 — structurally
 *  separate from a `random-squad` type-0 placeholder, see this repo's own
 *  `objects[]`/`squads[]`/`markers[]` id-namespace notes). Squad templates
 *  have no `catalog.mapObjects` footprint entry and, per this codebase's own
 *  passability model, aren't terrain at all (no blocking/footprint), so
 *  these can't go through `tryPlaceAt`/the accessibility pass's
 *  type-0-only `objectGroups` model — the caller places them with a plain
 *  `addObjectInstance(..., 2, sid, node)` after that pass completes. */
export interface ConcreteSquadPlacement {
  tempId: number
  sid: string
  node: number
}

export interface PlacementState {
  blocked: Set<number>
  usedAnchors: Set<number>
  nextTempId: number
  /** Object anchor node → the tile reserved in front of its entrance for a
   *  guard (see `tryPlaceAt`). The tile is also in `blocked`, and in
   *  `reservedGuardTiles` so nothing but a guard squad can anchor on it. */
  guardTileByNode: Map<number, number>
  reservedGuardTiles: Set<number>
  /** The painted biome of every tile. When set, `tryPlaceAt` refuses a spot
   *  where one of the object's cells would break biome isolation (a Snow
   *  object off Snow, anything on Sand/Snow/Lava ground, see biome-isolation.ts). */
  tileBiome?: number[]
}

export function createPlacementState(seedBlocked: Set<number>, seedAnchors: Set<number>): PlacementState {
  return { blocked: new Set(seedBlocked), usedAnchors: new Set(seedAnchors), nextTempId: 0, guardTileByNode: new Map(), reservedGuardTiles: new Set() }
}

/** Sids that never get a guard tile reserved: guard squads themselves (their
 *  value-2 cells are a trigger ring, not an entrance) and player starts. */
const NO_GUARD_TILE_SIDS = new Set(['random-squad', 'city-spawner', 'hero-spawner'])

/** An object's own entrance (value 2) cells as guard spots, best first. A
 *  guard stands ON an entrance cell — the game's own maps do this for ~70% of
 *  their squads (920 squads across the official maps, 637 on an entrance).
 *  Best: an entrance directly in front of a solid cell, i.e. at z − 1 of a
 *  `1` (front = toward lower z), closest to the middle of the solid cells.
 *  Then the other entrances, lowest z first, then closest to the middle.
 *  Deterministic (no rng). */
function entranceGuardCandidates(cells: FootprintCell[], sizeX: number): number[] {
  const solid = cells.filter((c) => c.value === 1)
  const solidNodes = new Set(solid.map((c) => c.z * sizeX + c.x))
  const ref = solid.length > 0 ? solid : cells.filter((c) => c.value !== 0)
  const midX = ref.reduce((s, c) => s + c.x, 0) / Math.max(1, ref.length)
  const entrances = cells.filter((c) => c.value === 2)
  const inFront = (c: FootprintCell): boolean => solidNodes.has((c.z + 1) * sizeX + c.x)
  const best = entrances.filter(inFront).sort((a, b) => Math.abs(a.x - midX) - Math.abs(b.x - midX) || a.z - b.z)
  const rest = entrances.filter((c) => !inFront(c)).sort((a, b) => a.z - b.z || Math.abs(a.x - midX) - Math.abs(b.x - midX))
  return [...best, ...rest].map((c) => c.z * sizeX + c.x)
}

/** The tiles touching an object's entrance cells, outside its footprint,
 *  grouped by preference: straight out from an entrance (the solid cell is
 *  on the opposite side), the other edge neighbours, then diagonals. A
 *  `random-squad` on any of them covers the entrance with its trigger ring —
 *  the guard's fallback when no entrance cell itself is free. */
function entranceApproachTiles(cells: FootprintCell[], sizeX: number, sizeZ: number): { front: number[]; sides: number[]; diagonals: number[] } {
  const footprint = new Set(cells.filter((c) => c.value !== 0).map((c) => c.z * sizeX + c.x))
  const solid = new Set(cells.filter((c) => c.value === 1).map((c) => c.z * sizeX + c.x))
  const inBounds = (x: number, z: number): boolean => x >= 0 && x < sizeX && z >= 0 && z < sizeZ
  const front = new Set<number>()
  const sides = new Set<number>()
  const diagonals = new Set<number>()
  for (const e of cells.filter((c) => c.value === 2)) {
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dz === 0) continue
        const x = e.x + dx
        const z = e.z + dz
        if (!inBounds(x, z)) continue
        const n = z * sizeX + x
        if (footprint.has(n)) continue
        if (dx !== 0 && dz !== 0) { diagonals.add(n); continue }
        const behind = (e.z - dz) * sizeX + (e.x - dx)
        if (inBounds(e.x - dx, e.z - dz) && solid.has(behind)) front.add(n)
        else sides.add(n)
      }
    }
  }
  return { front: [...front], sides: [...sides].filter((n) => !front.has(n)), diagonals: [...diagonals].filter((n) => !front.has(n) && !sides.has(n)) }
}

/** Check `sid`'s footprint at this EXACT `node` and, if it fits (in bounds,
 *  no solid-cell overlap with anything already claimed), commit it into
 *  `state` and return true. No retry/resampling — callers that already
 *  picked a specific candidate node (zone-decoration.ts's obstacle
 *  scattering, driven by fuzzy-obstacle.ts's own distance/biome rolls) use
 *  this directly; `tryPlace` below (an unconstrained "anywhere in this
 *  zone" placement) is built on top of it.
 *
 *  `state.blocked` also gets a placement's entrance/interaction (value===2)
 *  cells, not just its solid (value===1) ones — confirmed the real root
 *  cause of a long-standing RMG load-freeze bug (see entrance-validation.ts):
 *  without this, nothing stopped a later decoration pass from placing a
 *  solid object (e.g. a pinetree) directly on an already-placed city's own
 *  entrance tile, sealing it off in-game. A future *solid* placement whose
 *  own footprint would land on that node is rejected by the `cell.value ===
 *  1 &&` check above, same as any other blocked cell; a walkable decoration
 *  (no value===1 cells at all, e.g. grass/flowers) is still allowed there,
 *  matching the real game's own tolerance for walkable clutter on an
 *  entrance tile. */
export function tryPlaceAt(
  sid: string,
  node: number,
  sizeX: number,
  sizeZ: number,
  catalogById: Map<string, CatalogMapObject>,
  state: PlacementState,
): boolean {
  if (state.usedAnchors.has(node)) return false
  // A reserved guard tile (below) is only for the guard squad itself.
  if (state.reservedGuardTiles.has(node) && sid !== 'random-squad') return false
  const template = catalogById.get(sid)
  const nonBlocking = NON_BLOCKING_SPAWNER_SIDS.has(sid)
  const x = node % sizeX
  const z = Math.floor(node / sizeX)
  const cells = computeFootprintTiles(template, x, z)
  const objectBiome = state.tileBiome ? sidBiome(sid, catalogById) : null
  for (const cell of cells) {
    if (cell.x < 0 || cell.x >= sizeX || cell.z < 0 || cell.z >= sizeZ) return false
    if (objectBiome !== null && violatesIsolation(objectBiome, state.tileBiome?.[cell.z * sizeX + cell.x])) return false
    if (!nonBlocking && cell.value === 1 && state.blocked.has(cell.z * sizeX + cell.x)) return false
  }

  // Every object with an entrance reserves one of its entrance cells for a
  // guard (entranceGuardCandidates' order) — the guard pass runs last
  // (generate-random-map.ts) and puts the squad there. The cell must not
  // already be claimed by anything else (another object's entrance/solid,
  // an anchor, another reservation); none free → the object doesn't go here
  // (callers try another spot), so every placed object stays guardable.
  // Deterministic (no rng) so it never shifts any random stream.
  let guardTile: number | null = null
  if (!nonBlocking && !NO_GUARD_TILE_SIDS.has(sid) && cells.some((c) => c.value === 2)) {
    guardTile = entranceGuardCandidates(cells, sizeX).find((n) =>
      !state.blocked.has(n) && !state.usedAnchors.has(n) && !state.reservedGuardTiles.has(n)) ?? null
    if (guardTile === null) return false
  }

  state.usedAnchors.add(node)
  if (!nonBlocking) {
    for (const cell of cells) {
      if (cell.value === 1 || cell.value === 2) state.blocked.add(cell.z * sizeX + cell.x)
    }

    const protectedNodes = protectedNeighborNodes(cells, sizeX, sizeZ)
    for (const pNode of protectedNodes) {
      state.blocked.add(pNode)
    }
  }
  if (guardTile !== null) {
    state.blocked.add(guardTile)
    state.reservedGuardTiles.add(guardTile)
    state.guardTileByNode.set(node, guardTile)
  }
  return true
}

/** Whether `sid`'s footprint can be safely rotated after `tryPlaceAt` already
 *  computed collision at rotation 0 — same restriction the H3 importer's
 *  `randomDecorRotation` (scenery-clusters.ts) applies to its own decoration
 *  pool: 1x1, or a square where every cell shares one value (fully solid or
 *  fully empty), so the occupied-cell pattern is identical after any 90°
 *  turn. Anything else (e.g. an oblong fence/bridge) would need the rotated
 *  footprint re-validated against `state.blocked`, which this generator
 *  doesn't do — so those just keep rotation 0, as before. */
export function isRotationallySymmetricFootprint(
  sid: string,
  catalogById: Map<string, CatalogMapObject>,
): boolean {
  const template = catalogById.get(sid)
  if (!template?.nodes?.length) return true
  const sizeX = template.sizeX ?? 1
  const sizeZ = template.sizeZ ?? 1
  if (sizeX === 1 && sizeZ === 1) return true
  if (sizeX !== sizeZ) return false
  const first = template.nodes[0]
  return template.nodes.every((v) => v === first)
}

/** Claim one free tile from `zoneTiles` for a concrete `squads[]` placement
 *  — NOT `tryPlaceAt` (no footprint template exists for a squad-template
 *  sid to check), just "not already some other placement's anchor tile".
 *  Doesn't add the claimed node to `state.blocked`, matching the same
 *  "squads aren't terrain" rule `tryPlaceAt` itself never applies to
 *  squads — but it DOES claim `usedAnchors` so two concrete squads (or a
 *  squad and an object) can't land on the exact same tile. */
function pickFreeTile(zoneTiles: number[], state: PlacementState, rng: () => number, maxAttempts = 30): number | null {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const node = zoneTiles[Math.floor(rng() * zoneTiles.length)]
    if (!state.usedAnchors.has(node)) {
      state.usedAnchors.add(node)
      return node
    }
  }
  return null
}

/** The tile a guard should stand on for the object `sid` placed at `node`,
 *  or null when there's none — then the object simply stays unguarded (no
 *  guard standing alone somewhere nearby).
 *
 *  Order: the entrance cell `tryPlaceAt` reserved (kept free of everything
 *  placed since, so normally this is it); else the first free entrance cell
 *  in entranceGuardCandidates' order; else a free tile touching an entrance
 *  (straight out, then sides, then diagonals — a `random-squad` triggers
 *  combat on its 8 surrounding tiles, so that still covers the entrance). */
export function entranceGuardTile(
  sid: string, node: number, sizeX: number, sizeZ: number,
  catalogById: Map<string, CatalogMapObject>, state: PlacementState, rng: () => number,
): number | null {
  const reserved = state.guardTileByNode.get(node)
  if (reserved !== undefined && !state.usedAnchors.has(reserved)) return reserved

  const cells = computeFootprintTiles(catalogById.get(sid), node % sizeX, Math.floor(node / sizeX))
  if (!cells.some((c) => c.value === 2)) return null
  const onEntrance = entranceGuardCandidates(cells, sizeX).find((n) => !state.usedAnchors.has(n) && !state.reservedGuardTiles.has(n))
  if (onEntrance !== undefined) return onEntrance

  const footprint = new Set(cells.filter((c) => c.value !== 0).map((c) => c.z * sizeX + c.x))
  const free = (n: number): boolean => !state.blocked.has(n) && !state.usedAnchors.has(n) && !footprint.has(n)
  const { front, sides, diagonals } = entranceApproachTiles(cells, sizeX, sizeZ)
  const shuffle = (list: number[]): number[] => {
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1))
      ;[list[i], list[j]] = [list[j], list[i]]
    }
    return list
  }
  for (const group of [front, sides, diagonals]) {
    const hit = shuffle([...new Set(group)]).find(free)
    if (hit !== undefined) return hit
  }
  return null
}

/** Try up to `maxAttempts` random tiles from `zoneTiles` for `sid`'s anchor,
 *  accepting the first `tryPlaceAt` accepts. Returns `null` if nothing fits
 *  within `maxAttempts` — a disclosed degrade for a small/crowded zone, not
 *  a silent invariant violation. Exported for zone-islands.ts's own portal
 *  placement — same "somewhere in this zone" need, different sid. */
export function tryPlace(
  sid: string,
  zoneTiles: number[],
  sizeX: number,
  sizeZ: number,
  catalogById: Map<string, CatalogMapObject>,
  state: PlacementState,
  rng: () => number,
  maxAttempts = 60,
): number | null {
  if (zoneTiles.length === 0) return null
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const node = zoneTiles[Math.floor(rng() * zoneTiles.length)]
    if (tryPlaceAt(sid, node, sizeX, sizeZ, catalogById, state)) return node
  }
  return null
}

export interface PopulateZonesOptions {
  sizeX: number
  sizeZ: number
  zones: ZoneSpec[]
  tilesByZone: Map<number, number[]>
  zoneBiome: Map<number, BiomeId>
  catalogById: Map<string, CatalogMapObject>
  objectLogicsById: Map<string, CatalogObjectLogic>
  /** Shared collision state — mutated in place, seeded by the caller with
   *  the player spawners `buildBlankMap` already placed. Also handed to
   *  zone-decoration.ts's obstacle scattering afterward so decoration never
   *  overlaps anything placed here. */
  state: PlacementState
  rng: () => number
  /** Multiplier on neutral-zone treasure-pile count — 1 = this function's
   *  own default zone-size scaling, 2 = double, 0 = none. Template-driven
   *  (see template.ts), defaults to 1 for callers that don't care. */
  treasureDensity?: number
  /** Classic mode's explicit richness (issue #250): pins every neutral zone's
   *  content-pool label and building tier instead of deriving them from
   *  `treasureDensity` x per-zone `treasureScale`. Treasure COUNT still follows
   *  `treasureDensity`. */
  richness?: { pool: 'poor' | 'medium' | 'rich'; tier: number }
  /** Classic mode's difficulty (the game's RMG schema values for the chosen
   *  level): scales every guard here, sets its weekly growth, and guards
   *  neutral cities. Omitted: guard values unchanged, cities unguarded. */
  difficulty?: RmgDifficultyValues
  /** Tuning-file guard chances (rmg-tuning.ts): `treasure` replaces the
   *  guarded-treasure share, `randomCity` (or chanceBySid["random-city"])
   *  the neutral city guard chance. */
  guardTuning?: RmgTuning['guards']
  /** How many mines and which types (rmg-tuning.ts DEFAULT_MINE_DISTRIBUTION,
   *  tuning overrides merged in). */
  mines?: MineDistribution
  /** zone id -> its anchor tile (a player zone's own city node). Lets every
   *  player's starting mines/dwelling/dust be placed at the SAME distance from
   *  their own city (issue #254). Omitted: placed anywhere in the zone, as before. */
  zoneAnchorNode?: Map<number, number>
  /** Built-in ring layout (no imported template): every neutral zone replays
   *  the SAME content roll sequence (same mine type, treasure count, pool
   *  picks, guard values) so each player's neighbouring neutral zones are
   *  worth the same (issue #254). Tile positions stay independent. */
  symmetricZones?: boolean
  /** Needed for object-variety.ts's concrete-alternative pools (real
   *  artifact sids, squad templates) — omit to keep every treasure/guard a
   *  `random-item`/`random-squad` placeholder (this function's original
   *  behavior), matching how `catalogById` alone is enough for everything
   *  else this function does. */
  catalog?: GameCatalog
  /** 0-1 chance that a given treasure/guard slot rolls a concrete, specific
   *  object (a real resource pile/artifact, or a real pre-composed army)
   *  instead of a `random-item`/`random-squad` placeholder — a real,
   *  user-reported gap ("currently it looks like there are only random
   *  items/artifacts, treasures and squads placed"). No effect if `catalog`
   *  is omitted. Defaults to 0.4. */
  objectVariety?: number
  /** Total `random-city` (neutral, non-player-owned) placements scattered
   *  across neutral zones — a real, reported gap (this generator never
   *  placed one before). Defaults to 1. */
  randomCityCount?: number
  /** Map-wide per-sid placement caps (template.ts's own doc comment has
   *  the real-game-template survey backing this shape). Applied to the
   *  concrete artifact/storage/resource picks `placeTreasure` below can
   *  make — the only named, capped-in-the-real-format sids this
   *  generator currently has a placement path for at all. */
  contentCountLimits?: { sid: string; maxCount: number }[]
  /** Issue #210 runner-up milestone — per-zone overrides parsed from a real
   *  imported game template (rmg-template-import.ts). Every map is empty
   *  when no template was picked (or a given zone has no matching real
   *  data), in which case behavior is byte-for-byte identical to before
   *  these were added. */
  /** zone id -> that zone's own real `guardCutoffValue`, replacing
   *  `GUARD_VALUE_CUTOFF` for guards placed in that specific zone. */
  guardCutoffValueByZoneId?: Map<number, number>
  /** zone id -> that zone's own real value-budget fields — see
   *  `ZoneContentValueOverrides`'s own doc comment (rmg-template-import.ts)
   *  for what each represents and how `...PerArea` is folded in. */
  zoneContentValueByZoneId?: Map<number, { guardedContentValue?: number; resourcesValue?: number }>
  /** zone id -> real per-sid placement caps scoped to just that zone,
   *  layered ON TOP OF (not replacing) the map-wide `contentCountLimits`
   *  above — an item can be blocked by either cap independently. */
  contentCountLimitsByZoneId?: Map<number, { sid: string; maxCount: number }[]>
  /** neutral zone id -> the player zone ids a candidate `random-city`
   *  placed here must have a different faction from. Replaces the default
   *  "differ from every player" rule for zones with real data. */
  neutralCityExclusionsByZoneId?: Map<number, Set<number>>
  /** zone id -> real, inline placeable sids from that zone's own
   *  `mandatoryContent[]` (second follow-up milestone) — biases which
   *  concrete artifact/storage/resource sid a treasure roll picks toward
   *  ones the template author actually specified for this zone, without
   *  forcing extra placements or overriding the existing count/budget/cap
   *  logic (see `placeTreasure`'s own doc comment). */
  mandatoryContentSidsByZoneId?: Map<number, string[]>
  /** 0 (default) = today's exact behavior (a flat round-robin cycle through
   *  MINE_TYPES with no biome awareness); 1 = the full real calibrated
   *  Sand-biome gold-mine enrichment (see SAND_GOLD_MINE_ENRICHMENT's own
   *  doc comment, issue #230); values in between blend toward it. Never
   *  changes the round-robin's own advancing state — only which sid a
   *  Sand-biome neutral zone's turn resolves to, so every OTHER zone's mine
   *  assignment is completely unaffected. */
  mineGoldBiomeBiasStrength?: number
  /** Real, placeable interactable sids the RMG is NOT allowed to pick —
   *  issue #238's own interactable browser/selector dialog. Composed into
   *  the same `isExcluded` check `placeTreasure`'s content-pool rolls
   *  already use for content caps/unsupported sids, so a disabled sid
   *  resamples into something else from the same real pool rather than
   *  silently dropping a placement. Empty/omitted (the default) is today's
   *  exact behavior — every real interactable stays eligible. */
  disabledInteractableSids?: Set<string>
}

/** Scatter each zone's own objects (see this file's header comment for what
 *  each zone kind gets), tracking collisions across the WHOLE map as it
 *  goes — not just within one zone — so a player zone's dwelling can never
 *  overlap a neighboring neutral zone's mine even where Voronoi boundaries
 *  run close together. */
export interface PopulateZonesResult {
  placements: ZonePlacement[]
  /** Guard slots that rolled a concrete army instead of `random-squad` —
   *  see `ConcreteSquadPlacement`'s own doc comment for why these are kept
   *  separate rather than folded into `placements`. */
  concreteSquads: ConcreteSquadPlacement[]
  /** Anchor nodes of objects whose guard was decided here (neutral mines,
   *  guarded treasure) — the proximity-guard pass skips them. */
  decidedNodes: Set<number>
}

export function populateZones(options: PopulateZonesOptions): PopulateZonesResult {
  const {
    sizeX, sizeZ, zones, tilesByZone, zoneBiome, catalogById, objectLogicsById, state, rng: posRng, treasureDensity = 1, catalog, objectVariety = 0.4, randomCityCount = 1, contentCountLimits = [],
    guardCutoffValueByZoneId, zoneContentValueByZoneId, contentCountLimitsByZoneId, neutralCityExclusionsByZoneId, mandatoryContentSidsByZoneId,
    mineGoldBiomeBiasStrength = 0, disabledInteractableSids, richness, difficulty, guardTuning, mines = DEFAULT_MINE_DISTRIBUTION, zoneAnchorNode, symmetricZones = false,
  } = options
  // `rng` is the CONTENT stream (what gets rolled: pool picks, guard values,
  // counts); `posRng` is the positional one (which free tile). Splitting them
  // lets neutral zones replay identical content despite differing tile layouts.
  let contentRng: () => number = posRng
  const rng = (): number => contentRng()
  const placements: ZonePlacement[] = []
  const decidedNodes = new Set<number>()
  const concreteSquads: ConcreteSquadPlacement[] = []
  // True overall span of RMG_GUARD_DIFFICULTY_RANGES' real bands (Easy
  // through Lethal) — NOT `pickSquadRange(['Random'], ...)`'s own return
  // value, which resolves 'Random' to one weighted-random SPECIFIC band
  // (e.g. 'Impossible': 20000-50000), not the literal overall span. Used
  // only to clamp a real template's own `guardedContentValue` into this
  // generator's guard-value units below.
  const guardValueBandMin = Math.min(...RMG_GUARD_DIFFICULTY_RANGES.filter((r) => r.label !== 'Random').map((r) => r.min))
  const guardValueBandMax = Math.max(...RMG_GUARD_DIFFICULTY_RANGES.filter((r) => r.label !== 'Random').map((r) => r.max))
  const contentCountLimitBySid = new Map(contentCountLimits.map((l) => [l.sid, l.maxCount]))
  const contentCountSoFar = new Map<string, number>()
  // Per-zone overlay (runner-up milestone) — reset per neutral zone below,
  // layered ON TOP OF the map-wide cap above rather than replacing it.
  let currentZoneContentLimitBySid = new Map<string, number>()
  let currentZoneContentSoFar = new Map<string, number>()
  const isAtContentCap = (sid: string): boolean => {
    const max = contentCountLimitBySid.get(sid)
    if (max !== undefined && (contentCountSoFar.get(sid) ?? 0) >= max) return true
    const zoneMax = currentZoneContentLimitBySid.get(sid)
    if (zoneMax !== undefined && (currentZoneContentSoFar.get(sid) ?? 0) >= zoneMax) return true
    return false
  }
  const recordContentPlacement = (sid: string): void => {
    if (contentCountLimitBySid.has(sid)) contentCountSoFar.set(sid, (contentCountSoFar.get(sid) ?? 0) + 1)
    if (currentZoneContentLimitBySid.has(sid)) currentZoneContentSoFar.set(sid, (currentZoneContentSoFar.get(sid) ?? 0) + 1)
  }

  const place = (sid: string, tiles: number[], randomSquadOverrides?: ZonePlacement['randomSquadOverrides'], randomItemOverrides?: ZonePlacement['randomItemOverrides'], randomCityOverrides?: ZonePlacement['randomCityOverrides'], randomHireOverrides?: ZonePlacement['randomHireOverrides']): number | null => {
    const node = tryPlace(sid, tiles, sizeX, sizeZ, catalogById, state, posRng)
    if (node === null) return null
    placements.push({ tempId: state.nextTempId++, sid, node, randomSquadOverrides, randomItemOverrides, randomCityOverrides, randomHireOverrides })
    return node
  }

  /** Places `sid` on a free tile whose distance from `anchorNode` is within
   *  1.5 of `targetDistance` — the building block for giving every player the
   *  same start layout (issue #254). Falls back to an unconstrained `place`
   *  when no such tile is free. Returns the placed node, or null. */
  const placeAtDistance = (sid: string, tiles: number[], anchorNode: number | undefined, targetDistance: number): number | null => {
    if (anchorNode !== undefined) {
      const ax = anchorNode % sizeX
      const az = Math.floor(anchorNode / sizeX)
      const ring = tiles.filter((n) => Math.abs(Math.hypot((n % sizeX) - ax, Math.floor(n / sizeX) - az) - targetDistance) <= 1.5)
      if (ring.length > 0) {
        const node = tryPlace(sid, ring, sizeX, sizeZ, catalogById, state, posRng, 40)
        if (node !== null) {
          placements.push({ tempId: state.nextTempId++, sid, node })
          return node
        }
      }
    }
    return place(sid, tiles)
  }

  /** The player start kit is rolled ONCE per generation and reused for every
   *  player (issue #254): measured over 12 seeds, per-player mine distances
   *  differed by ~60% and start-guard strength by whatever the random band
   *  produced. Distances are ranges the real maps show (see the player-zone
   *  comment below: wood/ore 3-17, dust 2-10, gold 7-45 tiles from spawn).
   *  Besides wood + ore, a start gets one extra mine only with
   *  `mines.player.extraMineChance` — the game's own maps have gold within 12
   *  tiles of only 10% of starts and a rare mine near 28%. */
  const startKit = {
    dwelling: randomInRange(3, 6, rng),
    mine_wood: randomInRange(5, 11, rng),
    mine_ore: randomInRange(5, 11, rng),
    resource_dust: randomInRange(3, 8, rng),
    extraMine: rng() < mines.player.extraMineChance ? pickWeightedMine(mines.playerExtraTypeWeights, rng) : null,
    extraMineDistance: randomInRange(9, 17, rng),
    guardRange: pickSquadRange(['Easy'], RMG_GUARD_DIFFICULTY_RANGES, RMG_GUARD_RANDOM_WEIGHTS, rng),
    guardRoll: rng(),
  }

  /** `random-item.rarity` fallback weights — the exact real distribution
   *  surveyed this session (`maps/*.map`'s own `propRandomItems.rarity`, 140
   *  rows: 88/30/19/3 for rarity 0/1/2/3). Only reached when `catalog` is
   *  absent or `rollContentPool` can't produce anything (an older Core.zip
   *  missing `Core/generator/` data entirely) — issue #240 Phase 2 made the
   *  real content-pool roll below the normal path, so this is a graceful
   *  degrade, not the primary mechanism any more. */
  const FALLBACK_RARITY_WEIGHTS = [88, 30, 19, 3]
  const pickFallbackRarity = (): number => {
    const total = FALLBACK_RARITY_WEIGHTS.reduce((sum, w) => sum + w, 0)
    let roll = rng() * total
    for (let i = 0; i < FALLBACK_RARITY_WEIGHTS.length; i++) {
      if (roll < FALLBACK_RARITY_WEIGHTS[i]) return i
      roll -= FALLBACK_RARITY_WEIGHTS[i]
    }
    return 0
  }

  /** How often a "concrete" treasure slot draws from the real `content_pool_
   *  general_resources_*` pool (storage/resource piles, zone-richness-aware)
   *  vs. the real `template_pool_random[_unguarded]_t{0-5}_base` pool
   *  (buildings/items/random-hire, value-bucket-aware) — issue #240 Phase 2.
   *  Kept at the same macro balance the old hand-split used (0.45 for
   *  storage-or-resource, 0.55 for artifact+interactable+hire combined)
   *  since nothing in the real data suggests a different top-level split;
   *  only the WITHIN-branch distribution is now real instead of guessed. */
  const RESOURCE_POOL_SHARE = 0.45
  /** Within the "building" branch, how often this slot rolls from the real
   *  GUARDED pool (gets its own guard below) vs. the UNGUARDED one — real
   *  data (`template_pools_random_t2.json` vs `..._unguarded_t2.json`,
   *  diffed in Phase 2) shows items/pandora/scroll-boxes/epic-interact are
   *  zeroed out entirely in the unguarded variant (guarded-by-nature
   *  content, not a squad toggle), while ordinary buildings/random-hire are
   *  unaffected — so this share is really "how often this slot becomes one
   *  of the guarded-only categories (incl. a real artifact pick) instead of
   *  a bare building". Phase 2 had no real measured ratio for this and used
   *  a conservative 0.35 guess; issue #240 Phase 3 found one:
   *  `zone_layouts/default_zone_layouts.json`'s own `guardedEncounterDencity`
   *  (1.4) vs `unguardedEncounterDencity` (1) — real relative site-density
   *  figures for exactly this guarded-vs-unguarded split — giving a real
   *  ratio of 1.4/(1.4+1) ≈ 0.58. Falls back to the old 0.35 guess only when
   *  `rmgZoneLayout` is unavailable (the static fallback catalog, or an
   *  older Core.zip missing this file). The tuning file's
   *  `guards.chance.treasure` replaces it. */
  const GUARDED_TREASURE_SHARE = guardTuning?.chance.treasure ?? defaultTreasureGuardShare(catalog)

  /** issue #240 Phase 2 — the real `content_pool_general_resources_*`/
   *  `template_pool_random_t{0-5}_*` pool families are both explicitly
   *  richness-tiered (`very_poor/poor/medium/rich` resp. t0-t5's sliding
   *  value-bucket curve — see rmg-core-generator-data-research.md §2/§5),
   *  but this generator has no dedicated "Map Richness" UI control matching
   *  the real game's own 4-option selector yet. `richness01` folds the two
   *  EXISTING dials that already proxy richness — `treasureDensity` (0-3
   *  map-wide slider) and `treasureScale` (0.4-2.5 per-zone relative
   *  richness from a real imported template, 1 when none) — into one 0-1
   *  value, then into each real tier system's own discrete buckets. Revisit
   *  with a real dedicated slider if/when that UI work happens. Reset per
   *  neutral zone below (`treasureScale` is itself zone-specific), same
   *  "mutable, reassigned per zone" pattern as `currentZoneContentLimitBySid`
   *  above. */
  let currentRichnessLabel = 'medium'
  let currentBuildingTier = 2

  /** A treasure slot: with `objectVariety` probability rolls a real sid
   *  straight out of the real content-pool system (`object-variety.ts`'s
   *  `rollContentPool`/`resolveContentPoolPick`) — real per-sid weights,
   *  real value-bucket gating, real guarded/unguarded composition
   *  differences, replacing this generator's old hand-guessed `RARITY_TABLE`
   *  and hand-split artifact/storage/interactable branches entirely (issue
   *  #240 Phase 2). Falls back to a flat `random-item` placement (real
   *  surveyed rarity weights, see `FALLBACK_RARITY_WEIGHTS`) when no catalog
   *  is available or a roll comes back empty. `usedArtifactSids` (per-zone)
   *  mirrors Olden Era's own real RMG templates' `contentCountLimits`
   *  `maxCount: 1` pattern for named/notable objects. */
  const placeTreasure = (tiles: number[], usedArtifactSids: Set<string>, biome: BiomeId, guardCutoff: number, preferredSids?: Set<string>): void => {
    if (catalog && rng() < objectVariety) {
      const isExcluded = (sid: string): boolean => isAtContentCap(sid) || UNSUPPORTED_CONTENT_POOL_SIDS.has(sid) || isRmgIneligibleInteractableSid(sid) || (disabledInteractableSids?.has(sid) ?? false)
      if (rng() < RESOURCE_POOL_SHARE) {
        const sid = rollContentPool(catalog, `content_pool_general_resources_treasure_zone_${currentRichnessLabel}`, rng, isExcluded)
        if (sid) {
          recordContentPlacement(sid)
          place(sid, tiles)
          return
        }
      } else {
        const guarded = rng() < GUARDED_TREASURE_SHARE
        const poolName = `template_pool_random${guarded ? '' : '_unguarded'}_t${currentBuildingTier}_base`
        const rolled = rollContentPool(catalog, poolName, rng, isExcluded)
        const resolved = rolled ? resolveContentPoolPick(rolled, catalog, usedArtifactSids, preferredSids, isAtContentCap, rng) : null
        if (resolved) {
          recordContentPlacement(resolved.sid)
          const treasureNode = place(resolved.sid, tiles, undefined, resolved.randomItemOverrides, undefined, resolved.randomHireOverrides)
          if (guarded && treasureNode !== null) {
            decidedNodes.add(treasureNode)
            const guardValue = resolved.guardValue ?? resolveGoodsValue(catalog, resolved.sid)
            if (guardValue !== undefined) placeGuard(tiles, guardValue, sampleFraction(biome, 0.5, rng), guardCutoff, { sid: resolved.sid, node: treasureNode })
          }
          return
        }
      }
    }
    place('random-item', tiles, undefined, { rarity: pickFallbackRarity() })
  }

  /** A guard slot: usually `random-squad`, but with a heavily-scaled-down
   *  `objectVariety` chance (`GUARD_CONCRETE_SQUAD_CHANCE_SCALE` —
   *  guard-value-bands.ts's own doc comment has the real-map evidence) places
   *  a real, pre-composed `squads[]` army instead, picked by
   *  `pickSquadTemplate` to roughly match `requestedValue`/`fraction` the
   *  same way a `random-squad` roll would have. Falls back to `random-squad`
   *  if no matching template exists or the zone has no free tile left for
   *  it. Below `cutoff` (defaults to `GUARD_VALUE_CUTOFF` — Olden Era's own
   *  real RMG templates' `guardCutoffValue` concept, overridden per-zone
   *  with that zone's own real value when a template provides one — issue
   *  #210 runner-up milestone), no guard is placed at all — the resource
   *  stays free rather than getting a near-worthless guard.
   *
   *  With a `target` (the object this guard protects), the guard stands at
   *  that object's entrance (`entranceGuardTile`) so it blocks it; when no
   *  tile there is free, no guard is placed — never one standing alone
   *  somewhere in the zone. Without a target: anywhere in the zone. */
  const placeGuard = (tiles: number[], baseValue: number, fraction: string, cutoff: number = GUARD_VALUE_CUTOFF, target?: { sid: string; node: number }): void => {
    // Difficulty scales the value before the cutoff check, like the game's
    // own perProgressionPointZoneGuardValue (level 0 = ×1, unchanged).
    const requestedValue = difficulty ? Math.round(baseValue * difficulty.zoneGuardMultiplier) : baseValue
    if (requestedValue < cutoff) return
    const guardTile = target ? entranceGuardTile(target.sid, target.node, sizeX, sizeZ, catalogById, state, posRng) : null
    if (catalog && rng() < objectVariety * GUARD_CONCRETE_SQUAD_CHANCE_SCALE) {
      const template = pickSquadTemplate(catalog, fraction, requestedValue, rng)
      if (template) {
        const node = target ? guardTile : pickFreeTile(tiles, state, posRng)
        if (node !== null) {
          state.usedAnchors.add(node)
          concreteSquads.push({ tempId: state.nextTempId++, sid: template.id, node })
          return
        }
      }
    }
    const overrides = { requestedValue, fraction, weeklyIncrementBonus: difficulty?.zoneGuardWeeklyIncrement }
    if (guardTile !== null && tryPlaceAt('random-squad', guardTile, sizeX, sizeZ, catalogById, state)) {
      placements.push({ tempId: state.nextTempId++, sid: 'random-squad', node: guardTile, randomSquadOverrides: overrides })
      return
    }
    if (!target) place('random-squad', tiles, overrides)
  }

  /** A neutral zone's mine guard, standing at the mine's entrance. Decided
   *  here and recorded in `decidedNodes`, so the proximity-guard pass
   *  (zone-guard-scatter.ts) doesn't roll for the same mine again. Chance:
   *  the tuning file's (per sid, else `mine`), else always — this guard has
   *  always been placed. The roll uses the positional stream so symmetric
   *  neutral zones (which replay one content stream) don't all get the same
   *  result.
   *
   *  The guard's value comes from the mine's own real guard-value data when
   *  available (value-model.ts, scaled up to real hand-crafted maps' own
   *  median guard-value band) — not a flat difficulty-band roll — so a gold
   *  mine is still defended harder than a wood mine, falling back to the
   *  flat roll only if this Core.zip has no matching objects_logic entry.
   *  A real imported template's own `guardedContentValue` for the zone takes
   *  priority over both (the template author's explicit design), clamped
   *  into RMG_GUARD_DIFFICULTY_RANGES' overall span (400-150000) — its value
   *  scale matches this generator's guard `requestedValue` units. */
  const placeMineGuard = (zoneId: number, tiles: number[], biome: BiomeId, mineSid: string, mineNode: number): void => {
    decidedNodes.add(mineNode)
    const chance = guardTuning?.chanceBySid[mineSid] ?? guardTuning?.chance.mine ?? 1
    if (chance < 1 && posRng() >= chance) return
    const fallbackRange = pickSquadRange(['Random'], RMG_GUARD_DIFFICULTY_RANGES, RMG_GUARD_RANDOM_WEIGHTS, rng)
    const templateGuardedValue = zoneContentValueByZoneId?.get(zoneId)?.guardedContentValue
    const requestedValue = templateGuardedValue !== undefined
      ? Math.min(guardValueBandMax, Math.max(guardValueBandMin, Math.round(templateGuardedValue)))
      : mineGuardValue(mineSid, objectLogicsById) ?? randomInRange(fallbackRange.min, fallbackRange.max, rng)
    placeGuard(tiles, requestedValue, sampleFraction(biome, 0.5, rng), guardCutoffValueByZoneId?.get(zoneId) ?? GUARD_VALUE_CUTOFF, { sid: mineSid, node: mineNode })
  }

  // Per-zone treasure-budget scaling from a real template's own
  // resourcesValue (+ resourcesValuePerArea) — issue #210 runner-up
  // milestone. Applied RELATIVE to the median across every neutral zone in
  // this variant, not the raw absolute number: real values are on a totally
  // different scale than this generator's own synthetic RARITY_TABLE cost
  // budget (there's no real per-item value data in this generator's own
  // catalog to spend the literal number against), so a zone richer/poorer
  // than its siblings gets proportionally more/less treasure instead.
  // `medianResourceValue` stays undefined (every zone's scale stays exactly
  // 1, unchanged from before this milestone) whenever no template provided
  // this data at all. Built-in layouts (zones carry a `role`) give values
  // already relative to an ordinary zone's 1 (zone-archetypes.ts
  // ROLE_TREASURE_SCALE), so their baseline is 1, not the median — in a
  // layout where half the neutral zones are pockets the median would be the
  // pocket value and shrink every ordinary zone instead.
  const neutralResourceValues = zones
    .filter((z) => z.kind === 'neutral')
    .map((z) => zoneContentValueByZoneId?.get(z.id)?.resourcesValue)
    .filter((v): v is number => v !== undefined && v > 0)
    .sort((a, b) => a - b)
  const medianResourceValue = zones.some((z) => z.role !== undefined)
    ? 1
    : neutralResourceValues.length > 0 ? neutralResourceValues[Math.floor(neutralResourceValues.length / 2)] : undefined

  const neutralContentSeed = Math.floor(posRng() * 0x7fffffff)
  const playerContentSeed = Math.floor(posRng() * 0x7fffffff)
  // Symmetric content is replayed per neutral ROLE (between/inner/center/
  // pocket — zone-archetypes.ts): zones with the same role get identical
  // content and share one mean tile count; different roles differ.
  const roleOf = (z: ZoneSpec): NeutralZoneRole => z.role ?? 'between'
  const roleSeed = (role: NeutralZoneRole): number => (neutralContentSeed + NEUTRAL_ROLES.indexOf(role) * 0x9e3779b1) % 0x7fffffff
  const meanNeutralTilesByRole = new Map<NeutralZoneRole, number>()
  for (const role of NEUTRAL_ROLES) {
    const counts = zones.filter((z) => z.kind === 'neutral' && roleOf(z) === role).map((z) => tilesByZone.get(z.id)?.length ?? 0)
    if (counts.length > 0) meanNeutralTilesByRole.set(role, Math.round(counts.reduce((a, b) => a + b, 0) / counts.length))
  }
  for (const zone of zones) {
    const tiles = tilesByZone.get(zone.id) ?? []
    if (tiles.length === 0) continue
    contentRng = symmetricZones ? createSeededRng(zone.kind === 'neutral' ? roleSeed(roleOf(zone)) : playerContentSeed) : posRng
    const biome = zoneBiome.get(zone.id) ?? ZONE_BIOMES[0]

    if (zone.kind === 'player') {
      const cityNode = zoneAnchorNode?.get(zone.id)
      const dwellingSid = `barracks_${dwellingFactionToken(biome)}_1`
      const dwellingNode = placeAtDistance(dwellingSid, tiles, cityNode, startKit.dwelling)

      // Every player start needs its own wood + ore mine (this game's real
      // "wood + ore" building-cost pair — there is no `mine_stone`) and a
      // dust source (required to upgrade troops) — confirmed by measuring
      // real spawn-to-nearest-mine distance across all three analyzed maps:
      // EVERY player spawn in Broken_Alliance.map, Prisoners.map, and
      // The_Mysterious_Island.map has a wood mine and an ore mine within
      // 3-17 tiles, and a dust source within 2-10 tiles (`resource_dust`, or
      // `storage_dust` on the largest map). Gold is NOT guaranteed: across
      // the game's 9 official maps with mines only 10% of starts have gold
      // within 12 tiles (it mostly sits 12-25 tiles out, in neighbouring
      // zones) — so a start gets one optional extra mine instead
      // (`startKit.extraMine`: gold or gemstones/crystals/mercury, at 9-17
      // tiles). Deliberately still just ONE shared light guard for
      // the whole player zone (unchanged from before this fix) rather than
      // one per resource — a real regeneration/stats pass found that
      // guarding each of the 4 resources separately (at Easy strength)
      // diluted the map-wide guard-value median on small maps just from
      // sheer guard-count volume, and the user's own request was about
      // resource PRESENCE at player start, not guard density there.
      for (const mineSid of ['mine_wood', 'mine_ore'] as const) placeAtDistance(mineSid, tiles, cityNode, startKit[mineSid])
      if (startKit.extraMine) placeAtDistance(startKit.extraMine, tiles, cityNode, startKit.extraMineDistance)
      placeAtDistance('resource_dust', tiles, cityNode, startKit.resource_dust)
      const range = startKit.guardRange
      // PLAYER_ZONE_GUARD_MULTIPLIER: real RMG templates' own spawn-zone
      // guardMultiplier (0.5-0.84) softens guards in the player's own start
      // zone specifically — guard-value-bands.ts's own doc comment has the
      // full rationale. The guard stands at the start dwelling's entrance (a
      // guard alone in the open guards nothing), and the proximity pass then
      // skips the dwelling. No dwelling → no start guard.
      if (dwellingNode !== null) {
        decidedNodes.add(dwellingNode)
        placeGuard(
          tiles,
          Math.round((range.min + startKit.guardRoll * (range.max - range.min)) * PLAYER_ZONE_GUARD_MULTIPLIER),
          sampleFraction(biome, 0.8, rng),
          guardCutoffValueByZoneId?.get(zone.id) ?? GUARD_VALUE_CUTOFF,
          { sid: dwellingSid, node: dwellingNode },
        )
      }
    } else {
      // Runner-up milestone: this zone's own real per-sid caps (if any),
      // layered on top of the map-wide `contentCountLimitBySid` above —
      // reset fresh per zone since a cap here is scoped to just this zone.
      currentZoneContentLimitBySid = new Map((contentCountLimitsByZoneId?.get(zone.id) ?? []).map((l) => [l.sid, l.maxCount]))
      currentZoneContentSoFar = new Map()
      const mandatorySids = mandatoryContentSidsByZoneId?.get(zone.id)
      const preferredTreasureSids = mandatorySids && mandatorySids.length > 0 ? new Set(mandatorySids) : undefined

      // Mines, like the game's own maps (6-13 per player, ~40% gemstones/
      // crystals/mercury — see rmg-tuning.ts DEFAULT_MINE_DISTRIBUTION): one
      // per `tilesPerMine` zone tiles, clamped to min..max, types drawn by
      // weight without repeats until every type was used. In symmetric
      // layouts the count comes from the role's mean zone size and the draw
      // from the role's content stream, so same-role zones get the same set.
      const mineZoneTiles = symmetricZones ? meanNeutralTilesByRole.get(roleOf(zone)) ?? tiles.length : tiles.length
      const mineCount = Math.min(mines.neutral.max, Math.max(mines.neutral.min, Math.round(mineZoneTiles / mines.neutral.tilesPerMine)))
      const placedMineNodes: number[] = []
      for (const drawnSid of drawMineTypes(mineCount, mines.neutralTypeWeights, rng)) {
        // Sand-biome gold-mine enrichment (issue #230) — an extra override
        // roll per mine, only consumed when biome is Sand AND the strength
        // option is active, so every other zone takes the same rng() path.
        const goldChance = clamp01((1 / MINE_TYPES.length) * scaleMultiplier(SAND_GOLD_MINE_ENRICHMENT, mineGoldBiomeBiasStrength))
        const mineSid = mineGoldBiomeBiasStrength > 0 && biome === SAND_BIOME_ID && rng() < goldChance ? 'mine_gold' : drawnSid
        // Spread the zone's mines out: prefer tiles MINE_SPACING away from
        // the ones already placed; any tile when the zone has no such room.
        const spaced = placedMineNodes.length === 0
          ? tiles
          : tiles.filter((n) => placedMineNodes.every((m) => Math.max(Math.abs((n % sizeX) - (m % sizeX)), Math.abs(Math.floor(n / sizeX) - Math.floor(m / sizeX))) >= MINE_SPACING))
        const mineNode = (spaced.length > 0 ? place(mineSid, spaced) : null) ?? place(mineSid, tiles)
        if (mineNode === null) continue
        placedMineNodes.push(mineNode)
        placeMineGuard(zone.id, tiles, biome, mineSid, mineNode)
      }

      // Per-zone treasure density: bigger Voronoi regions (more tiles) get
      // proportionally more treasure piles, scaled again by the template's
      // own `treasureDensity` multiplier — issue #210's own "per-zone
      // treasure density tuning" milestone item. The cap here used to be a
      // flat 10, tuned against a typical ~64x64/4-player zone (a few
      // hundred tiles) — a real user report ("hardly any resources despite
      // cranking density to max") traced to that cap silently dominating on
      // a LARGER map: this generator's own zone COUNT depends only on
      // player count (`buildZoneGraph`), never map size, so a big map at a
      // low player count has proportionally huge zones the old cap-of-10
      // choked down to the same handful of items a much smaller zone got.
      // Verified against real sample maps (`maps/*.map`, 12 files with
      // treasure data): real density ranges ~100-800 tiles per treasure
      // item. Removing the low cap (raised instead to a generous safety
      // ceiling, not a tuning target) and keeping the same per-150-tiles
      // base rate reproduces that real range at both ends — a 256x256/
      // 2-player map's own ~13,000-tile neutral zones land at ~372
      // tiles/item at treasureDensity=1 and ~124 at treasureDensity=3,
      // matching real maps The_Mysterious_Island.map (386) and
      // Fun_and_Graves.map (123) almost exactly — while a typical smaller
      // zone's own count is unchanged (the cap essentially never fired for
      // realistic zone sizes anyway).
      const baseTreasureCount = 1 + Math.floor((symmetricZones ? meanNeutralTilesByRole.get(roleOf(zone)) ?? tiles.length : tiles.length) / 150)

      // `treasureScale`: this zone's own real `resourcesValue` relative to
      // its neutral-zone siblings (see `medianResourceValue` above) — a
      // "Poor" template zone gets proportionally less, a "Rich" one
      // proportionally more, clamped to a sane range so one extreme outlier
      // zone can't blow the loop's iteration count. Stays exactly 1 (no
      // change) whenever no template provided this data.
      const zoneResourceValue = zoneContentValueByZoneId?.get(zone.id)?.resourcesValue
      const treasureScale = medianResourceValue !== undefined && zoneResourceValue !== undefined
        ? Math.min(2.5, Math.max(0.4, zoneResourceValue / medianResourceValue))
        : 1
      // issue #240 Phase 2: this zone's own richness label/tier, consumed by
      // `placeTreasure`'s real content-pool rolls above (`currentRichnessLabel`
      // doc comment has the full reasoning) — recomputed per neutral zone
      // since `treasureScale` itself is zone-specific.
      const zoneRichness01 = clamp01((treasureDensity * treasureScale) / 3)
      // No `treasure_zone_very_poor` pool exists in Core/generator (only
      // zero/poor/medium/rich), so the lowest bucket uses `poor`.
      currentRichnessLabel = richness ? richness.pool : zoneRichness01 < 0.5 ? 'poor' : zoneRichness01 < 0.75 ? 'medium' : 'rich'
      currentBuildingTier = richness ? richness.tier : Math.round(zoneRichness01 * 5)
      // A deterministic item count, not a probabilistic value-budget spend —
      // issue #240 Phase 2 removed `RARITY_AVERAGE_COST`'s role as a per-item
      // "cost" unit (there's no real per-item cost figure once sampling
      // directly from the real, mixed-category content pools above), so the
      // loop now just runs this many times directly. Still reproduces the
      // same real-map-calibrated density `baseTreasureCount` documents above.
      const treasureCount = Math.max(0, Math.round(baseTreasureCount * treasureDensity * treasureScale))
      const usedArtifactSids = new Set<string>()
      for (let i = 0; i < treasureCount; i++) {
        placeTreasure(tiles, usedArtifactSids, biome, guardCutoffValueByZoneId?.get(zone.id) ?? GUARD_VALUE_CUTOFF, preferredTreasureSids)
      }
    }
  }

  // Neutral random-city placement (a real, reported gap — this generator
  // never placed one before). Real-game-template survey (`maps/templates/
  // *.rmg.json`'s own `mainObjects: [{type:"City", faction:{type:"FromList",
  // args:["differentFrom: 0 Spawn-A", ...]}}]`) confirms a neutral city's
  // faction should differ from every player's own — never just re-derived
  // from the zone's own biome, and never left blank (CLAUDE.md's own
  // documented "unconfigured random-city never verified in-game" trap,
  // confirmed again this session: a real GME-added sample in `maps/
  // Stormlight_saved_by_gme.map` is exactly `isDefined:false,factionSid:""`).
  // Runner-up milestone: a zone with real `differentFrom` data
  // (`neutralCityExclusionsByZoneId`) uses THAT specific, narrower
  // constraint instead of "differ from every player" — confirmed narrower
  // in every real sample checked (`Pyramid.rmg.json`: a Treasure zone
  // between two spawns only excludes those two factions, not every player
  // in the game).
  if (randomCityCount > 0) {
    const neutralZones = zones.filter((z) => z.kind === 'neutral')
    const playerFactions = new Set(
      zones.filter((z) => z.kind === 'player').map((z) => BIOME_FACTION[zoneBiome.get(z.id) ?? 1]).filter((f): f is string => !!f),
    )
    const allFactions = ZONE_BIOMES.map((b) => BIOME_FACTION[b]).filter((f): f is string => !!f)
    contentRng = posRng
    const remainingZones = [...neutralZones]
    for (let i = 0; i < randomCityCount && remainingZones.length > 0; i++) {
      const zoneIndex = Math.floor(rng() * remainingZones.length)
      const [zone] = remainingZones.splice(zoneIndex, 1)
      const tiles = tilesByZone.get(zone.id) ?? []
      if (tiles.length === 0) continue
      const exclusions = neutralCityExclusionsByZoneId?.get(zone.id)
      const excludedFactions = exclusions && exclusions.size > 0
        ? new Set([...exclusions].map((pid) => BIOME_FACTION[zoneBiome.get(pid) ?? 1]).filter((f): f is string => !!f))
        : playerFactions
      const availableFactions = allFactions.filter((f) => !excludedFactions.has(f))
      const factionPool = availableFactions.length > 0 ? availableFactions : allFactions
      const factionSid = factionPool[Math.floor(rng() * factionPool.length)]
      // Always false, not a coin flip: RANDOM_CITY_DEFAULT_TABLES writes
      // spawnHero straight onto propCities with no mechanism to add the
      // matching propHeroes row spawnHero:true requires (unlike
      // setCitySpawnHero(), which keeps that pairing in sync) — confirmed via
      // real player.log testing that a spawnHero:true city with no propHeroes
      // entry freezes the game at 100% load. Giving some neutral cities a
      // real garrison hero is a legitimate future feature, but needs its own
      // setCitySpawnHero()-based wiring (using the ids addObjectInstances
      // returns) to stay invariant-safe — not a bare boolean here.
      const spawnHero = false
      const cityNode = place('random-city', tiles, undefined, undefined, { factionSid, spawnHero })
      // The game's BasicCity main object: a guard with difficulty-dependent
      // chance/value/growth (map_schemas/Default.mrmg.json), standing in
      // front of the city's entrance (the tile tryPlaceAt reserved).
      if (cityNode !== null) decidedNodes.add(cityNode)
      const cityGuardChance = guardTuning?.chanceBySid['random-city'] ?? guardTuning?.chance.randomCity ?? difficulty?.cityGuardChance ?? 0
      if (cityNode !== null && difficulty && rng() < cityGuardChance) {
        const guardNode = entranceGuardTile('random-city', cityNode, sizeX, sizeZ, catalogById, state, posRng)
        if (guardNode !== null && tryPlaceAt('random-squad', guardNode, sizeX, sizeZ, catalogById, state)) {
          placements.push({
            tempId: state.nextTempId++, sid: 'random-squad', node: guardNode,
            randomSquadOverrides: {
              requestedValue: difficulty.cityGuardValue,
              fraction: sampleFraction(zoneBiome.get(zone.id) ?? 1, 0.5, rng),
              weeklyIncrementBonus: difficulty.cityGuardWeeklyIncrement,
            },
          })
        }
      }
    }
  }

  return { placements, concreteSquads, decidedNodes }
}
