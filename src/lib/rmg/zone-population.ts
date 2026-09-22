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

import type { CatalogMapObject, CatalogObjectLogic, GameCatalog } from '@/lib/catalog/types'
import type { BiomeId } from '@/lib/map-grid/terrain-colors'
import {computeFootprintTiles, protectedNeighborNodes} from '@/lib/map-grid/footprint'
import { NON_BLOCKING_SPAWNER_SIDS } from '@/lib/map-grid/passability'
import {
  BIOME_FACTION,
  pickSquadRange,
  randomInRange,
  sampleFraction,
} from '@/lib/map-grid/squad-pool'
import { GUARD_CONCRETE_SQUAD_CHANCE_SCALE, GUARD_VALUE_CUTOFF, PLAYER_ZONE_GUARD_MULTIPLIER, RMG_GUARD_DIFFICULTY_RANGES, RMG_GUARD_RANDOM_WEIGHTS } from './guard-value-bands'
import { collectArtifactSids, pickInteractableSid, pickSquadTemplate, RESOURCE_SIDS, STORAGE_SIDS } from './object-variety'
import { mineGuardValue } from './value-model'
import type { ZoneSpec } from './zone-graph'

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

/** All 6 real resource mine sids (Core/DB/map/objects/4_interactables.json)
 *  — cycled through neutral zones for variety. */
const MINE_SIDS = ['mine_wood', 'mine_ore', 'mine_gold', 'mine_gemstones', 'mine_crystals', 'mine_mercury']

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
}

export function createPlacementState(seedBlocked: Set<number>, seedAnchors: Set<number>): PlacementState {
  return { blocked: new Set(seedBlocked), usedAnchors: new Set(seedAnchors), nextTempId: 0 }
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
  const template = catalogById.get(sid)
  const nonBlocking = NON_BLOCKING_SPAWNER_SIDS.has(sid)
  const x = node % sizeX
  const z = Math.floor(node / sizeX)
  const cells = computeFootprintTiles(template, x, z)
  for (const cell of cells) {
    if (cell.x < 0 || cell.x >= sizeX || cell.z < 0 || cell.z >= sizeZ) return false
    if (!nonBlocking && cell.value === 1 && state.blocked.has(cell.z * sizeX + cell.x)) return false
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
}

export function populateZones(options: PopulateZonesOptions): PopulateZonesResult {
  const {
    sizeX, sizeZ, zones, tilesByZone, zoneBiome, catalogById, objectLogicsById, state, rng, treasureDensity = 1, catalog, objectVariety = 0.4, randomCityCount = 1, contentCountLimits = [],
    guardCutoffValueByZoneId, zoneContentValueByZoneId, contentCountLimitsByZoneId, neutralCityExclusionsByZoneId, mandatoryContentSidsByZoneId,
  } = options
  const placements: ZonePlacement[] = []
  const concreteSquads: ConcreteSquadPlacement[] = []
  const artifactSids = catalog ? collectArtifactSids(catalog) : []
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

  const place = (sid: string, tiles: number[], randomSquadOverrides?: ZonePlacement['randomSquadOverrides'], randomItemOverrides?: ZonePlacement['randomItemOverrides'], randomCityOverrides?: ZonePlacement['randomCityOverrides']): void => {
    const node = tryPlace(sid, tiles, sizeX, sizeZ, catalogById, state, rng)
    if (node === null) return
    placements.push({ tempId: state.nextTempId++, sid, node, randomSquadOverrides, randomItemOverrides, randomCityOverrides })
  }

  /** `random-item.rarity` "cost" table for the value-budget treasure loop
   *  below — weights are the exact real distribution surveyed this session
   *  (`maps/*.map`'s own `propRandomItems.rarity`, 140 rows: 88/30/19/3 for
   *  rarity 0/1/2/3), matching Olden Era's own real RMG templates'
   *  "spend a value budget on progressively rarer things" shape
   *  (`guardedContentValue`/`resourcesValue` in `maps/templates/*.rmg.json`)
   *  instead of this generator's old flat `rarity: 0` for every placement.
   *  `cost` itself is a synthetic increasing scale (not real data — there's
   *  no real per-rarity "value" field to read) chosen only so pricier
   *  rarities are rolled less often, same spirit as `zone-boundary.ts`'s own
   *  `depthToDifficultyLabel` doc comment on synthetic-but-reasonable
   *  defaults. */
  const RARITY_TABLE = [
    { rarity: 0, weight: 88, cost: 1 },
    { rarity: 1, weight: 30, cost: 2 },
    { rarity: 2, weight: 19, cost: 4 },
    { rarity: 3, weight: 3, cost: 10 },
  ]
  const RARITY_TOTAL_WEIGHT = RARITY_TABLE.reduce((sum, r) => sum + r.weight, 0)
  /** Expected cost of one `pickRarity` roll — used as every OTHER treasure
   *  kind's (concrete pile/artifact) budget cost too, so which branch a given
   *  budget iteration takes doesn't itself skew the loop's average
   *  iteration count away from the real density this generator already
   *  calibrated last session (see `baseTreasureCount`'s own doc comment). */
  const RARITY_AVERAGE_COST = RARITY_TABLE.reduce((sum, r) => sum + (r.weight / RARITY_TOTAL_WEIGHT) * r.cost, 0)
  const pickRarity = (): { rarity: number; cost: number } => {
    let roll = rng() * RARITY_TOTAL_WEIGHT
    for (const r of RARITY_TABLE) {
      if (roll < r.weight) return r
      roll -= r.weight
    }
    return RARITY_TABLE[0]
  }

  /** A treasure slot: usually `random-item` (now with a real, varied
   *  `rarity` roll instead of a flat 0 — see `RARITY_TABLE`'s own doc
   *  comment), but with `objectVariety` probability places a real resource
   *  pile or a real artifact instead (`object-variety.ts`) — the
   *  user-reported "only random items" gap. Returns the budget cost this
   *  placement spent, for the value-budget loop below. `usedArtifactSids`
   *  (per-zone) mirrors Olden Era's own real RMG templates'
   *  `contentCountLimits` `maxCount: 1` pattern for named/notable objects —
   *  a specific artifact can't repeat within one zone purely by chance;
   *  ordinary storage/resource piles are NOT capped, matching how real
   *  templates only cap notable objects, not plain resources. */
  const placeTreasure = (tiles: number[], usedArtifactSids: Set<string>, preferredSids?: Set<string>): number => {
    if (catalog && rng() < objectVariety) {
      const availableArtifacts = artifactSids.filter((sid) => !usedArtifactSids.has(sid) && !isAtContentCap(sid))
      // Three-way split for what a "concrete" treasure slot becomes: artifact
      // / storage-or-resource / interactable building. The interactable
      // branch is new (issue #210 follow-up — user-reported "RMG never
      // places anything but dwellings/mines/storage piles"; before this,
      // nothing in this function ever sampled `object-variety.ts`'s
      // `pickInteractableSid` pool at all). Weights (0.3/0.45/0.25)
      // approximate real RMG templates' own content-pool mixing ratios
      // (`pickInteractableSid`'s own doc comment has the real-data source),
      // well above the previous 0% for interactables.
      const branchRoll = rng()
      if (availableArtifacts.length > 0 && branchRoll < 0.3) {
        // Bias toward a real per-zone `mandatoryContent` sid when this
        // zone has one available (issue #210 second follow-up milestone) —
        // real, template-authored "this zone should have this" data,
        // without forcing an extra placement or disturbing the existing
        // count/budget logic. 0.7 (not 1.0) so a mismatched/emptied
        // preference list never fully starves the normal random variety.
        const preferredArtifacts = preferredSids ? availableArtifacts.filter((sid) => preferredSids.has(sid)) : []
        const artifactPool = preferredArtifacts.length > 0 && rng() < 0.7 ? preferredArtifacts : availableArtifacts
        const sid = artifactPool[Math.floor(rng() * artifactPool.length)]
        usedArtifactSids.add(sid)
        recordContentPlacement(sid)
        place(sid, tiles)
        return RARITY_AVERAGE_COST
      }
      if (branchRoll < 0.75) {
        const concretePool = (rng() < 0.5 ? STORAGE_SIDS : RESOURCE_SIDS).filter((sid) => !isAtContentCap(sid))
        if (concretePool.length > 0) {
          const preferredConcrete = preferredSids ? concretePool.filter((sid) => preferredSids.has(sid)) : []
          const pool = preferredConcrete.length > 0 && rng() < 0.7 ? preferredConcrete : concretePool
          const sid = pool[Math.floor(rng() * pool.length)]
          recordContentPlacement(sid)
          place(sid, tiles)
          return RARITY_AVERAGE_COST
        }
      } else {
        const sid = pickInteractableSid(rng, isAtContentCap)
        if (sid) {
          recordContentPlacement(sid)
          place(sid, tiles)
          return RARITY_AVERAGE_COST
        }
      }
    }
    const { rarity, cost } = pickRarity()
    place('random-item', tiles, undefined, { rarity })
    return cost
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
   *  stays free rather than getting a near-worthless guard. */
  const placeGuard = (tiles: number[], requestedValue: number, fraction: string, cutoff: number = GUARD_VALUE_CUTOFF): void => {
    if (requestedValue < cutoff) return
    if (catalog && rng() < objectVariety * GUARD_CONCRETE_SQUAD_CHANCE_SCALE) {
      const template = pickSquadTemplate(catalog, fraction, requestedValue, rng)
      if (template) {
        const node = pickFreeTile(tiles, state, rng)
        if (node !== null) {
          concreteSquads.push({ tempId: state.nextTempId++, sid: template.id, node })
          return
        }
      }
    }
    place('random-squad', tiles, { requestedValue, fraction })
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
  // this data at all.
  const neutralResourceValues = zones
    .filter((z) => z.kind === 'neutral')
    .map((z) => zoneContentValueByZoneId?.get(z.id)?.resourcesValue)
    .filter((v): v is number => v !== undefined && v > 0)
    .sort((a, b) => a - b)
  const medianResourceValue = neutralResourceValues.length > 0 ? neutralResourceValues[Math.floor(neutralResourceValues.length / 2)] : undefined

  let mineIndex = 0
  for (const zone of zones) {
    const tiles = tilesByZone.get(zone.id) ?? []
    if (tiles.length === 0) continue
    const biome = zoneBiome.get(zone.id) ?? ZONE_BIOMES[0]

    if (zone.kind === 'player') {
      place(`barracks_${dwellingFactionToken(biome)}_1`, tiles)

      // Every player start needs its own wood + ore mine (this game's real
      // "wood + ore" building-cost pair — there is no `mine_stone`), a gold
      // mine, and a dust source (required to upgrade troops) — confirmed by
      // measuring real spawn-to-nearest-mine distance across all three
      // analyzed maps: EVERY player spawn in Broken_Alliance.map,
      // Prisoners.map, and The_Mysterious_Island.map has a wood mine and an
      // ore mine within 3-17 tiles, and a dust source within 2-10 tiles
      // (`resource_dust`, or `storage_dust` on the largest map) — this used
      // to place only ONE mine, alternating wood/ore by an incrementing
      // index, so roughly half of all generated starts got no wood mine (or
      // no ore mine) and none ever got a guaranteed gold mine or dust
      // source at all. Gold is guaranteed too (present in real maps, though
      // consistently farther out than wood/ore — 7-45 tiles — matching a
      // real, less-adjacent economic role rather than a starter resource).
      // Mercury/crystals/gemstones need no such guarantee — real maps show
      // no consistent near-spawn pattern for them, matching their own
      // "nice to have" framing; they still come from bordering neutral
      // zones unforced. Deliberately still just ONE shared light guard for
      // the whole player zone (unchanged from before this fix) rather than
      // one per resource — a real regeneration/stats pass found that
      // guarding each of the 4 resources separately (at Easy strength)
      // diluted the map-wide guard-value median on small maps just from
      // sheer guard-count volume, and the user's own request was about
      // resource PRESENCE at player start, not guard density there.
      for (const mineSid of ['mine_wood', 'mine_ore', 'mine_gold']) place(mineSid, tiles)
      place('resource_dust', tiles)
      const range = pickSquadRange(['Easy'], RMG_GUARD_DIFFICULTY_RANGES, RMG_GUARD_RANDOM_WEIGHTS, rng)
      // PLAYER_ZONE_GUARD_MULTIPLIER: real RMG templates' own spawn-zone
      // guardMultiplier (0.5-0.84) softens guards in the player's own start
      // zone specifically — guard-value-bands.ts's own doc comment has the
      // full rationale.
      placeGuard(
        tiles,
        Math.round(randomInRange(range.min, range.max, rng) * PLAYER_ZONE_GUARD_MULTIPLIER),
        sampleFraction(biome, 0.8, rng),
        guardCutoffValueByZoneId?.get(zone.id) ?? GUARD_VALUE_CUTOFF,
      )
    } else {
      // Runner-up milestone: this zone's own real per-sid caps (if any),
      // layered on top of the map-wide `contentCountLimitBySid` above —
      // reset fresh per zone since a cap here is scoped to just this zone.
      currentZoneContentLimitBySid = new Map((contentCountLimitsByZoneId?.get(zone.id) ?? []).map((l) => [l.sid, l.maxCount]))
      currentZoneContentSoFar = new Map()
      const mandatorySids = mandatoryContentSidsByZoneId?.get(zone.id)
      const preferredTreasureSids = mandatorySids && mandatorySids.length > 0 ? new Set(mandatorySids) : undefined

      const mineSid = MINE_SIDS[mineIndex % MINE_SIDS.length]
      place(mineSid, tiles)
      mineIndex += 1

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
      const baseTreasureCount = 1 + Math.floor(tiles.length / 150)

      // Value-budget spend-down (Olden Era's own real RMG templates' own
      // `guardedContentValue`/`resourcesValue` + `*PerArea` concept —
      // guard-value-bands.ts's sibling doc comment... see RARITY_TABLE
      // above): rather than looping a FIXED item count, spend a budget sized
      // so the EXPECTED iteration count matches this generator's own already
      // real-map-calibrated density (`baseTreasureCount`'s own doc comment
      // above still holds — this is the same target, spent probabilistically
      // instead of deterministically) — `RARITY_AVERAGE_COST` is exactly the
      // expected cost of one `placeTreasure` call, so `budget /
      // RARITY_AVERAGE_COST` reproduces `baseTreasureCount * treasureDensity`
      // on average, while richer zones now more often roll a few pricier
      // (rarer) items instead of only ever adding more identical ones.
      // `treasureScale`: this zone's own real `resourcesValue` relative to
      // its neutral-zone siblings (see `medianResourceValue` above) — a
      // "Poor" template zone gets proportionally less, a "Rich" one
      // proportionally more, clamped to a sane range so one extreme outlier
      // zone can't blow the loop's iteration budget. Stays exactly 1 (no
      // change) whenever no template provided this data.
      const zoneResourceValue = zoneContentValueByZoneId?.get(zone.id)?.resourcesValue
      const treasureScale = medianResourceValue !== undefined && zoneResourceValue !== undefined
        ? Math.min(2.5, Math.max(0.4, zoneResourceValue / medianResourceValue))
        : 1
      const treasureBudget = Math.max(0, baseTreasureCount * treasureDensity * treasureScale) * RARITY_AVERAGE_COST
      const usedArtifactSids = new Set<string>()
      let spent = 0
      let iterations = 0
      while (spent < treasureBudget && iterations < 400) {
        spent += placeTreasure(tiles, usedArtifactSids, preferredTreasureSids)
        iterations++
      }

      // The guard's value comes from the mine's own real guard-value data
      // when available (value-model.ts, scaled up to real hand-crafted maps'
      // own median guard-value band — see that file's own doc comment) —
      // not a flat difficulty-band roll — so a gold mine is still defended
      // harder than a wood mine, matching the real game's own economic
      // weighting, falling back to the same flat roll only if this Core.zip
      // has no matching objects_logic entry for some reason.
      //
      // Runner-up milestone: when a real imported template gives THIS zone
      // its own `guardedContentValue`, that takes priority over both —
      // it's the template author's own explicit difficulty design for this
      // specific zone, more authoritative than this generator's generic
      // per-resource heuristic. Clamped into RMG_GUARD_DIFFICULTY_RANGES'
      // own overall span (400-150000, the same real-map-calibrated band
      // guard-value-bands.ts already uses everywhere else) since a real
      // template's own value scale is confirmed to match this generator's
      // guard `requestedValue` units (both top out in the low hundreds of
      // thousands) — unlike `resourcesValue` above, which has no comparably
      // scaled destination in this generator's own data model and so is
      // only ever used as a relative multiplier, never directly.
      const fallbackRange = pickSquadRange(['Random'], RMG_GUARD_DIFFICULTY_RANGES, RMG_GUARD_RANDOM_WEIGHTS, rng)
      const templateGuardedValue = zoneContentValueByZoneId?.get(zone.id)?.guardedContentValue
      const requestedValue = templateGuardedValue !== undefined
        ? Math.min(guardValueBandMax, Math.max(guardValueBandMin, Math.round(templateGuardedValue)))
        : mineGuardValue(mineSid, objectLogicsById) ?? randomInRange(fallbackRange.min, fallbackRange.max, rng)
      placeGuard(tiles, requestedValue, sampleFraction(biome, 0.5, rng), guardCutoffValueByZoneId?.get(zone.id) ?? GUARD_VALUE_CUTOFF)
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
      place('random-city', tiles, undefined, undefined, { factionSid, spawnHero })
    }
  }

  return { placements, concreteSquads }
}
