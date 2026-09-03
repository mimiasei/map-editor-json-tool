// ─── RMG zone population (issue #210, Milestone 1) ──────────────────────────
// Collision-aware object scattering per zone — the composition issue #210
// flagged as missing entirely: none of this codebase's existing scatter
// samplers (fuzzy-obstacle.ts, interactable-pool.ts) consult a real
// footprint/blocked-tile model before proposing a placement. This module
// does: every candidate anchor is checked against the same `nodes[]`
// footprint data footprint.ts/passability.ts already use for real placed
// objects, and accepted only if its solid (`value===1`) cells don't overlap
// anything already placed this generation pass.
//
// Each player zone gets a starting dwelling (its own faction's tier-1
// creature) + a home resource mine (wood/ore, alternating) + one light
// guard. Each neutral zone gets a resource mine (cycling through all 6
// real resource types) + a random-item pickup + one guard rolled from the
// full difficulty spread — the "treasure zone" VCMI's own template format
// calls this same role. Deliberately modest per-zone content (1-3 objects)
// for this milestone; a real value-budget economy is Milestone 2's job
// (issue #210).

import type { CatalogMapObject } from '@/lib/catalog/types'
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

interface PlacementState {
  blocked: Set<number>
  usedAnchors: Set<number>
  nextTempId: number
}

/** Try up to `maxAttempts` random tiles from `zoneTiles` for `sid`'s anchor,
 *  accepting the first whose footprint (a) stays in map bounds and (b), for
 *  a normally-blocking sid, doesn't overlap any solid cell already claimed
 *  this pass. `random-squad`/`random-item`/`random-res` are walked-onto-to-
 *  interact placeholders (`NON_BLOCKING_SPAWNER_SIDS`, same rule
 *  passability.ts's real blocked-tile computation uses) so their own solid
 *  cells never block a later placement — but they still claim their own
 *  anchor tile so two objects never land exactly on top of each other.
 *  Returns `null` if nothing fits within `maxAttempts` — a disclosed
 *  degrade for a small/crowded zone, not a silent invariant violation. */
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
  const template = catalogById.get(sid)
  const nonBlocking = NON_BLOCKING_SPAWNER_SIDS.has(sid)
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const node = zoneTiles[Math.floor(rng() * zoneTiles.length)]
    if (state.usedAnchors.has(node)) continue
    const x = node % sizeX
    const z = Math.floor(node / sizeX)
    const cells = computeFootprintTiles(template, x, z)
    let ok = true
    for (const cell of cells) {
      if (cell.x < 0 || cell.x >= sizeX || cell.z < 0 || cell.z >= sizeZ) { ok = false; break }
      if (!nonBlocking && cell.value === 1 && state.blocked.has(cell.z * sizeX + cell.x)) { ok = false; break }
    }
    if (!ok) continue
    state.usedAnchors.add(node)
    if (!nonBlocking) {
      for (const cell of cells) {
        if (cell.value === 1) state.blocked.add(cell.z * sizeX + cell.x)
      }
    }
    return node
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
  /** Anchors/footprint cells already claimed before population starts (the
   *  player spawners placed via `buildBlankMap`) — seeded in so scatter
   *  placement never lands on top of them. */
  seedBlocked: Set<number>
  seedAnchors: Set<number>
  rng: () => number
}

/** Scatter each zone's own objects (see this file's header comment for what
 *  each zone kind gets), tracking collisions across the WHOLE map as it
 *  goes — not just within one zone — so a player zone's dwelling can never
 *  overlap a neighboring neutral zone's mine even where Voronoi boundaries
 *  run close together. */
export function populateZones(options: PopulateZonesOptions): ZonePlacement[] {
  const { sizeX, sizeZ, zones, tilesByZone, zoneBiome, catalogById, seedBlocked, seedAnchors, rng } = options
  const state: PlacementState = { blocked: new Set(seedBlocked), usedAnchors: new Set(seedAnchors), nextTempId: 0 }
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
      place(MINE_SIDS[mineIndex % MINE_SIDS.length], tiles)
      mineIndex += 1
      place('random-item', tiles)
      const range = pickSquadRange(['Random'], DEFAULT_SQUAD_DIFFICULTY_RANGES, DEFAULT_SQUAD_RANDOM_WEIGHTS, rng)
      place('random-squad', tiles, {
        requestedValue: randomInRange(range.min, range.max, rng),
        fraction: sampleFraction(biome, 0.5, rng),
      })
    }
  }

  return placements
}
