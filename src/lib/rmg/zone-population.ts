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

import type { CatalogMapObject, CatalogObjectLogic } from '@/lib/catalog/types'
import type { BiomeId } from '@/lib/map-grid/terrain-colors'
import { computeFootprintTiles } from '@/lib/map-grid/footprint'
import { NON_BLOCKING_SPAWNER_SIDS } from '@/lib/map-grid/passability'
import {
  BIOME_FACTION,
  DEFAULT_SQUAD_DIFFICULTY_RANGES,
  DEFAULT_SQUAD_RANDOM_WEIGHTS,
  pickSquadRange,
  randomInRange,
  sampleFraction,
} from '@/lib/map-grid/squad-pool'
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

/** Zones only ever cycle through these 6 real faction biomes — never Sand
 *  (biome 2), which CLAUDE.md confirms no faction natively occupies, so
 *  `dwellingFactionToken` always resolves a zone's own real faction rather
 *  than the neutral-dwelling fallback. */
export const ZONE_BIOMES: BiomeId[] = [1, 3, 4, 5, 6, 7]

/** Cycles player zones and neutral zones through `ZONE_BIOMES` with two
 *  INDEPENDENT counters, not a single `zone.id % 6` — `buildZoneGraph`'s
 *  ring gives every player zone an even id and every neutral zone an odd
 *  one, and since 6 is itself even, `id % 6` on a strictly-even or
 *  strictly-odd sequence only ever lands on 3 of the 6 residues (confirmed
 *  the hard way: an earlier version of this function used `zone.id % 6`
 *  directly and every generated map's player zones only ever got
 *  human/unfrozen/demon dwellings — 3 of 6 factions, never
 *  necropolis/nature/dungeon, no matter the player count). Independent
 *  counters make each kind cycle through all 6 factions on its own. */
export function assignZoneBiomes(zones: ZoneSpec[]): Map<number, BiomeId> {
  const biomeByZone = new Map<number, BiomeId>()
  let playerIndex = 0
  let neutralIndex = 0
  for (const zone of zones) {
    const index = zone.kind === 'player' ? playerIndex++ : neutralIndex++
    biomeByZone.set(zone.id, ZONE_BIOMES[index % ZONE_BIOMES.length])
  }
  return biomeByZone
}

export interface ZonePlacement {
  tempId: number
  sid: string
  node: number
  randomSquadOverrides?: { requestedValue: number; fraction: string }
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
 *  zone" placement) is built on top of it. */
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
      if (cell.value === 1) state.blocked.add(cell.z * sizeX + cell.x)
    }
  }
  return true
}

/** Try up to `maxAttempts` random tiles from `zoneTiles` for `sid`'s anchor,
 *  accepting the first `tryPlaceAt` accepts. Returns `null` if nothing fits
 *  within `maxAttempts` — a disclosed degrade for a small/crowded zone, not
 *  a silent invariant violation. */
function tryPlace(
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
}

/** Scatter each zone's own objects (see this file's header comment for what
 *  each zone kind gets), tracking collisions across the WHOLE map as it
 *  goes — not just within one zone — so a player zone's dwelling can never
 *  overlap a neighboring neutral zone's mine even where Voronoi boundaries
 *  run close together. */
export function populateZones(options: PopulateZonesOptions): ZonePlacement[] {
  const { sizeX, sizeZ, zones, tilesByZone, zoneBiome, catalogById, objectLogicsById, state, rng } = options
  const placements: ZonePlacement[] = []

  const place = (sid: string, tiles: number[], randomSquadOverrides?: ZonePlacement['randomSquadOverrides']): void => {
    const node = tryPlace(sid, tiles, sizeX, sizeZ, catalogById, state, rng)
    if (node === null) return
    placements.push({ tempId: state.nextTempId++, sid, node, randomSquadOverrides })
  }

  let mineIndex = 0
  for (const zone of zones) {
    const tiles = tilesByZone.get(zone.id) ?? []
    if (tiles.length === 0) continue
    const biome = zoneBiome.get(zone.id) ?? ZONE_BIOMES[0]

    if (zone.kind === 'player') {
      place(`barracks_${dwellingFactionToken(biome)}_1`, tiles)
      place(mineIndex % 2 === 0 ? 'mine_wood' : 'mine_ore', tiles)
      mineIndex += 1
      const range = pickSquadRange(['Easy'], DEFAULT_SQUAD_DIFFICULTY_RANGES, DEFAULT_SQUAD_RANDOM_WEIGHTS, rng)
      place('random-squad', tiles, {
        requestedValue: randomInRange(range.min, range.max, rng),
        fraction: sampleFraction(biome, 0.8, rng),
      })
    } else {
      const mineSid = MINE_SIDS[mineIndex % MINE_SIDS.length]
      place(mineSid, tiles)
      mineIndex += 1

      // Per-zone treasure density: bigger Voronoi regions (more tiles) get
      // proportionally more treasure piles, capped so a huge zone doesn't
      // spend an unreasonable number of placement attempts — issue #210's
      // own "per-zone treasure density tuning" milestone item.
      const treasureCount = Math.min(5, 1 + Math.floor(tiles.length / 150))
      for (let i = 0; i < treasureCount; i++) place('random-item', tiles)

      // The guard's value comes from the mine's own real guard-value data
      // when available (value-model.ts) — not a flat difficulty-band roll —
      // so a gold mine (guard value 3000) is defended harder than a wood
      // mine (2000), matching the real game's own economic weighting,
      // falling back to the same flat roll Milestone 1 always used only if
      // this Core.zip has no matching objects_logic entry for some reason.
      const fallbackRange = pickSquadRange(['Random'], DEFAULT_SQUAD_DIFFICULTY_RANGES, DEFAULT_SQUAD_RANDOM_WEIGHTS, rng)
      const requestedValue = mineGuardValue(mineSid, objectLogicsById) ?? randomInRange(fallbackRange.min, fallbackRange.max, rng)
      place('random-squad', tiles, {
        requestedValue,
        fraction: sampleFraction(biome, 0.5, rng),
      })
    }
  }

  return placements
}
