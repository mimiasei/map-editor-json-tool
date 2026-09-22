// ─── RMG ambient decoration: animals + fxs (issue #210 follow-up) ──────────
// Real handcrafted maps place both `animals` and `fxs` category objects as
// pure, non-blocking visual decoration — a real gap this generator never
// covered (it only ever scattered `environments`, via zone-decoration.ts).
// Densities/weights below are measured directly against a survey of 22 real
// maps/*.map files this session (gzip+varint decode, per-sid node counts
// cross-referenced against each node's own `tilesMap`/`waterMap` value):
//
// - ~7.07 non-fish animal instances per 1000 LAND tiles.
// - `fish` ignores its own catalog `biome: Grass` tag entirely — placement
//   was 100% water-tile-driven in every sample checked, so it's scattered
//   at ~2.35 instances per 1000 WATER tiles instead, independent of biome.
// - Desert/Snow/Lava animals (camel/scarab/scorpion, lesser_shoggoth/
//   penguin, lava_snails) cluster tightly on their own catalog biome in
//   real maps; "temperate" animals (chickens/pigs/rams/mushroom_cow) spread
//   loosely across several biomes despite a declared home biome; `birds*`
//   (no catalog biome at all) go anywhere. `HOME_BIOME_WEIGHT` below is a
//   single loose bias reproducing that mixed pattern without hand-tuning
//   each of the 27 non-fish/bird sids individually.
// - ~10.66 approved-fx instances per 1000 TOTAL tiles, at the real relative
//   frequency `FX_WEIGHTS` records (fx_fog alone is ~47% of all real
//   placements). fx carry no biome/tag data at all, so there's no biome
//   bucketing for them — pure uniform-by-weight, anywhere on the map.
//   `fx_map_fire` is excluded per explicit user direction (reserved for
//   story-driven/hand-authored placement, not blind generation) even
//   though it showed a real, exclusive Lava correlation in the survey;
//   `fx_map_smoke` was checked the same way and found spread across six
//   biomes, not lava-exclusive like fire, so it's kept in the general
//   ambient set. Quest-mark/editor-marker fx sids are never placed here —
//   they're UI/quest-linked, not decoration.

import type { CatalogMapObject } from '@/lib/catalog/types'
import type { BiomeId } from '@/lib/map-grid/terrain-colors'
import { buildAnimalPools } from '@/lib/map-grid/fuzzy-obstacle'
import { tryPlaceAt, isRotationallySymmetricFootprint, type PlacementState, type ZonePlacement } from './zone-population'
import { randomDecorRotation } from '@/lib/h3-import/scenery-clusters'
import type { ZoneSpec } from './zone-graph'

// Land animals go through `tryPlaceAt`'s real collision check (unlike fish/
// fx below), so a meaningful share of rolls land on a tile some other real
// placement/obstacle/road already claimed — a real regeneration/stats pass
// measured ~29% loss at this generator's own default density settings.
// 10.0 (not the raw real-map figure, 7.07) compensates for that loss so
// the FINAL placed count still lands on the real per-1000-land-tile ratio
// — the same "calibrate the input for known downstream loss" approach
// this generator's own `baseTreasureCount` doc comment already documents
// for treasure placement.
const ANIMAL_PER_1000_LAND_TILES = 10.0
const FISH_PER_1000_WATER_TILES = 2.35
const FX_PER_1000_TOTAL_TILES = 10.66

/** Non-fish/bird animal candidates from the target zone's own biome are
 *  weighted this many times over an animal whose home biome is elsewhere —
 *  a single loose bias standing in for per-sid tuning (see this file's own
 *  header comment). */
const HOME_BIOME_WEIGHT = 4
/** Chance a land-animal roll draws from the biome-less `birds*` pool
 *  instead of a biome-weighted pick — real samples show `birds*` present
 *  in most decorated maps regardless of biome mix. */
const UNIVERSAL_ANIMAL_CHANCE = 0.3

const ALL_BIOME_IDS: BiomeId[] = [1, 2, 3, 4, 5, 6, 7]

/** Real relative frequency of each approved fx sid across this session's
 *  22-map survey — used as sampling weights so the generated mix matches
 *  what real maps actually favor (fog dominant, fireflies split most of
 *  the rest, smoke/light-sky/map-light real but minor). */
const FX_WEIGHTS: Record<string, number> = {
  fx_fog: 674,
  fx_fireflies_blue: 274,
  fx_fireflies_yellow: 204,
  fx_fireflies_red: 97,
  fx_fireflies_purple: 83,
  fx_map_smoke: 51,
  fx_light_sky: 36,
  fx_map_light: 13,
}
const FX_SIDS = Object.keys(FX_WEIGHTS)
const FX_TOTAL_WEIGHT = Object.values(FX_WEIGHTS).reduce((a, b) => a + b, 0)

/** Every sid this module can legitimately place ON a water tile — `fish`
 *  plus every approved fx sid (fog/fireflies/etc. render fine over water in
 *  real maps too). Exported so `reclaimWaterCollisions`'s own "an object
 *  ended up on water by mistake" sweep (zone-validation.ts) can exempt
 *  these — without this, it can't tell "we deliberately put you there"
 *  apart from a real mistake, and would drain the water out from under
 *  every fish/fx this module places. */
export const WATER_COMPATIBLE_FAUNA_SIDS = new Set<string>(['fish', ...FX_SIDS])

function pickWeightedFxSid(rng: () => number): string {
  let roll = rng() * FX_TOTAL_WEIGHT
  for (const sid of FX_SIDS) {
    const weight = FX_WEIGHTS[sid]
    if (roll < weight) return sid
    roll -= weight
  }
  return FX_SIDS[0]
}

function pickWeightedAnimalSid(byBiome: Record<BiomeId, string[]>, biome: BiomeId, rng: () => number): string | null {
  const home = byBiome[biome] ?? []
  const others = ALL_BIOME_IDS.filter((b) => b !== biome).flatMap((b) => byBiome[b] ?? [])
  const totalWeight = home.length * HOME_BIOME_WEIGHT + others.length
  if (totalWeight === 0) return null
  let roll = rng() * totalWeight
  if (roll < home.length * HOME_BIOME_WEIGHT) return home[Math.floor(roll / HOME_BIOME_WEIGHT)]
  roll -= home.length * HOME_BIOME_WEIGHT
  return others[Math.floor(roll)] ?? null
}

export interface ScatterZoneFaunaOptions {
  sizeX: number
  sizeZ: number
  zones: ZoneSpec[]
  tilesByZone: Map<number, number[]>
  zoneBiome: Map<number, BiomeId>
  waterNodes: Set<number>
  catalogById: Map<string, CatalogMapObject>
  mapObjects: CatalogMapObject[]
  /** Road/river tiles — excluded from candidacy the same way
   *  `scatterZoneObstacles` already does, since these placements are all
   *  non-blocking and so would never be caught by `state.blocked`'s own
   *  solid-cell check otherwise. */
  excludedNodes: Set<number>
  state: PlacementState
  rng: () => number
}

/** Scatters `animals`/approved `fxs` category decoration across every zone
 *  (player and neutral alike — real maps don't reserve this for neutral
 *  territory) at real-map-calibrated density. Runs a single pass per tile
 *  (not a subsampled-candidate-then-fuzzy-sample two-step like
 *  `scatterZoneObstacles` — these densities are already low enough that a
 *  direct per-tile roll is simplest and keeps the real ratios exact). */
export function scatterZoneFauna(options: ScatterZoneFaunaOptions): ZonePlacement[] {
  const { sizeX, sizeZ, zones, tilesByZone, zoneBiome, waterNodes, catalogById, mapObjects, excludedNodes, state, rng } = options
  const { byBiome, fish, universal } = buildAnimalPools(mapObjects)
  const placements: ZonePlacement[] = []

  // Same "randomize decorative rotation, never for an asymmetric footprint"
  // rule as zone-decoration.ts / the H3 importer's randomDecorRotation.
  const pickRotation = (sid: string): number | undefined =>
    isRotationallySymmetricFootprint(sid, catalogById) ? randomDecorRotation(rng) : undefined

  // Land animals need real collision checking (tryPlaceAt/state.blocked) —
  // they're standing creatures that shouldn't overlap a mine/dwelling/guard.
  const placeLandAnimal = (sid: string, node: number): void => {
    if (!tryPlaceAt(sid, node, sizeX, sizeZ, catalogById, state)) return
    placements.push({ tempId: state.nextTempId++, sid, node, rotation: pickRotation(sid) })
  }

  // Fish and fx deliberately do NOT go through tryPlaceAt: real bug found
  // this session — `generate-random-map.ts` marks EVERY water tile as both
  // `state.blocked` AND `state.usedAnchors` right after water is carved (so
  // roads/buildings can never target it), which made `tryPlaceAt` reject
  // 100% of fish placements (its very first check is `usedAnchors.has`)
  // and silently undershoot fx too, since fx is meant to render on water
  // (fog/fireflies) and even overlap other decoration/objects — it's a
  // pure visual overlay, never a real "occupant" competing for a tile the
  // way a mine/dwelling/animal does. A tiny local set still stops two
  // fish (or two of the same fx roll) landing on the exact same tile.
  const fishNodes = new Set<number>()
  const fxNodes = new Set<number>()
  const placeOverlay = (occupied: Set<number>, sid: string, node: number): void => {
    if (occupied.has(node)) return
    occupied.add(node)
    placements.push({ tempId: state.nextTempId++, sid, node, rotation: pickRotation(sid) })
  }

  for (const zone of zones) {
    const tiles = tilesByZone.get(zone.id) ?? []
    if (tiles.length === 0) continue
    const biome = zoneBiome.get(zone.id) ?? 1

    for (const node of tiles) {
      if (excludedNodes.has(node)) continue

      if (waterNodes.has(node)) {
        if (fish.length > 0 && rng() < FISH_PER_1000_WATER_TILES / 1000) {
          placeOverlay(fishNodes, fish[Math.floor(rng() * fish.length)], node)
        }
      } else if (rng() < ANIMAL_PER_1000_LAND_TILES / 1000) {
        const sid = universal.length > 0 && rng() < UNIVERSAL_ANIMAL_CHANCE
          ? universal[Math.floor(rng() * universal.length)]
          : pickWeightedAnimalSid(byBiome, biome, rng)
        if (sid) placeLandAnimal(sid, node)
      }

      if (rng() < FX_PER_1000_TOTAL_TILES / 1000) {
        placeOverlay(fxNodes, pickWeightedFxSid(rng), node)
      }
    }
  }

  return placements
}
